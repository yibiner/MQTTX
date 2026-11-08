import { connectReportDelaySeconds, pendingConnectReports } from '@/utils/connectReports'
import { connectionVariableOptions } from '@/utils/connectionVariables'
import { resolvePayloadVariables } from '@/utils/payloadVariables'

/**
 * One-shot publishes sent after a successful connect ("连接后上报").
 *
 * This is the browser counterpart of the desktop runner: the same rows, the same rules (a disabled
 * row is kept but not sent, a negative delay is refused, an empty delay sends right away), and the
 * same template resolution in topic and payload. What differs is what happens around them - the
 * desktop version hands the message to the view pipeline (user script, schema, MQTT 5 properties),
 * while here the message is published as written, because the browser has no script pipeline.
 */

export interface ConnectReportMessage {
  /** id of the configured row, so a caller can tell which report produced this send */
  id: string
  topic: string
  payload: string
  qos: QoS
  retain: boolean
  /** wait this long after the connect before publishing */
  delayMs: number
}

export interface ConnectReportPlan {
  messages: ConnectReportMessage[]
  /** placeholders that could not be resolved, in order of first appearance */
  unresolved: string[]
}

/**
 * Turns the configured reports into the messages that should be sent after this connect.
 *
 * Variables are resolved at plan time, so `${connectedAt}` and friends are already the values of
 * this connect. A row whose topic still has an unresolved placeholder is dropped: publishing to a
 * literal `${...}` topic would silently succeed and deliver to nobody.
 */
export const planConnectReports = (connection: ConnectionModel | null | undefined): ConnectReportPlan => {
  const plan: ConnectReportPlan = { messages: [], unresolved: [] }
  const reports = pendingConnectReports(connection?.connectReports)
  if (!reports.length) {
    return plan
  }

  const variableOptions = connectionVariableOptions(connection)

  reports.forEach((report) => {
    const delaySeconds = connectReportDelaySeconds(report.delay)
    if (delaySeconds === null) {
      return
    }
    const topicResult = resolvePayloadVariables(String(report.topic ?? '').trim(), variableOptions)
    topicResult.unresolved.forEach((name) => {
      if (!plan.unresolved.includes(name)) {
        plan.unresolved.push(name)
      }
    })
    if (!topicResult.text || topicResult.unresolved.length) {
      return
    }

    const payloadResult = resolvePayloadVariables(String(report.payload ?? ''), variableOptions)
    payloadResult.unresolved.forEach((name) => {
      if (!plan.unresolved.includes(name)) {
        plan.unresolved.push(name)
      }
    })

    plan.messages.push({
      id: report.id,
      topic: topicResult.text,
      payload: payloadResult.text,
      qos: (report.qos ?? 0) as QoS,
      retain: Boolean(report.retain),
      // setTimeout treats a delay above 2^31-1 as 1ms, which would send a long report immediately.
      delayMs: Math.min(Math.round(delaySeconds * 1000), 2147483647),
    })
  })

  return plan
}

export interface RunConnectReportsOptions {
  connection: ConnectionModel | null | undefined
  /** publishes one message; injected so this module does not depend on the view */
  publish: (message: ConnectReportMessage) => void
  /** called with the placeholders that could not be resolved */
  onUnresolved?: (names: string[]) => void
}

export interface RunConnectReportsResult {
  /** the messages that will be sent, in the order they were planned */
  messages: ConnectReportMessage[]
  /** the scheduled timers, so a disconnect can cancel them */
  timers: Array<ReturnType<typeof setTimeout>>
  /** cancels every timer that has not fired yet */
  cancel: () => void
}

/**
 * Publishes the planned reports, each after its own delay.
 *
 * Nothing is scheduled when the connection is gone by the time the delay expires: the caller cancels
 * the timers on disconnect, and a `cancel` call is idempotent.
 */
export const runConnectReports = (options: RunConnectReportsOptions): RunConnectReportsResult => {
  const { connection, publish, onUnresolved } = options
  const plan = planConnectReports(connection)

  if (plan.unresolved.length && onUnresolved) {
    onUnresolved(plan.unresolved)
  }

  const timers: Array<ReturnType<typeof setTimeout>> = []
  let cancelled = false

  plan.messages.forEach((message) => {
    if (message.delayMs <= 0) {
      publish(message)
      return
    }
    timers.push(
      setTimeout(() => {
        if (cancelled) {
          return
        }
        publish(message)
      }, message.delayMs),
    )
  })

  return {
    messages: plan.messages,
    timers,
    cancel: () => {
      cancelled = true
      timers.forEach((timer) => clearTimeout(timer))
      timers.length = 0
    },
  }
}
