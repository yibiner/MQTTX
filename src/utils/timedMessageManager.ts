import log4js from 'log4js'
import store from '@/store'
import useServices from '@/database/useServices'
import time from '@/utils/time'
import { getMessageId } from '@/utils/idGenerator'
import { ignoreQoS0Message } from '@/utils/mqttUtils'
import { collectUnresolvedVariables, createPayloadVariableResolver, mergeVariables } from '@/utils/payloadVariables'
import { hasMessageHeaderID } from '@/utils/historyRecordUtils'
import { DEFAULT_HISTORY_MAX_COUNT } from '@/utils/data'
import { getGlobalVariableMap } from '@/utils/configProfiles'

/**
 * Global registry of running timed messages, keyed by connection.
 *
 * Timed messages must NOT live inside the connection view component: switching connections
 * destroys the view (and its `beforeDestroy` runs), while the MQTT client stays connected in
 * the Vuex store. This manager therefore sits at module level, next to the clients:
 *
 * - The mounted connection view registers itself as the publisher, so every tick runs through
 *   the full publish pipeline (history, user script, schema conversion, live message list).
 * - When the view is not mounted, ticks fall back to publishing through the global client:
 *   payload variables are still refilled and history/messages are still saved. That fallback can
 *   reproduce plain payload types, but not a user script, a data schema, MQTT 5 properties or
 *   CBOR/MsgPack encoding -- tasks that need those are paused (skipped) until their connection
 *   page is open again, instead of publishing a payload that differs from what the panel shows.
 *
 * A timed message is only stopped when the user stops it (panel / topbar), when the connection
 * is explicitly disconnected, or when the app closes.
 */
export type TimedMessagePublishDelegate = (message: MessageModel, type: PayloadType) => Promise<void>

export type StartTimedMessageResult = 'ok' | 'limit'

export interface StartTimedMessageOptions {
  /**
   * Set by the caller when the connection has a publish script or a data schema. Such a task can
   * only be published through the connection view: rather than sending the raw template through
   * the fallback (which silently changed what reached the broker), the task is paused while the
   * view is closed and resumes when the user comes back.
   */
  requiresViewPipeline?: boolean
}

interface TimedMessageEntry extends TimedMessageRuntime {
  timeId: ReturnType<typeof setInterval>
  connectionId: string
  message: MessageModel
  type: PayloadType
  requiresViewPipeline: boolean
  /** Whether the user has already been told that this task is paused. */
  degradedNotified: boolean
}

const MAX_TIMED_MESSAGES_PER_CONNECTION = 10

const entries: TimedMessageEntry[] = []
const publishers = new Map<string, TimedMessagePublishDelegate>()
const listeners = new Map<string, Set<(list: TimedMessageRuntime[]) => void>>()

// Lazy: log4js is configured by the log plugin at app startup.
const getLog = () => log4js.getLogger()

/**
 * Payload types the fallback below cannot encode. Sending them as text would put a different
 * payload on the wire, so ticks wait for the view instead.
 */
const VIEW_ONLY_PAYLOAD_TYPES: PayloadType[] = ['CBOR', 'MsgPack']

/** True when this task cannot be reproduced without the connection view. */
function needsViewPipeline(entry: TimedMessageEntry): boolean {
  if (entry.requiresViewPipeline) {
    return true
  }
  if (entry.message.properties && Object.keys(entry.message.properties).length > 0) {
    return true
  }
  return VIEW_ONLY_PAYLOAD_TYPES.includes(entry.type)
}

function isDegraded(entry: TimedMessageEntry): boolean {
  return !publishers.has(entry.connectionId) && needsViewPipeline(entry)
}

/**
 * Whether unregistering the view publisher of this connection would pause one of its tasks.
 * Used by the view to warn the user at the moment it leaves.
 */
export function timedMessagesNeedViewPipeline(connectionId: string): boolean {
  return entries.some((entry) => entry.connectionId === connectionId && needsViewPipeline(entry))
}

function notify(connectionId: string): void {
  const set = listeners.get(connectionId)
  if (!set) {
    return
  }
  const list = listTimedMessages(connectionId)
  set.forEach((cb) => cb(list))
}

export function listTimedMessages(connectionId: string): TimedMessageRuntime[] {
  return entries
    .filter((entry) => entry.connectionId === connectionId)
    .map((entry) => ({
      id: entry.id,
      interval: entry.interval,
      topic: entry.topic,
      nextSendAt: entry.nextSendAt,
      degraded: isDegraded(entry),
    }))
}

export function onChangeTimedMessages(connectionId: string, cb: (list: TimedMessageRuntime[]) => void): () => void {
  let set = listeners.get(connectionId)
  if (!set) {
    set = new Set()
    listeners.set(connectionId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
  }
}

export function registerTimedMessagePublisher(connectionId: string, delegate: TimedMessagePublishDelegate): void {
  publishers.set(connectionId, delegate)
  // Tasks that were paused while this page was closed can run in full again.
  notify(connectionId)
}

export function unregisterTimedMessagePublisher(connectionId: string): void {
  publishers.delete(connectionId)
  notify(connectionId)
}

export function startTimedMessage(
  connectionId: string,
  interval: number,
  message: MessageModel,
  type: PayloadType,
  options: StartTimedMessageOptions = {},
): StartTimedMessageResult {
  if (!interval || interval < 1) {
    return 'ok'
  }
  const runningCount = entries.filter((entry) => entry.connectionId === connectionId).length
  if (runningCount >= MAX_TIMED_MESSAGES_PER_CONNECTION) {
    return 'limit'
  }
  const id = Date.now() + Math.floor(Math.random() * 1000)
  const entry: TimedMessageEntry = {
    id,
    interval,
    topic: message.topic,
    nextSendAt: Date.now() + interval * 1000,
    connectionId,
    message: { ...message },
    type,
    requiresViewPipeline: Boolean(options.requiresViewPipeline),
    degradedNotified: false,
    timeId: undefined as any,
  }
  entry.timeId = setInterval(() => fireTimedMessage(entry), interval * 1000)
  entries.push(entry)
  notify(connectionId)
  syncBackgroundThrottling()
  getLog().info(`Timed message for connection ${connectionId} started with a frequency of ${interval} seconds.`)
  return 'ok'
}

export function stopTimedMessage(connectionId: string, id: number): void {
  const index = entries.findIndex((entry) => entry.connectionId === connectionId && entry.id === id)
  if (index === -1) {
    return
  }
  clearInterval(entries[index].timeId)
  entries.splice(index, 1)
  notify(connectionId)
  syncBackgroundThrottling()
}

/** Stops every timed message of one connection; returns how many were running. */
export function stopAllTimedMessages(connectionId: string): number {
  const stopped = entries.filter((entry) => entry.connectionId === connectionId)
  stopped.forEach((entry) => clearInterval(entry.timeId))
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].connectionId === connectionId) {
      entries.splice(i, 1)
    }
  }
  if (stopped.length) {
    notify(connectionId)
    syncBackgroundThrottling()
  }
  return stopped.length
}

/**
 * Background throttling is only disabled while at least one timed message runs: Chromium
 * otherwise throttles hidden windows and the interval drifts. Keeping it off permanently made
 * the renderer (Monaco, message list) burn CPU in the background for no reason.
 */
function syncBackgroundThrottling(): void {
  if (typeof process === 'undefined' || process.type !== 'renderer') {
    return
  }
  try {
    // Required lazily so that this module stays importable outside a renderer (unit tests).
    const { ipcRenderer } = require('electron')
    ipcRenderer?.send?.('setBackgroundThrottling', entries.length > 0)
  } catch (error) {
    getLog().warn(`Could not update background throttling: ${(error as Error).toString()}`)
  }
}

function fireTimedMessage(entry: TimedMessageEntry): void {
  entry.nextSendAt = Date.now() + entry.interval * 1000
  notify(entry.connectionId)
  const message: MessageModel = { ...entry.message, id: getMessageId() }
  const publisher = publishers.get(entry.connectionId)
  if (publisher) {
    publisher(message, entry.type).catch((error) =>
      getLog().error(`Timed message publish failed: ${(error as Error).toString()}`),
    )
    return
  }
  if (needsViewPipeline(entry)) {
    // Never publish a degraded payload: the user script / schema / properties / payload encoding
    // would be missing, so what reaches the broker would differ from what the panel shows.
    if (!entry.degradedNotified) {
      entry.degradedNotified = true
      getLog().warn(
        `Timed message for connection ${entry.connectionId} is paused: it needs the connection page ` +
          `(user script, data schema, MQTT 5 properties or ${entry.type} encoding).`,
      )
    }
    return
  }
  publishWithoutView(entry.connectionId, message, entry.type)
}

async function publishWithoutView(connectionId: string, message: MessageModel, type: PayloadType): Promise<void> {
  try {
    const activeConnection = (store.state as any).app?.activeConnection?.[connectionId]
    const client = activeConnection?.client
    if (!activeConnection || !client) {
      // The connection was deleted from the list: drop its timed messages entirely.
      getLog().warn(`Timed messages stopped: connection ${connectionId} no longer exists`)
      stopAllTimedMessages(connectionId)
      return
    }
    if (!client.connected) {
      // Temporarily disconnected: skip this tick, keep the task so it resumes on reconnect.
      getLog().warn(`Timed message skipped: connection ${connectionId} is not connected`)
      return
    }
    // User-defined variables ("全局变量") refill on every tick, exactly like the built-in ones.
    // Without the connection page there is nobody to ask for confirmation, so a tick with an
    // unresolved placeholder is skipped instead of publishing the raw template; the probe below
    // does not touch the counters, the message that really goes out is resolved once more.
    // Without the connection page the variables of the client are read from the database, so a
    // tick sees an edit the user made after the timed message was started.
    const { connectionService } = useServices()
    const clientVariables = await connectionService.getVariables(connectionId)
    const variables = mergeVariables(clientVariables, getGlobalVariableMap())
    const texts = ['Plaintext', 'JSON'].includes(type) ? [message.topic, message.payload as string] : [message.topic]
    const unresolved = collectUnresolvedVariables(variables, texts)
    if (unresolved.length) {
      getLog().warn(`Timed message skipped: unresolved variables ${unresolved.join(', ')} (connection ${connectionId})`)
      return
    }
    const resolver = createPayloadVariableResolver({ variables })
    const wireTopic = resolver.resolve(message.topic)
    let filledPayload: string | Buffer | undefined = message.payload
    if (filledPayload && ['JSON', 'Plaintext'].includes(type)) {
      filledPayload = resolver.resolve(filledPayload as string)
    }
    resolver.commit()
    await saveTimedMessageHistory(connectionId, message, filledPayload, type)
    const wirePayload = convertPayloadForFallback(filledPayload, type)
    if (wirePayload === undefined || wirePayload === '') {
      return
    }
    client.publish(wireTopic, wirePayload, { qos: message.qos, retain: message.retain }, (err: Error | undefined) => {
      if (err) {
        getLog().error(`Timed message publish failed: ${err.toString()}`)
      }
    })
  } catch (error) {
    getLog().error(`Timed message publish failed: ${(error as Error).toString()}`)
  }
}

/**
 * Mirrors the view pipeline's storage behavior: the publish history keeps the raw template
 * (dedupe + bump), while the message list entry keeps the filled payload.
 */
async function saveTimedMessageHistory(
  connectionId: string,
  template: MessageModel,
  publishedPayload: string | Buffer | undefined,
  type: PayloadType,
): Promise<void> {
  try {
    const appState = (store.state as any).app ?? {}
    const saveHistoryMessage: boolean = appState.saveHistoryMessage ?? true
    const { historyMessageHeaderService, messageService } = useServices()
    const header: HistoryMessageHeaderModel = {
      connectionId,
      qos: template.qos,
      retain: template.retain,
      topic: template.topic,
      ...(saveHistoryMessage ? { payload: template.payload, payloadType: type } : {}),
    }
    const recordIdToUpdate = await hasMessageHeaderID(header, saveHistoryMessage)
    recordIdToUpdate
      ? await historyMessageHeaderService.updateCreateAt(recordIdToUpdate)
      : await historyMessageHeaderService.create(header)
    await historyMessageHeaderService.trim(appState.historyMaxCount ?? DEFAULT_HISTORY_MAX_COUNT)
    if (publishedPayload === undefined || publishedPayload === '' || ignoreQoS0Message(template.qos)) {
      return
    }
    await messageService.pushMsgsToConnection(
      [
        {
          id: template.id,
          out: true,
          createAt: time.getNowDate(),
          topic: template.topic,
          payload: publishedPayload.toString(),
          qos: template.qos,
          retain: template.retain,
        },
      ],
      connectionId,
    )
  } catch (error) {
    getLog().error(`Timed message history save failed: ${(error as Error).toString()}`)
  }
}

function convertPayloadForFallback(
  payload: string | Buffer | undefined,
  type: PayloadType,
): string | Buffer | undefined {
  if (payload === undefined || payload === null || payload === '') {
    return payload
  }
  const text = String(payload)
  switch (type) {
    case 'Base64':
      return Buffer.from(text, 'base64')
    case 'Hex':
      return Buffer.from(text.replace(/\s+/g, ''), 'hex')
    case 'CBOR':
    case 'MsgPack':
      // Not reachable through fireTimedMessage() any more (such tasks are paused), kept as a
      // safety net in case the fallback is ever called directly.
      getLog().warn(`Timed message: ${type} encoding is skipped while the connection view is closed`)
      return text
    default:
      return text
  }
}

// No task is running yet at module load, so the renderer may be throttled in the background
// until the user starts one (see syncBackgroundThrottling).
syncBackgroundThrottling()
