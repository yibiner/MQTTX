import log4js from 'log4js'
import type { MqttClient } from 'mqtt'
import useServices from '@/database/useServices'
import { getGlobalVariableMap } from '@/utils/configProfiles'
import { connectionFieldVariables, mergeVariables } from '@/utils/payloadVariables'
import { planAutoSubscribe, PlannedAutoSubscribeBatch } from '@/utils/autoSubscribe'
import { getSubscriptionId } from '@/utils/idGenerator'
import { getRandomColor } from '@/utils/colors'
import time from '@/utils/time'

/**
 * Runs the automatic subscriptions of a connection.
 *
 * Attached to the MQTT client (not to the connection page) because the subscriptions belong to the
 * device being simulated: they fire on every successful connect, including the reconnects mqtt.js
 * does on its own, and they have to keep firing while the user looks at another page.
 *
 * A group waits for its configured delay and then subscribes its topics - all of them in one
 * SUBSCRIBE packet when `merge` is set (one SUBACK for the whole batch), one packet per topic when
 * it is not. Everything is cancelled when the client goes offline or is closed, so a group that has
 * not fired yet never subscribes on a dead connection.
 */
const timersByConnection = new Map<string, Array<ReturnType<typeof setTimeout>>>()
const records = new Map<string, ConnectionModel>()
const wired = new WeakSet<MqttClient>()
const listeners = new Map<string, Set<() => void>>()

// Lazy: log4js is configured by the log plugin at app startup.
const getLog = () => log4js.getLogger()

/** Notified after automatic subscriptions were added, so the open subscription panel can reload. */
export const onAutoSubscribed = (connectionId: string, callback: () => void): (() => void) => {
  let set = listeners.get(connectionId)
  if (!set) {
    set = new Set()
    listeners.set(connectionId, set)
  }
  set.add(callback)
  return () => {
    set?.delete(callback)
  }
}

const notify = (connectionId: string) => {
  listeners.get(connectionId)?.forEach((callback) => {
    try {
      callback()
    } catch (error) {
      getLog().error(`Auto subscribe listener failed: ${(error as Error).toString()}`)
    }
  })
}

const clearTimers = (connectionId: string) => {
  ;(timersByConnection.get(connectionId) ?? []).forEach((timer) => clearTimeout(timer))
  timersByConnection.delete(connectionId)
}

const addTimer = (connectionId: string, timer: ReturnType<typeof setTimeout>) => {
  const timers = timersByConnection.get(connectionId) ?? []
  timers.push(timer)
  timersByConnection.set(connectionId, timers)
}

const resolveVariables = (record: ConnectionModel | null | undefined) =>
  mergeVariables(record?.variables, getGlobalVariableMap(), connectionFieldVariables(record))

/**
 * Registers the automatic subscriptions of one connection.
 *
 * Safe to call again: the record of the connection is refreshed (so an edit is picked up by the next
 * connect) and the client's listeners are only attached once.
 */
export const attachAutoSubscribe = (client: MqttClient, connectionId: string, record: ConnectionModel): void => {
  records.set(connectionId, record)
  if (wired.has(client)) {
    return
  }
  wired.add(client)

  client.on('connect', () => {
    clearTimers(connectionId)
    const source = records.get(connectionId)
    const plan = planAutoSubscribe(source?.autoSubscriptions, resolveVariables(source))
    if (plan.unresolved.length) {
      getLog().warn(
        `Auto subscribe skipped topics with unresolved variables ${plan.unresolved.join(', ')} ` +
          `(connection ${connectionId})`,
      )
    }
    plan.batches.forEach((batch) => {
      addTimer(
        connectionId,
        setTimeout(() => {
          executeBatch(client, connectionId, batch).catch((error) =>
            getLog().error(`Auto subscribe failed: ${(error as Error).toString()}`),
          )
        }, batch.delayMs),
      )
    })
    if (plan.batches.length) {
      getLog().info(
        `Auto subscribe for connection ${connectionId}: ${plan.batches
          .map((batch) => `${batch.topics.length} topic(s) after ${batch.delayMs}ms`)
          .join(', ')}`,
      )
    }
  })

  // A reconnect fires 'connect' again and reschedules, so anything pending belongs to a connection
  // that is gone.
  const cancel = () => clearTimers(connectionId)
  client.on('close', cancel)
  client.on('offline', cancel)
  client.on('end', cancel)
}

/** Cancels everything that is still waiting for its delay, e.g. when the connection is deleted. */
export const detachAutoSubscribe = (connectionId: string): void => {
  clearTimers(connectionId)
  records.delete(connectionId)
}

const executeBatch = async (client: MqttClient, connectionId: string, batch: PlannedAutoSubscribeBatch) => {
  if (!client.connected) {
    getLog().warn(`Auto subscribe skipped: connection ${connectionId} is not connected`)
    return
  }
  if (batch.merge) {
    const map: { [topic: string]: { qos: QoS } } = {}
    batch.topics.forEach((item) => {
      map[item.topic] = { qos: item.qos }
    })
    await subscribe(client, connectionId, map)
    return
  }
  for (const item of batch.topics) {
    if (!client.connected) {
      getLog().warn(`Auto subscribe stopped: connection ${connectionId} went offline`)
      return
    }
    await subscribe(client, connectionId, { [item.topic]: { qos: item.qos } })
  }
}

const subscribe = (client: MqttClient, connectionId: string, map: { [topic: string]: { qos: QoS } }): Promise<void> =>
  new Promise((resolve) => {
    const topics = Object.keys(map)
    client.subscribe(map, async (error, granted) => {
      if (error) {
        getLog().error(
          `Auto subscribe failed for ${topics.join(', ')} (connection ${connectionId}): ${error.toString()}`,
        )
        resolve()
        return
      }
      // `granted` is what the broker acknowledged; it can be empty when mqtt.js considered the
      // topics already subscribed (same or higher QoS), so log the topics that were asked for.
      const grantedTopics = (granted ?? []).map((item) => item.topic)
      const grantedText = grantedTopics.length ? `, granted ${grantedTopics.join(', ')}` : ''
      getLog().info(
        `Auto subscribed ${topics.join(', ')} (connection ${connectionId}, ` +
          `${topics.length > 1 ? 'one packet' : 'single topic'}${grantedText})`,
      )
      await saveSubscriptions(connectionId, map, grantedTopics.length ? grantedTopics : topics)
      notify(connectionId)
      resolve()
    })
  })

/**
 * Records what was subscribed, so it shows up in the subscription panel and survives a restart.
 *
 * Only the missing rows are inserted: automatic subscriptions are additions, and rewriting the whole
 * list would race with a subscription the user saves at the same moment.
 */
const saveSubscriptions = async (
  connectionId: string,
  map: { [topic: string]: { qos: QoS } },
  topics: string[],
): Promise<void> => {
  try {
    const { subscriptionService } = useServices()
    const existing = (await subscriptionService.getSubscriptions(connectionId)) ?? []
    const known = new Set(existing.map((item) => item.topic))
    const added: SubscriptionModel[] = topics
      .filter((topic) => !known.has(topic))
      .map((topic) => ({
        id: getSubscriptionId(),
        topic,
        qos: map[topic]?.qos ?? 0,
        disabled: false,
        color: getRandomColor(),
        createAt: time.getNowDate(),
      }))
    if (!added.length) {
      return
    }
    await subscriptionService.addSubscriptions(connectionId, added)
  } catch (error) {
    getLog().error(`Auto subscribe could not save the subscriptions: ${(error as Error).toString()}`)
  }
}
