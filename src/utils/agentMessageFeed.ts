/**
 * The message feed of one open connection, as the local AI agent sees it.
 *
 * The message list on screen is a view: it drops messages that a direction tab, a topic filter or a
 * search hides, it stops adding rows when the user scrolled up, and the store keeps nothing at all
 * while the setting "忽略 QoS 0" is on. None of that may decide what an agent can observe, so the
 * connection page records every message it handles here as well.
 *
 * Stored history is not part of this class (the page merges it in when answering); the feed holds
 * the recent arrivals, including the ones the store skipped, and the agents waiting for the next
 * matching message.
 *
 * Arrivals are numbered instead of indexed. The log drops its oldest entries once it is full, which
 * would shift every index, so a waiter remembers the number of the message it last saw.
 */
import {
  AgentDisplayedMessage,
  AgentMessageFilter,
  AgentWaitOptions,
  AgentWaitResult,
  MAX_BUFFERED_MESSAGES,
  clampWaitMs,
  describeAgentFilter,
  matchAgentMessage,
} from '@/utils/agentBridge'

interface Entry {
  /** Monotonic arrival number; never reused, even after older entries are dropped. */
  seq: number
  message: AgentDisplayedMessage
}

interface Waiter {
  filter: AgentMessageFilter
  /** Decides which arrivals count, anchored at the `afterId` of the call. */
  isNewer: (entry: Entry) => boolean
  resolve: (result: AgentWaitResult) => void
  timer: ReturnType<typeof setTimeout>
  startedAt: number
}

export class AgentMessageFeed {
  private entries: Entry[] = []
  private nextSeq = 1
  private waiters = new Set<Waiter>()

  /** Every message this page still holds for the connection, oldest first. */
  get messages(): AgentDisplayedMessage[] {
    return this.entries.map((entry) => entry.message)
  }

  get waiting(): number {
    return this.waiters.size
  }

  /**
   * Adds one message (or a whole buffered batch) and settles the agents waiting for it.
   *
   * A waiter is anchored at the arrival number of the `afterId` it named, so a message that was
   * already in the log cannot satisfy it and a pruned log cannot make it miss a new one.
   */
  record(messages: AgentDisplayedMessage | AgentDisplayedMessage[]): void {
    const incoming = Array.isArray(messages) ? messages : [messages]
    let added = false
    incoming.forEach((message) => {
      if (!message || !message.id || this.entries.some((entry) => entry.message.id === message.id)) {
        return
      }
      this.entries.push({ seq: this.nextSeq, message })
      this.nextSeq += 1
      added = true
    })
    if (!added) {
      return
    }
    if (this.entries.length > MAX_BUFFERED_MESSAGES) {
      this.entries = this.entries.slice(this.entries.length - MAX_BUFFERED_MESSAGES)
    }
    if (!this.waiters.size) {
      return
    }
    Array.from(this.waiters).forEach((waiter) => {
      const found = this.entries.find(
        (entry) => waiter.isNewer(entry) && matchAgentMessage(entry.message, waiter.filter),
      )
      if (found) {
        this.settle(waiter, {
          matched: true,
          waitedMs: Date.now() - waiter.startedAt,
          message: found.message,
        })
      }
    })
  }

  /** Forgets the arrivals (the message list was cleared, or another connection is shown). */
  clear(): void {
    this.entries = []
  }

  /**
   * Resolves with the first matching message that arrives after `afterId`, or with `matched: false`
   * after the timeout.
   *
   * With `afterId`, a message that is already in the log but newer than it answers at once: the
   * arrival may have happened between the publish and this call. Without `afterId` there is nothing
   * to anchor to, so only future arrivals count -- answering with an old message would tell the
   * agent that a reply it is still waiting for already came.
   *
   * The log drops its oldest entries, so `afterId` may not be held any more. `afterCreateAt` (the
   * page reads it from the store) then decides which arrivals are newer.
   */
  wait(input: AgentWaitOptions = {}): Promise<AgentWaitResult> {
    const timeoutMs = clampWaitMs(input.timeoutMs)
    const startedAt = Date.now()
    const filter: AgentMessageFilter = {}
    if (input.topic) filter.topic = input.topic
    if (input.direction) filter.direction = input.direction
    if (input.contains) filter.contains = input.contains

    const isNewer = this.arrivalPredicate(input.afterId, input.afterCreateAt)
    const existing = this.entries.find((entry) => isNewer(entry) && matchAgentMessage(entry.message, filter))
    if (existing) {
      return Promise.resolve({ matched: true, waitedMs: 0, message: existing.message })
    }

    return new Promise<AgentWaitResult>((resolve) => {
      const waiter: Waiter = {
        filter,
        isNewer,
        resolve,
        startedAt,
        timer: setTimeout(() => {
          this.settle(waiter, {
            matched: false,
            waitedMs: Date.now() - startedAt,
            hint:
              `No message matched ${describeAgentFilter(
                filter,
              )} within ${timeoutMs} ms. The connection is still open. ` +
              'Check list_messages for what did arrive, and remember the app answers some messages by itself ' +
              '(see autoReplies in get_connection), so not every command gets a second reply.',
          })
        }, timeoutMs),
      }
      // Never keep the process alive just because an agent is waiting.
      if (typeof waiter.timer === 'object' && waiter.timer && 'unref' in waiter.timer) {
        ;(waiter.timer as unknown as { unref: () => void }).unref()
      }
      this.waiters.add(waiter)
    })
  }

  /**
   * Decides whether one arrival counts for a waiter anchored at `afterId`.
   *
   * The arrival number settles it while the anchor is still held. Once it has been pruned, its
   * `createAt` does: an entry without one is treated as newer, because dropping the reply an agent
   * is waiting for is worse than answering with a row it has already seen.
   */
  private arrivalPredicate(afterId?: string, afterCreateAt?: string): (entry: Entry) => boolean {
    const anchor = afterId ? this.entries.find((entry) => entry.message.id === afterId) : undefined
    if (anchor) {
      const seq = anchor.seq
      return (entry) => entry.seq > seq
    }
    if (afterId) {
      if (!afterCreateAt) {
        return () => true
      }
      return (entry) => entry.message.createAt > afterCreateAt
    }
    // No anchor at all: only arrivals from now on, never what is already held.
    const boundary = this.nextSeq - 1
    return (entry) => entry.seq > boundary
  }

  /** Settles every waiting agent, e.g. when the connection page goes away. */
  settleAll(reason: string): void {
    Array.from(this.waiters).forEach((waiter) => {
      this.settle(waiter, {
        matched: false,
        waitedMs: Date.now() - waiter.startedAt,
        hint: reason,
      })
    })
  }

  private settle(waiter: Waiter, result: AgentWaitResult): void {
    if (!this.waiters.has(waiter)) {
      return
    }
    clearTimeout(waiter.timer)
    this.waiters.delete(waiter)
    waiter.resolve(result)
  }
}
