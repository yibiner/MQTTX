import log4js from 'log4js'
import type { MqttClient } from 'mqtt'
import store from '@/store'
import useServices from '@/database/useServices'
import { getGlobalVariableMap } from '@/utils/configProfiles'
import { connectionFieldVariables, mergeVariables } from '@/utils/payloadVariables'
import { ConnectSubscriptionBatch, ConnectSubscriptionTopic, planConnectSubscriptions } from '@/utils/autoSubscribe'
import { buildRowSubscribeOptions } from '@/utils/subscribeOptions'
import { getSubscriptionId } from '@/utils/idGenerator'
import { getRandomColor } from '@/utils/colors'
import time from '@/utils/time'

/**
 * Subscribes everything a connection needs after it succeeded, from a single place.
 *
 * Two features used to do this independently: the saved subscriptions of the panel (the "auto
 * resubscribe" setting) and the automatic subscriptions configured on the connection. Both could
 * subscribe the same topic, at different moments, so one of them had to be kept away from the other
 * with an exclusion list that matched resolved topics - which broke as soon as a variable or the
 * ordering changed. Now `planConnectSubscriptions` builds one plan from both sources and this module
 * executes it, which also gives the automatic topics the same treatment on a reconnect that mqtt.js
 * performs on its own (the client no longer re-subscribes behind our back, see `createClient`).
 *
 * Attached to the MQTT client rather than to the connection page: the subscriptions belong to the
 * device being simulated, they fire on every successful connect and have to keep firing while the
 * user looks at another page. Pending batches are cancelled as soon as the client goes away.
 */
interface AttachedSubscriptions {
  connectionId: string
  record: ConnectionModel
  timers: Array<ReturnType<typeof setTimeout>>
}

const attached = new Map<MqttClient, AttachedSubscriptions>()
const records = new Map<string, ConnectionModel>()
const listeners = new Map<string, Set<() => void>>()

// Lazy: log4js is configured by the log plugin at app startup.
const getLog = () => log4js.getLogger()

/** Notified after topics were subscribed, so the open subscription panel can reload. */
export const onConnectSubscribed = (connectionId: string, callback: () => void): (() => void) => {
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
      getLog().error(`Connect subscription listener failed: ${(error as Error).toString()}`)
    }
  })
}

const clearTimers = (timers: Array<ReturnType<typeof setTimeout>>) => {
  timers.forEach((timer) => clearTimeout(timer))
  timers.length = 0
}

const resolveVariables = (record: ConnectionModel | null | undefined) =>
  mergeVariables(record?.variables, getGlobalVariableMap(), connectionFieldVariables(record))

/**
 * Registers the connect-time subscriptions of one connection.
 *
 * Safe to call again: the record of the connection is refreshed (so an edit is picked up by the next
 * connect) and the client's listeners are only attached once.
 */
export const attachConnectSubscriptions = (client: MqttClient, connectionId: string, record: ConnectionModel): void => {
  records.set(connectionId, record)
  const existing = attached.get(client)
  if (existing) {
    existing.record = record
    return
  }
  const entry: AttachedSubscriptions = { connectionId, record, timers: [] }
  attached.set(client, entry)

  client.on('connect', () => {
    clearTimers(entry.timers)
    const source = records.get(connectionId) ?? entry.record
    const plan = planConnectSubscriptions({
      rows: source?.subscriptions,
      groups: source?.autoSubscriptions,
      variables: resolveVariables(source),
      restoreManual: store.getters?.autoResub !== false,
    })
    if (plan.unresolved.length) {
      getLog().warn(
        `Subscriptions skipped topics with unresolved variables ${plan.unresolved.join(', ')} ` +
          `(connection ${connectionId})`,
      )
    }
    // Rows the automation does not own any more lose their badge: the configuration may have been
    // edited in the connection form, and a badge saying "subscribed automatically" would be wrong.
    const autoTopics = plan.batches
      .filter((batch) => batch.source === 'auto')
      .flatMap((batch) => batch.topics.map((item) => item.topic))
    syncBadges(connectionId, autoTopics).catch((error) =>
      getLog().error(`Could not update the automatic subscription badges: ${(error as Error).toString()}`),
    )

    plan.batches.forEach((batch) => {
      if (!batch.delayMs) {
        execute(client, connectionId, source, batch).catch((error) =>
          getLog().error(`Subscription after connecting failed: ${(error as Error).toString()}`),
        )
        return
      }
      entry.timers.push(
        setTimeout(() => {
          execute(client, connectionId, source, batch).catch((error) =>
            getLog().error(`Subscription after connecting failed: ${(error as Error).toString()}`),
          )
        }, batch.delayMs),
      )
    })
    if (plan.batches.length) {
      getLog().info(
        `Subscriptions after connecting for connection ${connectionId}: ` +
          plan.batches
            .map(
              (batch) =>
                `${batch.topics.length} ${batch.source} topic(s) after ${batch.delayMs}ms` +
                `${batch.merge ? ' (one packet)' : ''}`,
            )
            .join(', '),
      )
    }
  })

  // A reconnect fires 'connect' again and reschedules, so anything pending belongs to a connection
  // that is gone.
  const cancel = () => clearTimers(entry.timers)
  client.on('end', () => {
    if (attached.get(client) === entry) {
      attached.delete(client)
    }
  })
  client.on('close', cancel)
  client.on('offline', cancel)
  client.on('end', cancel)
}

/** Refreshes the record a client plans from, e.g. after the connection was edited. */
export const updateConnectSubscriptions = (connectionId: string, record: ConnectionModel): void => {
  records.set(connectionId, record)
}

/** Cancels everything that is still waiting for its delay, e.g. when the connection is deleted. */
export const detachConnectSubscriptions = (connectionId: string): void => {
  records.delete(connectionId)
  attached.forEach((entry) => {
    if (entry.connectionId === connectionId) {
      clearTimers(entry.timers)
    }
  })
}

const execute = async (
  client: MqttClient,
  connectionId: string,
  record: ConnectionModel,
  batch: ConnectSubscriptionBatch,
): Promise<void> => {
  if (!client.connected) {
    getLog().warn(`Subscriptions skipped: connection ${connectionId} is not connected`)
    return
  }
  if (!batch.merge) {
    for (const item of batch.topics) {
      if (!client.connected) {
        getLog().warn(`Subscriptions stopped: connection ${connectionId} went offline`)
        return
      }
      await subscribeOne(client, connectionId, record, batch, [item])
    }
    return
  }
  await subscribeOne(client, connectionId, record, batch, batch.topics)
}

const subscribeOne = (
  client: MqttClient,
  connectionId: string,
  record: ConnectionModel,
  batch: ConnectSubscriptionBatch,
  topics: ConnectSubscriptionTopic[],
): Promise<void> =>
  new Promise((resolve) => {
    if (topics.length === 1) {
      const [item] = topics
      const options =
        item.row && batch.source === 'manual'
          ? buildRowSubscribeOptions(record.mqttVersion, item.row)
          : { qos: item.qos }
      client.subscribe(item.topic, options, (error, granted) => {
        if (error) {
          getLog().error(`Subscription failed for ${item.topic} (connection ${connectionId}): ${error.toString()}`)
          resolve()
          return
        }
        onSubscribed(client, connectionId, batch, granted?.map((item) => item.topic) ?? [], [item.topic])
        resolve()
      })
      return
    }
    // Merged batch: one map keeps the broker's per-topic QoS, and mqtt.js sends a single packet.
    const map: { [topic: string]: { qos: QoS } } = {}
    topics.forEach((item) => {
      map[item.topic] = { qos: item.qos }
    })
    client.subscribe(map, (error, granted) => {
      if (error) {
        getLog().error(
          `Subscription failed for ${topics.map((item) => item.topic).join(', ')} ` +
            `(connection ${connectionId}): ${error.toString()}`,
        )
        resolve()
        return
      }
      onSubscribed(
        client,
        connectionId,
        batch,
        granted?.map((item) => item.topic) ?? [],
        topics.map((item) => item.topic),
      )
      resolve()
    })
  })

const onSubscribed = async (
  client: MqttClient,
  connectionId: string,
  batch: ConnectSubscriptionBatch,
  grantedTopics: string[],
  requestedTopics: string[],
): Promise<void> => {
  const grantedText = grantedTopics.length ? `, granted ${grantedTopics.join(', ')}` : ''
  getLog().info(
    `Subscribed ${requestedTopics.join(', ')} (connection ${connectionId}, ` +
      `${batch.source}${batch.merge && requestedTopics.length > 1 ? ', one packet' : ''}${grantedText})`,
  )
  if (batch.source === 'auto') {
    // The automatic topics are ours: mqtt.js must not re-subscribe them on its next reconnect, that
    // would happen immediately and defeat the delay the user configured.
    forgetResubscribeTopics(client, requestedTopics)
    await saveSubscriptions(connectionId, requestedTopics)
    notify(connectionId)
  }
}

/**
 * Drops topics from mqtt.js' own re-subscribe bookkeeping.
 *
 * `_resubscribeTopics` is private API, but it is the only way to stop mqtt.js from subscribing a
 * topic the moment a reconnect happens: the automatic subscriptions are scheduled by us, with the
 * delay the user configured.
 */
const forgetResubscribeTopics = (client: MqttClient, topics: string[]) => {
  const bookkeeping = (client as unknown as { _resubscribeTopics?: { [topic: string]: unknown } })._resubscribeTopics
  if (!bookkeeping) {
    return
  }
  topics.forEach((topic) => delete bookkeeping[topic])
}

/**
 * Records what was subscribed, so it shows up in the subscription panel and survives a restart.
 *
 * Only the missing rows are inserted: automatic subscriptions are additions, and rewriting the whole
 * list would race with a subscription the user saves at the same moment.
 */
const saveSubscriptions = async (connectionId: string, topics: string[]): Promise<void> => {
  try {
    const { subscriptionService } = useServices()
    const existing = (await subscriptionService.getSubscriptions(connectionId)) ?? []
    const known = new Set(existing.map((item) => item.topic))
    const added: SubscriptionModel[] = topics
      .filter((topic) => !known.has(topic))
      .map((topic) => ({
        id: getSubscriptionId(),
        topic,
        qos: 0,
        disabled: false,
        color: getRandomColor(),
        createAt: time.getNowDate(),
        // The panel badges these rows until the user touches them.
        autoSubscribed: true,
      }))
    if (!added.length) {
      return
    }
    await subscriptionService.addSubscriptions(connectionId, added)
  } catch (error) {
    getLog().error(`Could not save the subscriptions: ${(error as Error).toString()}`)
  }
}

/** Drops the badge of the rows that the automation no longer owns. */
const syncBadges = async (connectionId: string, ownedTopics: string[]): Promise<void> => {
  const { subscriptionService } = useServices()
  const cleared = await subscriptionService.clearAutoSubscribedOutside(connectionId, ownedTopics)
  if (cleared.length) {
    getLog().info(`No longer part of the automatic subscriptions: ${cleared.join(', ')} (connection ${connectionId})`)
    notify(connectionId)
  }
}
