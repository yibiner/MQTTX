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
 */
import {
  AgentDisplayedMessage,
  AgentMessageFilter,
  AgentWaitResult,
  appendAgentMessage,
  clampWaitMs,
  describeAgentFilter,
  matchAgentMessage,
} from '@/utils/agentBridge'

interface Waiter {
  filter: AgentMessageFilter
  /** Position in the log from which an arrival counts. */
  sinceIndex: number
  resolve: (result: AgentWaitResult) => void
  timer: ReturnType<typeof setTimeout>
  startedAt: number
}

/** Where a message sits relative to `afterId`. */
function startIndexFor(messages: AgentDisplayedMessage[], afterId?: string): number {
  if (!afterId) {
    return 0
  }
  const index = messages.findIndex((message) => message.id === afterId)
  return index >= 0 ? index + 1 : 0
}

export class AgentMessageFeed {
  private log: AgentDisplayedMessage[] = []
  private waiters = new Set<Waiter>()

  /** Every message this page handled for the connection, oldest first. */
  get messages(): AgentDisplayedMessage[] {
    return this.log
  }

  get waiting(): number {
    return this.waiters.size
  }

  /**
   * Adds one message (or a whole buffered batch) and settles the agents waiting for it. `afterId`
   * of a waiter is resolved against the log at registration time, so a message that was already
   * there cannot satisfy it.
   */
  record(messages: AgentDisplayedMessage | AgentDisplayedMessage[]): void {
    const incoming = Array.isArray(messages) ? messages : [messages]
    let firstNew = this.log.length
    incoming.forEach((message) => {
      const before = this.log.length
      this.log = appendAgentMessage(this.log, message)
      // A pruned log shifts the indices, so keep the arrivals comparable.
      if (this.log.length === before) {
        return
      }
      firstNew = Math.min(firstNew, before)
    })
    if (!this.waiters.size) {
      return
    }
    Array.from(this.waiters).forEach((waiter) => {
      const found = this.log
        .slice(Math.max(waiter.sinceIndex, firstNew))
        .find((message) => matchAgentMessage(message, waiter.filter))
      if (found) {
        this.settle(waiter, {
          matched: true,
          waitedMs: Date.now() - waiter.startedAt,
          message: found,
        })
      }
    })
  }

  /** Forgets the arrivals (a cleared list, or another connection is shown). */
  clear(): void {
    this.log = []
  }

  /**
   * Resolves with the first matching message that arrives, or with `matched: false` after the
   * timeout. A message already in the log after `afterId` and matching the filter answers at once,
   * because the arrival may have happened between the publish and this call.
   */
  wait(input: AgentMessageFilter & { timeoutMs?: number; afterId?: string } = {}): Promise<AgentWaitResult> {
    const timeoutMs = clampWaitMs(input.timeoutMs)
    const startedAt = Date.now()
    const filter: AgentMessageFilter = {}
    if (input.topic) filter.topic = input.topic
    if (input.direction) filter.direction = input.direction
    if (input.contains) filter.contains = input.contains

    const sinceIndex = startIndexFor(this.log, input.afterId)
    const existing = this.log.slice(sinceIndex).find((message) => matchAgentMessage(message, filter))
    if (existing) {
      return Promise.resolve({ matched: true, waitedMs: 0, message: existing })
    }

    return new Promise<AgentWaitResult>((resolve) => {
      const waiter: Waiter = {
        filter,
        sinceIndex,
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
