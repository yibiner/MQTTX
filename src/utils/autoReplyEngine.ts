import log4js from 'log4js'
import type { IPublishPacket, MqttClient, OnMessageCallback } from 'mqtt'
import { getGlobalVariableMap } from '@/utils/configProfiles'
import { connectionFieldVariables, mergeVariables } from '@/utils/payloadVariables'
import { planAutoReplies, PlannedAutoReply } from '@/utils/autoReply'
import { savePublishedMessageHistory } from '@/utils/historyRecordUtils'
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

/** Loop guard: a reply that comes back to us must not trigger the rules again. */
const recentReplies = new Map<string, number>()
const RECENT_REPLY_TTL = 5000

/** Answers already sent for one received packet, keyed by `connectionId|topic|packetId|ruleId`. */
const answered = new Map<string, number>()
const ANSWERED_TTL = 60000

/** Per connection rate limit, so a rule with a bad filter cannot flood the broker. */
const MAX_REPLIES_PER_SECOND = 20
const replyTimestamps = new Map<string, number[]>()

const records = new Map<string, ConnectionModel>()

/**
 * The `'message'` handler this module keeps on each client, keyed by the client instance.
 *
 * The replies belong to the connection, not to the connection page: while they were attached from
 * the page, leaving it (settings, presets, ...) removed its listeners and the device silently
 * stopped answering although it still looked connected. They are attached next to the client, so
 * they survive page changes, and detached only when that client goes away.
 */
const attachedClients = new Map<MqttClient, { connectionId: string; handler: OnMessageCallback }>()

const getLog = () => log4js.getLogger()

/**
 * Registers the rules of one connection. Called again whenever the connection is opened or edited,
 * so a rule change applies to the next received message without reconnecting.
 */
export const registerAutoReply = (connectionId: string, record: ConnectionModel): void => {
  records.set(connectionId, record)
}

/** Forgets a connection, e.g. when it is deleted. */
export const unregisterAutoReply = (connectionId: string): void => {
  records.delete(connectionId)
  resetAutoReplyState(connectionId)
  detachAutoReplyByConnection(connectionId)
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
    processIncomingMessage({
      connectionId,
      client,
      topic,
      payload,
      packetId: packet?.messageId,
    }).catch((error) => getLog().error(`Auto reply failed: ${(error as Error).toString()}`))
  }
  attachedClients.set(client, { connectionId, handler })
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
  client.removeListener('message', attached.handler)
}

/** Removes the handler of every client attached for this connection, e.g. when it is deleted. */
export const detachAutoReplyByConnection = (connectionId: string): void => {
  Array.from(attachedClients.entries()).forEach(([client, attached]) => {
    if (attached.connectionId === connectionId) {
      detachAutoReply(client)
    }
  })
}

const keyOf = (topic: string, payload: string): string => `${topic}\u0000${payload}`

const pruneMap = (map: Map<string, number>, ttl: number) => {
  const now = Date.now()
  map.forEach((stamp, key) => {
    if (now - stamp > ttl) {
      map.delete(key)
    }
  })
}

const isRecentReply = (topic: string, payload: string): boolean => {
  pruneMap(recentReplies, RECENT_REPLY_TTL)
  return recentReplies.has(keyOf(topic, payload))
}

const markReply = (topic: string, payload: string) => {
  recentReplies.set(keyOf(topic, payload), Date.now())
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
  pruneMap(answered, ANSWERED_TTL)
  return answered.has(key)
}

/** Drops every bit of state of a connection, e.g. when it is deleted or disconnected. */
const resetAutoReplyState = (connectionId: string): void => {
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
    if (!Array.isArray(rules) || !rules.length) {
      return
    }
    const payloadText = typeof info.payload === 'string' ? info.payload : info.payload.toString()
    if (isRecentReply(info.topic, payloadText)) {
      // Our own reply came back: answering it would start a loop.
      return
    }
    const variables = mergeVariables(record?.variables, getGlobalVariableMap(), connectionFieldVariables(record))
    const replies = planAutoReplies(rules, { topic: info.topic, payload: payloadText, variables })
    if (!replies.length) {
      return
    }
    for (const reply of replies) {
      if (reply.error) {
        getLog().warn(`Auto reply rule ${reply.ruleId} skipped: ${reply.error} (connection ${info.connectionId})`)
        continue
      }
      const answeredKey = `${info.connectionId}|${info.topic}|${info.packetId ?? ''}|${reply.ruleId}`
      if (info.packetId !== undefined && info.packetId !== null && alreadyAnswered(answeredKey)) {
        continue
      }
      if (reply.delayMs > 0) {
        setTimeout(() => {
          publishReply(info, reply).catch((error) =>
            getLog().error(`Auto reply failed: ${(error as Error).toString()}`),
          )
        }, reply.delayMs)
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
    await savePublishedMessageHistory(info.connectionId, message, reply.payload, 'JSON', reply.topic)
    markReply(reply.topic, reply.payload)
    getLog().info(
      `Auto replied to ${info.topic} with ${reply.topic} (rule ${reply.ruleId}, connection ${info.connectionId})`,
    )
  } catch (error) {
    getLog().error(`Auto reply ${reply.ruleId} could not be published: ${(error as Error).toString()}`)
  }
}
