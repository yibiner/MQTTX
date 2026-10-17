import log4js from 'log4js'
import { getGlobalVariableMap } from '@/utils/configProfiles'
import { connectionFieldVariables, mergeVariables } from '@/utils/payloadVariables'
import { planAutoReplies } from '@/utils/autoReply'
import { getMessageId } from '@/utils/idGenerator'
import time from '@/utils/time'

/**
 * Publishes a reply through the publish pipeline of the connection, so an automatic answer shows up
 * in the message list and in the publish history exactly like a manually sent message.
 */
export type AutoReplyPublishDelegate = (message: MessageModel, type: PayloadType) => Promise<void>

export interface IncomingMessageInfo {
  connectionId: string
  topic: string
  payload: string | Buffer
  /** message id of the packet, used to answer a message only once */
  packetId?: number | null
}

const publishers = new Map<string, AutoReplyPublishDelegate>()
const records = new Map<string, ConnectionModel>()

/**
 * Registers the rules of one connection. Called again whenever the connection is opened or edited,
 * so a rule change applies to the next received message without reconnecting.
 */
export const registerAutoReply = (connectionId: string, record: ConnectionModel): void => {
  records.set(connectionId, record)
}

export const unregisterAutoReply = (connectionId: string): void => {
  records.delete(connectionId)
  resetAutoReplyState(connectionId)
}

/** Loop guard: a reply that comes back to us must not trigger the rules again. */
const recentReplies = new Map<string, number>()
const RECENT_REPLY_TTL = 5000

/** Answers already sent for one received packet, keyed by `topic|packetId|ruleId`. */
const answered = new Map<string, number>()
const ANSWERED_TTL = 60000

/** Per connection rate limit, so a rule with a bad filter cannot flood the broker. */
const MAX_REPLIES_PER_SECOND = 20
const replyTimestamps = new Map<string, number[]>()

const getLog = () => log4js.getLogger()

export const registerAutoReplyPublisher = (connectionId: string, delegate: AutoReplyPublishDelegate): void => {
  publishers.set(connectionId, delegate)
}

export const unregisterAutoReplyPublisher = (connectionId: string): void => {
  publishers.delete(connectionId)
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
      if (reply.payload.includes('${')) {
        getLog().warn(
          `Auto reply ${reply.ruleId} skipped: the reply still contains an unresolved placeholder ` +
            `(connection ${info.connectionId})`,
        )
        continue
      }
      const publish = () => publishReply(info, reply.topic, reply.payload, reply.qos, reply.retain, reply.ruleId)
      if (reply.delayMs > 0) {
        setTimeout(() => {
          publish().catch((error) => getLog().error(`Auto reply failed: ${(error as Error).toString()}`))
        }, reply.delayMs)
      } else {
        await publish()
      }
      if (info.packetId !== undefined && info.packetId !== null) {
        answered.set(answeredKey, Date.now())
      }
    }
  } catch (error) {
    getLog().error(`Auto reply failed: ${(error as Error).toString()}`)
  }
}

const publishReply = async (
  info: IncomingMessageInfo,
  topic: string,
  payload: string,
  qos: QoS,
  retain: boolean,
  ruleId: string,
): Promise<void> => {
  const publisher = publishers.get(info.connectionId)
  if (!publisher) {
    getLog().warn(`Auto reply ${ruleId} skipped: no publish pipeline for connection ${info.connectionId}`)
    return
  }
  if (!takeReplyBudget(info.connectionId)) {
    getLog().warn(`Auto reply ${ruleId} skipped: too many replies per second (connection ${info.connectionId})`)
    return
  }
  const message: MessageModel = {
    id: getMessageId(),
    topic,
    payload,
    qos,
    retain,
    createAt: time.getNowDate(),
    out: true,
  }
  await publisher(message, 'JSON')
  markReply(topic, payload)
  getLog().info(`Auto replied to ${info.topic} with ${topic} (rule ${ruleId}, connection ${info.connectionId})`)
}
