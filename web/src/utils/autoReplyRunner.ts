import { planAutoReplies, PlannedAutoReply } from '@/utils/autoReply'
import { connectionVariableOptions } from '@/utils/connectionVariables'

/**
 * Automatic replies for the browser build ("自动回复").
 *
 * The rule matching itself is shared with the desktop build (`utils/autoReply.ts`), so what a rule
 * matches - topic filter, JMESPath condition, reply template - is identical on both sides. This
 * module adds the part that has to run per connection: the guards, the delays, and publishing.
 *
 * The guards are the same as the desktop engine, because they exist for reasons that are not
 * desktop specific:
 *
 * - a reply must not trigger another reply for ever, so the payload the engine just published is
 *   ignored for a few seconds (the topic is only a fast check; a different payload on that topic
 *   is still answered);
 * - a redelivered QoS 1/2 packet must not be answered twice, so "connection + topic + packet id +
 *   rule" is remembered for a minute. A QoS 0 message has no packet id and is answered every time;
 * - a device answering a burst must not flood the broker, so replies are capped per second.
 *
 * What the browser build does not have is the desktop's timed-message bookkeeping: a pending delayed
 * reply is cancelled when the connection closes, and nothing survives a page reload.
 */

/** A reply the engine just published is ignored as an incoming message for this long. */
export const RECENT_REPLY_TTL_MS = 5000
/** The same incoming message (connection + topic + rule) is answered once within this window. */
export const ANSWERED_TTL_MS = 60000
/** Upper bound of replies published per second and per connection. */
export const MAX_REPLIES_PER_SECOND = 20
/** Upper bound of delayed replies waiting at the same time. */
export const MAX_PENDING_DELAYED_REPLIES = 100

/**
 * FNV-1a plus the length, so the loop guard does not retain the payload text.
 * Same shape as the desktop engine: the topic alone is not enough, because a device keeps
 * publishing other messages on the topic a reply just used.
 */
const payloadKey = (topic: string, payload: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${topic}\u0000${payload.length}\u0000${hash >>> 0}`
}

const isPromise = <T>(value: T | Promise<T>): value is Promise<T> =>
  typeof (value as Promise<T> | undefined)?.then === 'function'

export interface AutoReplyMessage {
  ruleId: string
  topic: string
  payload: string
  qos: QoS
  retain: boolean
}

export interface AutoReplyRunnerOptions {
  connection: ConnectionModel
  /**
   * publishes one reply; injected so the runner has no dependency on the view or the database.
   * A promise is waited on: the packet is remembered as answered only after the broker accepts it.
   */
  publish: (message: AutoReplyMessage) => void | Promise<void>
  /** a rule that could not be built (bad template, bad condition) - reported, never thrown */
  onRuleError?: (ruleId: string, error: string) => void
  /** injectable clock, so the guards can be tested without waiting */
  now?: () => number
}

export interface AutoReplyRunner {
  /** Call for every message that arrives on this connection. */
  handleIncoming: (topic: string, payload: string, packetId?: number) => PlannedAutoReply[]
  /** Cancels pending delayed replies and forgets the per-connection state. */
  dispose: () => void
  /** Number of delayed replies still waiting, for tests and diagnostics. */
  pendingCount: () => number
}

const pruneTimestamps = (timestamps: number[], now: number): number[] =>
  timestamps.filter((stamp) => now - stamp < 1000)

export const createAutoReplyRunner = (options: AutoReplyRunnerOptions): AutoReplyRunner => {
  const { connection, publish, onRuleError } = options
  const now = options.now ?? (() => Date.now())

  /** topics this engine published recently; the payload hash decides which message is our own reply */
  const recentReplyTopics = new Map<string, number>()
  const recentReplies = new Map<string, number>()
  /**
   * "connectionId|topic|packetId|ruleId" of packets already answered, so a redelivery is not
   * answered twice. Absent unless the packet had an id: QoS 0 has nothing to dedupe on.
   */
  const answered = new Map<string, number>()
  /** publication timestamps of the last second, for the rate limit */
  let replyTimestamps: number[] = []
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
  let disposed = false

  const pruneExpired = (current: number) => {
    recentReplyTopics.forEach((stamp, key) => {
      if (current - stamp >= RECENT_REPLY_TTL_MS) {
        recentReplyTopics.delete(key)
      }
    })
    answered.forEach((stamp, key) => {
      if (current - stamp >= ANSWERED_TTL_MS) {
        answered.delete(key)
      }
    })
    recentReplies.forEach((stamp, key) => {
      if (current - stamp >= RECENT_REPLY_TTL_MS) {
        recentReplies.delete(key)
      }
    })
  }

  const isOwnReply = (topic: string, payload: string, current: number): boolean => {
    const repliedAt = recentReplyTopics.get(topic)
    if (repliedAt === undefined || current - repliedAt >= RECENT_REPLY_TTL_MS) {
      return false
    }
    return recentReplies.has(payloadKey(topic, payload))
  }

  const markReply = (topic: string, payload: string, stamp: number) => {
    recentReplyTopics.set(topic, stamp)
    recentReplies.set(payloadKey(topic, payload), stamp)
  }

  /**
   * `false` when the reply was not sent (rate limit, or the broker rejected it).
   * The caller remembers the packet only after a `true`, so a dropped reply can be retried.
   */
  const publishReply = (reply: PlannedAutoReply): boolean | Promise<boolean> => {
    const stamp = now()
    replyTimestamps = pruneTimestamps(replyTimestamps, stamp)
    if (replyTimestamps.length >= MAX_REPLIES_PER_SECOND) {
      // Dropped rather than queued: a reply that arrives late is worse than one that never arrived.
      return false
    }
    replyTimestamps.push(stamp)
    // Armed before the publish returns. A local broker can deliver the echo inside the callback,
    // which is before this function hears about success.
    markReply(reply.topic, reply.payload, stamp)
    try {
      const result = publish({
        ruleId: reply.ruleId,
        topic: reply.topic,
        payload: reply.payload,
        qos: reply.qos,
        retain: reply.retain,
      })
      if (isPromise(result)) {
        return result.then(
          () => true,
          () => false,
        )
      }
      return true
    } catch (error) {
      return false
    }
  }

  const handleIncoming: AutoReplyRunner['handleIncoming'] = (topic, payload, packetId) => {
    if (disposed) {
      return []
    }
    const rules = connection.autoReplies
    if (!Array.isArray(rules) || !rules.length) {
      return []
    }
    const current = now()
    pruneExpired(current)

    // Our own reply coming back from the broker is not something to answer.
    // A different payload on the same topic still is.
    if (isOwnReply(topic, payload, current)) {
      return []
    }

    const variableOptions = connectionVariableOptions(connection)
    const replies = planAutoReplies(rules, {
      topic,
      payload,
      definitions: variableOptions.definitions,
      connectionId: variableOptions.connectionId,
    })

    const hasPacket = packetId !== undefined && packetId !== null
    const accepted: PlannedAutoReply[] = []
    replies.forEach((reply) => {
      if (reply.error) {
        if (onRuleError) {
          onRuleError(reply.ruleId, reply.error)
        }
        return
      }
      if (hasPacket) {
        const key = `${connection.id ?? ''}|${topic}|${packetId}|${reply.ruleId}`
        const answeredAt = answered.get(key)
        if (answeredAt !== undefined && current - answeredAt < ANSWERED_TTL_MS) {
          return
        }
      }
      accepted.push(reply)
    })

    accepted.forEach((reply) => {
      const key = `${connection.id ?? ''}|${topic}|${packetId ?? ''}|${reply.ruleId}`
      const remember = () => {
        if (hasPacket) {
          answered.set(key, now())
        }
      }
      if (reply.delayMs <= 0) {
        const sent = publishReply(reply)
        if (isPromise(sent)) {
          void sent.then((ok) => {
            if (ok) {
              remember()
            }
          })
          return
        }
        if (sent) {
          remember()
        }
        return
      }
      if (pendingTimers.size >= MAX_PENDING_DELAYED_REPLIES) {
        // Not remembered: the packet was never accepted, so a later delivery may try again.
        return
      }
      const timer = setTimeout(() => {
        pendingTimers.delete(timer)
        if (!disposed) {
          void publishReply(reply)
        }
      }, reply.delayMs)
      pendingTimers.add(timer)
      remember()
    })

    return accepted
  }

  return {
    handleIncoming,
    dispose: () => {
      disposed = true
      pendingTimers.forEach((timer) => clearTimeout(timer))
      pendingTimers.clear()
      recentReplyTopics.clear()
      recentReplies.clear()
      answered.clear()
      replyTimestamps = []
    },
    pendingCount: () => pendingTimers.size,
  }
}
