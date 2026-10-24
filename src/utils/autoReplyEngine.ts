import log4js from 'log4js'
import type { IPublishPacket, MqttClient, OnMessageCallback } from 'mqtt'
import { getGlobalVariablesRevision } from '@/utils/configProfiles'
import { connectionVariableOptions } from '@/utils/payloadVariables'
import { applyAutoReplyVariableActions, markManualDisconnect, onConnectionClosed } from '@/utils/payloadVariables'
import { mightMatchIncomingTopic, planAutoReplies, PlannedAutoReply } from '@/utils/autoReply'
import { publishedPayloadType, savePublishedMessageHistory } from '@/utils/historyRecordUtils'
import { getMessageId } from '@/utils/idGenerator'
import time from '@/utils/time'

/**
 * Runs the automatic replies of a connection.
 *
 * Like the automatic subscriptions, this is device behaviour that belongs to the client rather than
 * to a page: a reply is published through the MQTT client of the connection that received the
 * message, so it also works while the user looks at another connection. Publishing through the
 * connection view was wrong in both directions - the reply left through whichever connection was
 * on screen, or was dropped with a "not connected" warning while the log still claimed a reply.
 */
export interface IncomingMessageInfo {
  connectionId: string
  /** client of that connection; the reply is published through it, not through the open page */
  client?: MqttClient
  topic: string
  payload: string | Buffer
  /** message id of the packet, used to answer a message only once */
  packetId?: number | null
}

/**
 * Loop guard: a reply that comes back to us must not trigger the rules again.
 *
 * The topic is checked first, so an incoming message on any other topic does not hash its payload.
 * The payload itself is stored as a hash: keeping the raw text made every reply retain a second
 * copy of a potentially large body for the whole TTL.
 */
const recentReplyTopics = new Map<string, number>()
const recentReplies = new Map<string, number>()
const RECENT_REPLY_TTL = 5000
let recentPruneAt = 0

/** Answers already sent for one received packet, keyed by `connectionId|topic|packetId|ruleId`. */
const answered = new Map<string, number>()
const ANSWERED_TTL = 60000
let answeredPruneAt = 0

/**
 * Delayed replies waiting to be published, per connection.
 *
 * A matching rule with a delay used to schedule a timer per message with no ceiling. A topic that
 * matches faster than the delay elapses piled those timers up, each one holding the payload, until
 * the renderer stalled. The cap drops the overflow; deleting or manually disconnecting the
 * connection cancels what is still waiting.
 */
const MAX_PENDING_DELAYED_REPLIES = 100
const pendingDelayed = new Map<string, Set<ReturnType<typeof setTimeout>>>()

/** Per connection rate limit, so a rule with a bad filter cannot flood the broker. */
const MAX_REPLIES_PER_SECOND = 20
const replyTimestamps = new Map<string, number[]>()

const records = new Map<string, ConnectionModel>()

/**
 * Normalized variable definitions per connection, cached for the hot path.
 *
 * A busy connection with reply rules normalizes its client + global variables on every received
 * message. The cache is keyed by the connection record object and validated against the global
 * variable revision (so editing a preset invalidates it) and the fields that feed the definitions;
 * it holds no state of its own, only the immutable definition objects.
 */
interface CachedVariableOptions {
  revision: number
  variablesRef: ConnectionModel['variables']
  clientId: string
  username: string
  name: string
  host: string
  port: number
  options: ReturnType<typeof connectionVariableOptions>
}
const variableOptionsCache = new WeakMap<ConnectionModel, CachedVariableOptions>()

const variableOptionsFor = (record: ConnectionModel): ReturnType<typeof connectionVariableOptions> => {
  const revision = getGlobalVariablesRevision()
  const cached = variableOptionsCache.get(record)
  if (
    cached &&
    cached.revision === revision &&
    cached.variablesRef === record.variables &&
    cached.clientId === record.clientId &&
    cached.username === record.username &&
    cached.name === record.name &&
    cached.host === record.host &&
    cached.port === record.port
  ) {
    return cached.options
  }
  const options = connectionVariableOptions(record)
  variableOptionsCache.set(record, {
    revision,
    variablesRef: record.variables,
    clientId: record.clientId,
    username: record.username,
    name: record.name,
    host: record.host,
    port: record.port,
    options,
  })
  return options
}

/**
 * Planning errors already logged, keyed by connection, rule and message.
 *
 * A broken rule (an unresolved variable in its topic/payload, an invalid echo JSON) fails on every
 * received message, so logging it per message would flood the log of a busy topic. It is reported
 * once and reported again after the rule was edited (`registerAutoReply` clears its keys).
 */
const reportedPlanErrors = new Set<string>()

const clearReportedPlanErrors = (connectionId: string): void => {
  const prefix = `${connectionId}|`
  reportedPlanErrors.forEach((key) => {
    if (key.startsWith(prefix)) {
      reportedPlanErrors.delete(key)
    }
  })
}

/**
 * The `'message'` handler this module keeps on each client, keyed by the client instance.
 *
 * The replies belong to the connection, not to the connection page: while they were attached from
 * the page, leaving it (settings, presets, ...) removed its listeners and the device silently
 * stopped answering although it still looked connected. They are attached next to the client, so
 * they survive page changes, and detached only when that client goes away.
 */
const attachedClients = new Map<MqttClient, { connectionId: string; handler: OnMessageCallback }>()

/**
 * Listeners told about every reply that went out, so the conversation view can render it.
 *
 * The engine publishes through the client directly, which the view cannot see: only the messages the
 * client receives and the ones the user publishes in the panel reach `renderMessage()`. Without this,
 * an automatic reply existed in the database but never appeared in the conversation, and with a delay
 * the effect was the most obvious - the answer was sent long after the question it belongs to.
 */
type AutoReplyPublishedListener = (connectionId: string, message: MessageModel) => void
const publishedListeners = new Set<AutoReplyPublishedListener>()

/** Subscribes to the replies that were published; returns the unsubscribe function. */
export const onAutoReplyPublished = (listener: AutoReplyPublishedListener): (() => void) => {
  publishedListeners.add(listener)
  return () => {
    publishedListeners.delete(listener)
  }
}

const notifyPublished = (connectionId: string, message: MessageModel) => {
  publishedListeners.forEach((listener) => {
    try {
      listener(connectionId, message)
    } catch (error) {
      getLog().error(`Auto reply listener failed: ${(error as Error).toString()}`)
    }
  })
}

const getLog = () => log4js.getLogger()

/**
 * Registers the rules of one connection. Called again whenever the connection is opened or edited,
 * so a rule change applies to the next received message without reconnecting.
 */
export const registerAutoReply = (connectionId: string, record: ConnectionModel): void => {
  records.set(connectionId, record)
  // The rules may have changed: a previously reported error is worth reporting again.
  clearReportedPlanErrors(connectionId)
}

/** Forgets a connection, e.g. when it is deleted. */
export const unregisterAutoReply = (connectionId: string): void => {
  records.delete(connectionId)
  resetAutoReplyState(connectionId)
  detachAutoReplyByConnection(connectionId)
}

/** The user disconnected on purpose: the next connect starts a new session, not a reconnect. */
export const markConnectionDisconnectedManually = (connectionId: string): void => {
  markManualDisconnect(connectionId)
  clearPendingDelayed(connectionId)
}

/**
 * Answers every message this client receives with the rules of its connection.
 *
 * Safe to call again for the same client: the handler is attached once and the connection id is
 * refreshed (the view calls this for the connection it opens, and the client outlives the view).
 */
export const attachAutoReply = (client: MqttClient, connectionId: string): void => {
  const existing = attachedClients.get(client)
  if (existing) {
    existing.connectionId = connectionId
    return
  }
  const handler: OnMessageCallback = (topic: string, payload: Buffer, packet: IPublishPacket) => {
    // Read the id from the map: a second attach refreshes it, and the closure would keep the first one.
    const currentId = attachedClients.get(client)?.connectionId
    if (!currentId) {
      return
    }
    processIncomingMessage({
      connectionId: currentId,
      client,
      topic,
      payload,
      packetId: packet?.messageId,
    }).catch((error) => getLog().error(`Auto reply failed: ${(error as Error).toString()}`))
  }
  attachedClients.set(client, { connectionId, handler })
  // The disconnect trigger of the stateful variables, next to the client so it also runs while no
  // connection page is open. The `connect` side (session clock, connect resets) runs in the
  // subscription runner, which is registered first so topics can already use the session.
  const onClose = () => {
    const current = attachedClients.get(client)?.connectionId
    const record = current ? records.get(current) : undefined
    if (record) {
      onConnectionClosed(record)
    }
  }
  client.on('close', onClose)
  ;(attachedClients.get(client) as { onClose?: () => void }).onClose = onClose
  client.on('message', handler)
  // `end` is the final teardown of a client. A `close` is not: mqtt.js reconnects the same instance
  // afterwards and the replies must keep working across those reconnects.
  client.once('end', () => detachAutoReply(client))
}

/** Removes the automatic-reply handler of a client; a no-op when it had none. */
export const detachAutoReply = (client: MqttClient): void => {
  const attached = attachedClients.get(client)
  if (!attached) {
    return
  }
  attachedClients.delete(client)
  clearPendingDelayed(attached.connectionId)
  client.removeListener('message', attached.handler)
  const onClose = (attached as { onClose?: () => void }).onClose
  if (onClose) {
    client.removeListener('close', onClose)
  }
}

/** Removes the handler of every client attached for this connection, e.g. when it is deleted. */
export const detachAutoReplyByConnection = (connectionId: string): void => {
  Array.from(attachedClients.entries()).forEach(([client, attached]) => {
    if (attached.connectionId === connectionId) {
      detachAutoReply(client)
    }
  })
}

/** FNV-1a plus the length, so the loop guard does not retain the payload text. */
const payloadKey = (topic: string, payload: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${topic}\u0000${payload.length}\u0000${hash >>> 0}`
}

const pruneMap = (map: Map<string, number>, ttl: number) => {
  const now = Date.now()
  map.forEach((stamp, key) => {
    if (now - stamp > ttl) {
      map.delete(key)
    }
  })
}

const pruneRecentReplies = () => {
  const now = Date.now()
  if (now - recentPruneAt < 1000) {
    return
  }
  recentPruneAt = now
  pruneMap(recentReplies, RECENT_REPLY_TTL)
  pruneMap(recentReplyTopics, RECENT_REPLY_TTL)
}

const isRecentReply = (topic: string, payload: string): boolean => {
  const stamp = recentReplyTopics.get(topic)
  if (stamp === undefined || Date.now() - stamp > RECENT_REPLY_TTL) {
    return false
  }
  pruneRecentReplies()
  return recentReplies.has(payloadKey(topic, payload))
}

const markReply = (topic: string, payload: string) => {
  const now = Date.now()
  recentReplyTopics.set(topic, now)
  recentReplies.set(payloadKey(topic, payload), now)
}

const clearPendingDelayed = (connectionId: string) => {
  const timers = pendingDelayed.get(connectionId)
  if (!timers) {
    return
  }
  timers.forEach((timer) => clearTimeout(timer))
  pendingDelayed.delete(connectionId)
}

/** `false` when this connection already has too many replies waiting on their delay. */
const scheduleDelayedReply = (connectionId: string, delayMs: number, run: () => void): boolean => {
  let timers = pendingDelayed.get(connectionId)
  if (!timers) {
    timers = new Set()
    pendingDelayed.set(connectionId, timers)
  }
  if (timers.size >= MAX_PENDING_DELAYED_REPLIES) {
    return false
  }
  const timer = setTimeout(() => {
    const current = pendingDelayed.get(connectionId)
    current?.delete(timer)
    if (current && current.size === 0) {
      pendingDelayed.delete(connectionId)
    }
    run()
  }, delayMs)
  timers.add(timer)
  return true
}

const takeReplyBudget = (connectionId: string): boolean => {
  const now = Date.now()
  const stamps = (replyTimestamps.get(connectionId) ?? []).filter((stamp) => now - stamp < 1000)
  if (stamps.length >= MAX_REPLIES_PER_SECOND) {
    replyTimestamps.set(connectionId, stamps)
    return false
  }
  stamps.push(now)
  replyTimestamps.set(connectionId, stamps)
  return true
}

const alreadyAnswered = (key: string): boolean => {
  const now = Date.now()
  if (now - answeredPruneAt >= 1000) {
    answeredPruneAt = now
    pruneMap(answered, ANSWERED_TTL)
  }
  return answered.has(key)
}

/** Drops every bit of state of a connection, e.g. when it is deleted or disconnected. */
const resetAutoReplyState = (connectionId: string): void => {
  clearReportedPlanErrors(connectionId)
  clearPendingDelayed(connectionId)
  replyTimestamps.delete(connectionId)
  answered.forEach((_stamp, key) => {
    if (key.startsWith(`${connectionId}|`)) {
      answered.delete(key)
    }
  })
}

/**
 * Entry point of the automatic replies: called for every message the connection receives.
 *
 * The rules of the connection are matched against the raw payload, so a reply is built from what the
 * server actually sent, not from a payload the user script or a schema already transformed.
 */
export const processIncomingMessage = async (info: IncomingMessageInfo): Promise<void> => {
  try {
    const record = records.get(info.connectionId)
    const rules = record?.autoReplies
    if (!record || !Array.isArray(rules) || !rules.length) {
      return
    }
    const variableOptions = variableOptionsFor(record)
    if (
      !mightMatchIncomingTopic(rules, info.topic, {
        ...variableOptions,
        topic: info.topic,
      })
    ) {
      return
    }
    const payloadText = typeof info.payload === 'string' ? info.payload : info.payload.toString()
    if (isRecentReply(info.topic, payloadText)) {
      // Our own reply came back: answering it would start a loop.
      return
    }
    const replies = planAutoReplies(rules, {
      topic: info.topic,
      payload: payloadText,
      ...variableOptions,
    })
    if (!replies.length) {
      return
    }
    for (const reply of replies) {
      if (reply.error) {
        const errorKey = `${info.connectionId}|${reply.ruleId}|${reply.error}`
        if (!reportedPlanErrors.has(errorKey)) {
          reportedPlanErrors.add(errorKey)
          getLog().warn(`Auto reply rule ${reply.ruleId} skipped: ${reply.error} (connection ${info.connectionId})`)
        }
        continue
      }
      const answeredKey = `${info.connectionId}|${info.topic}|${info.packetId ?? ''}|${reply.ruleId}`
      if (info.packetId !== undefined && info.packetId !== null && alreadyAnswered(answeredKey)) {
        continue
      }
      // A matched rule may reset variables or capture fields of the message for later messages.
      applyAutoReplyVariableActions(record, reply.actions)
      if (reply.delayMs > 0) {
        const scheduled = scheduleDelayedReply(info.connectionId, reply.delayMs, () => {
          publishReply(info, reply).catch((error) =>
            getLog().error(`Auto reply failed: ${(error as Error).toString()}`),
          )
        })
        if (!scheduled) {
          getLog().warn(
            `Auto reply ${reply.ruleId} skipped: too many delayed replies are waiting (connection ${info.connectionId})`,
          )
          continue
        }
      } else {
        await publishReply(info, reply)
      }
      if (info.packetId !== undefined && info.packetId !== null) {
        answered.set(answeredKey, Date.now())
      }
    }
  } catch (error) {
    getLog().error(`Auto reply failed: ${(error as Error).toString()}`)
  }
}

/**
 * Publishes one planned reply through the client of the message's own connection.
 *
 * Returns without publishing when that connection is gone, is not connected or has used up its
 * reply budget; the caller never logs a success it did not observe.
 */
const publishReply = async (info: IncomingMessageInfo, reply: PlannedAutoReply): Promise<void> => {
  const client = info.client
  if (!client) {
    getLog().warn(`Auto reply ${reply.ruleId} skipped: no client for connection ${info.connectionId}`)
    return
  }
  if (!client.connected) {
    getLog().warn(`Auto reply ${reply.ruleId} skipped: connection ${info.connectionId} is not connected`)
    return
  }
  if (!takeReplyBudget(info.connectionId)) {
    getLog().warn(`Auto reply ${reply.ruleId} skipped: too many replies per second (connection ${info.connectionId})`)
    return
  }

  const message: MessageModel = {
    id: getMessageId(),
    topic: reply.topic,
    payload: reply.payload,
    qos: reply.qos,
    retain: reply.retain,
    createAt: time.getNowDate(),
    out: true,
  }
  try {
    await new Promise<void>((resolve, reject) => {
      client.publish(reply.topic, reply.payload, { qos: reply.qos, retain: reply.retain }, (error?: Error) => {
        error ? reject(error) : resolve()
      })
    })
  } catch (error) {
    getLog().error(`Auto reply ${reply.ruleId} could not be published: ${(error as Error).toString()}`)
    return
  }
  // The reply is on the wire: show it in the conversation and arm the loop guard before touching
  // storage, so a database problem cannot swallow a message the broker already has.
  notifyPublished(info.connectionId, message)
  markReply(reply.topic, reply.payload)
  getLog().info(
    `Auto replied to ${info.topic} with ${reply.topic} (rule ${reply.ruleId}, connection ${info.connectionId})`,
  )
  try {
    await savePublishedMessageHistory(
      info.connectionId,
      message,
      reply.payload,
      publishedPayloadType(reply.payload),
      reply.topic,
    )
  } catch (error) {
    getLog().error(`Auto reply ${reply.ruleId} could not be saved: ${(error as Error).toString()}`)
  }
}
