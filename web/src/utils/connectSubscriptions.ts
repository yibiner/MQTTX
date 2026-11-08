import type { MqttClient } from 'mqtt'
import { planConnectSubscriptions } from '@/utils/autoSubscribe'
import { buildRowSubscribeOptions, SubscriptionRowOptions } from '@/utils/subscribeOptions'
import { connectionVariableOptions } from '@/utils/connectionVariables'
import { getSubscriptionId } from '@/utils/idGenerator'
import { getRandomColor } from '@/utils/colors'
import time from '@/utils/time'

/**
 * Subscribes what a connection needs right after it succeeded, in the browser build.
 *
 * The desktop version attaches to the mqtt.js client and also feeds the timed messages and the
 * connect reports. The browser build has neither of those running in the background, so this module
 * keeps the part that makes sense here: the automatic subscriptions of the connection, each group
 * with its own delay, and the "auto resubscribe" rows of the panel.
 *
 * The plan itself (`planConnectSubscriptions`) is shared with the desktop build, so the rules about
 * what gets subscribed - and which topic is skipped because a placeholder could not be resolved -
 * are the same on both sides.
 */

/**
 * The only thing this module needs from the connection: subscribing.
 *
 * Typed as a narrow interface on purpose - the view holds a `Partial<MqttClient>` while connecting,
 * and requiring the whole client there would force a cast at the call site.
 */
export type SubscribeCapableClient = Pick<MqttClient, 'subscribe'>

export interface ApplyConnectSubscriptionsOptions {
  client: SubscribeCapableClient
  connection: ConnectionModel
  /** whether the saved rows should be restored too (the "auto resubscribe" setting) */
  restoreManual?: boolean
  /** called with the placeholders that could not be resolved */
  onUnresolved?: (names: string[]) => void
  /**
   * Persists the rows the automation created. Injected instead of imported so this module stays free
   * of the database: the view passes `updateConnection`, the unit tests pass nothing.
   */
  persistRows?: (rows: SubscriptionModel[]) => void
  /** called after the created rows were handed to `persistRows` */
  onRowsChanged?: () => void
}

export interface ApplyConnectSubscriptionsResult {
  subscribed: string[]
  unresolved: string[]
}

/** The promise the apply call returns, plus a cancel for the delays that have not fired yet. */
export interface ApplyConnectSubscriptionsRun extends Promise<ApplyConnectSubscriptionsResult> {
  cancel: () => void
}

const subscribeBatch = (
  client: SubscribeCapableClient,
  connection: ConnectionModel,
  batch: { merge: boolean; topics: Array<{ topic: string; qos: QoS; row?: SubscriptionModel }> },
  onSubscribed: (topic: string, qos: QoS) => void,
): void => {
  if (!batch.topics.length) {
    return
  }
  if (batch.merge) {
    // One SUBSCRIBE packet for the whole group: mqtt.js takes a `{ topic: { qos, ... } }` map, which
    // also carries the per-subscription MQTT 5 options when the row has them.
    const map: { [topic: string]: { qos: QoS; nl?: boolean; rap?: boolean; rh?: RetainHandling } } = {}
    batch.topics.forEach((item) => {
      const row = item.row
      map[item.topic] = {
        qos: item.qos,
        ...(row?.nl !== undefined ? { nl: row.nl } : {}),
        ...(row?.rap !== undefined ? { rap: row.rap } : {}),
        ...(row?.rh !== undefined ? { rh: row.rh } : {}),
      }
    })
    client.subscribe(map, () => undefined)
    batch.topics.forEach((item) => onSubscribed(item.topic, item.qos))
    return
  }
  // MQTT 5.0 subscriptions carry their own properties (nl / rap / rh / identifier / user properties),
  // so they are sent one by one even inside a group that asked to be merged.
  batch.topics.forEach((item) => {
    const options = buildRowSubscribeOptions(connection.mqttVersion, item as SubscriptionRowOptions)
    client.subscribe(item.topic, options, () => undefined)
    onSubscribed(item.topic, item.qos)
  })
}

/**
 * Applies the plan and persists the rows the automation created, so the subscription panel shows
 * them with the "自动" badge and a later connect keeps the same behaviour.
 */
export const applyConnectSubscriptions = (
  options: ApplyConnectSubscriptionsOptions,
): ApplyConnectSubscriptionsRun => {
  const { client, connection, restoreManual = true, onUnresolved, persistRows, onRowsChanged } = options
  const variableOptions = connectionVariableOptions(connection)
  const plan = planConnectSubscriptions({
    rows: connection.subscriptions,
    groups: connection.autoSubscriptions,
    variables: {},
    definitions: variableOptions.definitions,
    connectionId: variableOptions.connectionId,
    restoreManual,
  })

  if (plan.unresolved.length && onUnresolved) {
    onUnresolved(plan.unresolved)
  }

  const subscribed: string[] = []
  const createdRows: SubscriptionModel[] = []

  const collectRow = (topic: string, qos: QoS) => {
    subscribed.push(topic)
    if (connection.subscriptions.some((row) => row.topic === topic)) {
      return
    }
    createdRows.push({
      id: getSubscriptionId(),
      topic,
      qos,
      disabled: false,
      color: getRandomColor(),
      createAt: time.getNowDate(),
      autoSubscribed: true,
    } as SubscriptionModel)
  }

  const timers: Array<ReturnType<typeof setTimeout>> = []
  let cancelled = false
  let settled = false
  let cancel: () => void = () => undefined

  const run = new Promise<ApplyConnectSubscriptionsResult>((resolve) => {
    let pending = plan.batches.length

    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      if (createdRows.length) {
        connection.subscriptions = [...connection.subscriptions, ...createdRows]
        if (persistRows) {
          persistRows(createdRows)
        }
        if (onRowsChanged) {
          onRowsChanged()
        }
      }
      resolve({ subscribed, unresolved: plan.unresolved })
    }

    cancel = () => {
      if (settled) {
        return
      }
      cancelled = true
      timers.forEach((timer) => clearTimeout(timer))
      timers.length = 0
      // Rows already subscribed stay. Delays that have not fired are dropped.
      finish()
    }

    if (!pending) {
      finish()
      return
    }

    plan.batches.forEach((batch) => {
      const send = () => {
        if (cancelled) {
          pending -= 1
          if (pending === 0) {
            finish()
          }
          return
        }
        try {
          subscribeBatch(client, connection, batch, collectRow)
        } finally {
          pending -= 1
          if (pending === 0) {
            finish()
          }
        }
      }
      if (batch.delayMs > 0) {
        timers.push(setTimeout(send, batch.delayMs))
      } else {
        send()
      }
    })
  }) as ApplyConnectSubscriptionsRun

  run.cancel = () => cancel()
  return run
}
