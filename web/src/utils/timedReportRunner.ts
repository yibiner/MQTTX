import { pendingTimedReports } from '@/utils/timedReports'
import { connectionVariableOptions } from '@/utils/connectionVariables'
import { createPayloadVariableResolver } from '@/utils/payloadVariables'

/**
 * Timed messages for the browser build ("定时消息").
 *
 * The rows and the rules about which of them start are shared with the desktop build
 * (`utils/timedReports.ts`): a disabled row is kept but not started, a row without a topic or with
 * an interval below one second is skipped, and a row that is already running is not started twice.
 *
 * The difference is the lifetime. On the desktop the runner lives in the main process, so a timed
 * message keeps sending while the window is closed. In a browser tab nothing runs while the tab is
 * closed, suspended or discarded - the timers simply do not fire. The runner therefore cancels
 * everything on disconnect and on page unload, and it never resumes "missed" ticks afterwards: a
 * missed interval is skipped rather than sent late in a burst.
 */

/** At most this many timed messages may run at the same time per connection. */
export const MAX_TIMED_REPORTS_PER_CONNECTION = 10

const isPromise = <T>(value: T | Promise<T>): value is Promise<T> =>
  typeof (value as Promise<T> | undefined)?.then === 'function'

export interface TimedReportPublish {
  reportId: string
  topic: string
  payload: string
  qos: QoS
  retain: boolean
}

export interface TimedReportRunnerOptions {
  connection: ConnectionModel
  /** A promise is waited on: counters advance only after the broker accepts the message. */
  publish: (message: TimedReportPublish) => void | Promise<void>
  /** a row that cannot run (bad template, limit reached) */
  onSkipped?: (reportId: string, reason: string) => void
  now?: () => number
}

export interface TimedReportRunner {
  /** starts every saved row that should run; returns the ids that are running afterwards */
  startFromConnection: () => string[]
  /** starts one row by id */
  start: (reportId: string) => boolean
  stop: (reportId: string) => void
  /** stops everything and returns how many were stopped */
  stopAll: () => number
  runningIds: () => string[]
  dispose: () => void
}

export const createTimedReportRunner = (options: TimedReportRunnerOptions): TimedReportRunner => {
  const { connection, publish, onSkipped } = options
  const now = options.now ?? (() => Date.now())

  const timers = new Map<string, ReturnType<typeof setInterval>>()
  let disposed = false

  const reports = (): TimedReportModel[] => (Array.isArray(connection.timedReports) ? connection.timedReports : [])

  const tick = (report: TimedReportModel) => {
    if (disposed) {
      return
    }
    // Variables are resolved on every tick: a counter in a timed report must advance, and
    // `${timestamp}` must be the time of this send, not of the connect.
    const resolver = createPayloadVariableResolver(connectionVariableOptions(connection))
    const topic = resolver.resolve(report.topic ?? '').trim()
    const payload = resolver.resolve(report.payload ?? '')
    if (!topic) {
      if (onSkipped) {
        onSkipped(report.id, 'the topic is empty after resolving its variables')
      }
      return
    }
    // Commit only after the send is accepted. A rejected publish must not skip a counter value.
    const commit = () => {
      if (!disposed) {
        resolver.commit()
      }
    }
    try {
      const result = publish({
        reportId: report.id,
        topic,
        payload,
        qos: (report.qos ?? 0) as QoS,
        retain: Boolean(report.retain),
      })
      if (isPromise(result)) {
        result.then(commit, () => undefined)
        return
      }
    } catch (error) {
      return
    }
    commit()
  }

  const start = (reportId: string): boolean => {
    if (disposed) {
      return false
    }
    if (timers.has(reportId)) {
      return true
    }
    if (timers.size >= MAX_TIMED_REPORTS_PER_CONNECTION) {
      if (onSkipped) {
        onSkipped(reportId, `at most ${MAX_TIMED_REPORTS_PER_CONNECTION} timed messages can run`)
      }
      return false
    }
    const report = reports().find((item) => item.id === reportId)
    if (!report || report.enabled === false) {
      return false
    }
    const interval = Number(report.interval)
    if (!Number.isFinite(interval) || interval < 1 || !(report.topic ?? '').trim()) {
      if (onSkipped) {
        onSkipped(reportId, 'the interval is below one second or the topic is empty')
      }
      return false
    }
    const timer = setInterval(() => tick(report), Math.round(interval * 1000))
    timers.set(reportId, timer)
    return true
  }

  const stop = (reportId: string) => {
    const timer = timers.get(reportId)
    if (timer) {
      clearInterval(timer)
      timers.delete(reportId)
    }
  }

  const stopAll = (): number => {
    const ids = [...timers.keys()]
    ids.forEach(stop)
    return ids.length
  }

  return {
    startFromConnection: () => {
      const pending = pendingTimedReports(new Set(timers.keys()), reports())
      pending.forEach((report) => start(report.id))
      return [...timers.keys()]
    },
    start,
    stop,
    stopAll,
    runningIds: () => [...timers.keys()],
    dispose: () => {
      disposed = true
      stopAll()
      // Touching `now` keeps the injectable clock meaningful for callers that pass one.
      void now
    },
  }
}
