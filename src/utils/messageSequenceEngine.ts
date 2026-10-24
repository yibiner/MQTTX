import log4js from 'log4js'
import type { MqttClient, OnMessageCallback } from 'mqtt'
import { mightMatchIncomingTopic, matchesAutoReplyRule } from '@/utils/autoReply'
import { savePublishedMessageHistory, publishedPayloadType } from '@/utils/historyRecordUtils'
import { getMessageId } from '@/utils/idGenerator'
import {
  applyAutoReplyVariableActions,
  connectionVariableOptions,
  createPayloadVariableResolver,
  peekDefinitionValue,
} from '@/utils/payloadVariables'
import { parseJsonPayload } from '@/utils/jmesPathCondition'
import { setRendererScheduling } from '@/utils/rendererScheduling'
import time from '@/utils/time'

/**
 * Message sequences: several publishes, each delayed from the previous one.
 *
 * A single automatic reply still resolves its payload when the message matches. A sequence
 * does the opposite, because the next step has to see the variable the previous step just
 * wrote (the water loop). At each step the topic, the payload and the assignment templates
 * are resolved together, the message is published, and only then are the variables written.
 *
 * The loop condition is checked after the last step, before another round starts. The first
 * round always runs. Disconnect, a manual stop, disabling the sequence, or starting it
 * again cancels the steps that have not been sent. Nothing is replayed on the next connect.
 *
 * Publishing goes out through the same client the user publishes with. The engine never
 * takes that client over, so a manual publish and any other incoming message keep working
 * while a sequence is waiting.
 */

/** More than this many steps in one second means a delay-0 loop is spinning. Stop it. */
const MAX_STEPS_PER_SECOND = 20
/** setTimeout treats a delay above 2^31-1 as 1ms, which would fire a long step immediately. */
const MAX_DELAY_MS = 2147483647
/**
 * How long an echo of a sequence's own publish is ignored, so that sequence does not
 * retrigger itself. The mark is per connection and per sequence: another sequence, or
 * another connection, still sees the same topic and payload.
 */
const OWN_PUBLISH_TTL = 5000

interface TriggerMessage {
  topic: string
  /** the received payload parsed as JSON; undefined when it was not JSON */
  payload: unknown
}

interface SequenceRun {
  /** identity of this run; a newer run of the same sequence gets a different one */
  generation: number
  timer?: ReturnType<typeof setTimeout>
  /** the step this run will send next */
  stepIndex: number
  /** timestamps of recent steps, for the spin guard */
  fires: number[]
  /** delay the pending timer was armed with; a later edit of that step rearms it */
  scheduledDelayMs: number
  /** the message that started a message-triggered run; later steps still read this one */
  message?: TriggerMessage
}

interface AttachedSequences {
  connectionId: string
  onMessage: OnMessageCallback
  onConnect: () => void
  onClose: () => void
}

const records = new Map<string, ConnectionModel>()
const runs = new Map<string, Map<string, SequenceRun>>()
const attached = new Map<MqttClient, AttachedSequences>()
const clients = new Map<string, MqttClient>()
const ownPublishes = new Map<string, number>()
const reportedErrors = new Set<string>()
let nextGeneration = 1

type PublishedListener = (connectionId: string, message: MessageModel) => void
type RunsListener = (connectionId: string) => void
const publishedListeners = new Set<PublishedListener>()
const runsListeners = new Set<RunsListener>()

const getLog = () => log4js.getLogger()

const normalizeDelay = (delayMs: unknown): number => {
  const value = Number(delayMs)
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.min(Math.round(value), MAX_DELAY_MS)
}

const normalizeQos = (qos: unknown): QoS => {
  const value = Number(qos)
  if (value === 1 || value === 2) {
    return value
  }
  return 0
}

/** FNV-1a plus the length, so the echo guard does not retain the payload text. */
const ownPublishKey = (connectionId: string, sequenceId: string, topic: string, payload: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `${connectionId}\u0000${sequenceId}\u0000${topic}\u0000${payload.length}\u0000${hash >>> 0}`
}

const markOwnPublish = (connectionId: string, sequenceId: string, topic: string, payload: string): void => {
  const now = Date.now()
  ownPublishes.set(ownPublishKey(connectionId, sequenceId, topic, payload), now)
  if (ownPublishes.size < 80) {
    return
  }
  ownPublishes.forEach((stamp, key) => {
    if (now - stamp > OWN_PUBLISH_TTL) {
      ownPublishes.delete(key)
    }
  })
}

const isOwnPublish = (connectionId: string, sequenceId: string, topic: string, payload: string): boolean => {
  const stamp = ownPublishes.get(ownPublishKey(connectionId, sequenceId, topic, payload))
  return stamp !== undefined && Date.now() - stamp <= OWN_PUBLISH_TTL
}

const reportOnce = (key: string, message: string): void => {
  if (reportedErrors.has(key)) {
    return
  }
  reportedErrors.add(key)
  getLog().warn(message)
}

const clearReported = (connectionId: string): void => {
  const prefix = `${connectionId}|`
  reportedErrors.forEach((key) => {
    if (key.startsWith(prefix)) {
      reportedErrors.delete(key)
    }
  })
}

const notifyPublished = (connectionId: string, message: MessageModel): void => {
  publishedListeners.forEach((listener) => {
    try {
      listener(connectionId, message)
    } catch (error) {
      getLog().error(`Message sequence listener failed: ${(error as Error).toString()}`)
    }
  })
}

const notifyRuns = (connectionId: string): void => {
  runsListeners.forEach((listener) => {
    try {
      listener(connectionId)
    } catch (error) {
      getLog().error(`Message sequence run listener failed: ${(error as Error).toString()}`)
    }
  })
}

const syncScheduling = (): void => {
  let active = false
  runs.forEach((map) => {
    if (map.size > 0) {
      active = true
    }
  })
  setRendererScheduling('message-sequences', active)
}

const sequenceOf = (record: ConnectionModel | undefined, sequenceId: string): MessageSequenceModel | undefined =>
  record?.messageSequences?.find((item) => item?.id === sequenceId)

const asRule = (sequence: MessageSequenceModel): AutoReplyRuleModel => ({
  id: sequence.id,
  name: sequence.name ?? '',
  enabled: sequence.enabled !== false,
  matchTopic: sequence.matchTopic ?? '',
  matchCondition: sequence.matchCondition ?? '',
  reply: { topic: '', mode: 'fixed', payload: '', qos: 0, retain: false, delayMs: 0 },
})

/**
 * The client this connection publishes with.
 *
 * The page attaches it on connect. Opening a connection that was already up (the view is
 * reused) still finds the client in the store and attaches then, without replaying the
 * connect event: a connect-triggered sequence starts on connect, not on every page visit.
 */
const ensureClient = (connectionId: string): MqttClient | undefined => {
  const known = clients.get(connectionId)
  if (known) {
    return known
  }
  try {
    const store = require('@/store').default
    const client = store?.state?.app?.activeConnection?.[connectionId]?.client as MqttClient | undefined
    if (client && typeof client.on === 'function') {
      attachMessageSequences(client, connectionId)
      return client
    }
  } catch (error) {
    return undefined
  }
  return undefined
}

const liveRun = (connectionId: string, sequenceId: string, generation: number): SequenceRun | undefined => {
  const run = runs.get(connectionId)?.get(sequenceId)
  if (!run || run.generation !== generation) {
    return undefined
  }
  return run
}

const cancelRun = (connectionId: string, sequenceId: string): boolean => {
  const map = runs.get(connectionId)
  const run = map?.get(sequenceId)
  if (!run || !map) {
    return false
  }
  // The in-flight step captured this generation. Invalidating it stops the step from
  // writing variables or scheduling whatever comes after, even if the publish already left.
  run.generation = -1
  if (run.timer) {
    clearTimeout(run.timer)
    run.timer = undefined
  }
  map.delete(sequenceId)
  if (!map.size) {
    runs.delete(connectionId)
  }
  return true
}

const finish = (connectionId: string, sequenceId: string): void => {
  if (cancelRun(connectionId, sequenceId)) {
    notifyRuns(connectionId)
    syncScheduling()
  }
}

const tooFast = (run: SequenceRun): boolean => {
  const now = Date.now()
  run.fires = run.fires.filter((stamp) => now - stamp < 1000)
  run.fires.push(now)
  return run.fires.length > MAX_STEPS_PER_SECOND
}

const compareStop = (op: MessageSequenceCompare, left: number, right: number): boolean => {
  switch (op) {
    case 'lt':
      return left < right
    case 'lte':
      return left <= right
    case 'gt':
      return left > right
    case 'gte':
      return left >= right
    case 'eq':
      return left === right
    default:
      return false
  }
}

/**
 * Whether another round must not start.
 *
 * Called only after a round finished. An empty variable name is not a condition, so the
 * loop keeps going. A name that does not resolve to a number stops the loop: a broken
 * condition must not publish forever.
 */
const shouldStopLoop = (connectionId: string, sequence: MessageSequenceModel, record: ConnectionModel): boolean => {
  if (!sequence.loop) {
    return true
  }
  const stop = sequence.stopWhen
  const name = stop?.variable?.trim() ?? ''
  if (!name) {
    return false
  }
  const definition = connectionVariableOptions(record).definitions[name]
  const current = definition ? peekDefinitionValue(definition) : undefined
  const numeric = typeof current === 'number' ? current : Number(String(current ?? '').trim())
  if (!Number.isFinite(numeric)) {
    reportOnce(
      `${connectionId}|${sequence.id}|stop`,
      `Message sequence "${sequence.name || sequence.id}" stopped: "${name}" is not a number`,
    )
    return true
  }
  const target = Number(stop?.value)
  if (!Number.isFinite(target)) {
    return true
  }
  return compareStop(stop?.op ?? 'lt', numeric, target)
}

const schedule = (connectionId: string, sequenceId: string, run: SequenceRun, delayMs: number): void => {
  if (run.timer) {
    clearTimeout(run.timer)
  }
  const generation = run.generation
  const delay = normalizeDelay(delayMs)
  // Remember the delay that was armed. registerMessageSequences rearms only when an edit
  // changed it, so saving the form does not postpone a step that is already waiting.
  run.scheduledDelayMs = delay
  run.timer = setTimeout(() => {
    run.timer = undefined
    void fireStep(connectionId, sequenceId, generation)
  }, delay)
}

const advance = (
  connectionId: string,
  sequenceId: string,
  run: SequenceRun,
  sequence: MessageSequenceModel,
  record: ConnectionModel,
): void => {
  const next = run.stepIndex + 1
  if (next < sequence.steps.length) {
    run.stepIndex = next
    schedule(connectionId, sequenceId, run, sequence.steps[next]?.delayMs)
    return
  }
  if (shouldStopLoop(connectionId, sequence, record)) {
    finish(connectionId, sequenceId)
    return
  }
  run.stepIndex = 0
  schedule(connectionId, sequenceId, run, sequence.steps[0]?.delayMs)
}

const publishStep = (client: MqttClient, topic: string, payload: string, qos: QoS, retain: boolean): Promise<void> =>
  new Promise((resolve, reject) => {
    client.publish(topic, payload, { qos, retain }, (error?: Error) => {
      error ? reject(error) : resolve()
    })
  })

/**
 * Sends one step, then writes its variables.
 *
 * Resolution and the assignment templates share one resolver, so `${water - 20}` in the
 * payload and in the assignment is the same number. The write happens after the publish:
 * the payload still describes the value from before this step.
 */
const fireStep = async (connectionId: string, sequenceId: string, generation: number): Promise<void> => {
  const run = liveRun(connectionId, sequenceId, generation)
  // A newer run, a stop or a disconnect already owns this sequence. Do not finish() here:
  // that would cancel the run that replaced this one.
  if (!run) {
    return
  }
  const record = records.get(connectionId)
  const sequence = sequenceOf(record, sequenceId)
  const step = sequence?.steps?.[run.stepIndex]
  if (!record || !sequence || sequence.enabled === false || !step) {
    finish(connectionId, sequenceId)
    return
  }
  if (tooFast(run)) {
    reportOnce(
      `${connectionId}|${sequenceId}|spin`,
      `Message sequence "${sequence.name || sequenceId}" stopped: steps were firing without a delay`,
    )
    finish(connectionId, sequenceId)
    return
  }
  const client = ensureClient(connectionId)
  if (!client?.connected) {
    getLog().warn(
      `Message sequence "${sequence.name || sequenceId}" stopped: connection ${connectionId} is not connected`,
    )
    finish(connectionId, sequenceId)
    return
  }

  const options = connectionVariableOptions(record)
  const resolver = createPayloadVariableResolver({
    ...options,
    message: run.message?.payload,
    topic: run.message?.topic,
    messageContext: Boolean(run.message),
  })
  const topic = resolver.resolve(step.topic ?? '').trim()
  const payload = resolver.resolve(step.payload ?? '')
  const setVariables = (step.actions?.setVariables ?? [])
    .map((item) => ({ name: String(item?.name ?? '').trim(), value: resolver.resolve(item?.value ?? '') }))
    .filter((item) => item.name !== '')
  if (!topic || resolver.unresolved.length) {
    const reason = !topic ? 'the step has no topic' : `unresolved variables ${resolver.unresolved.join(', ')}`
    reportOnce(
      `${connectionId}|${sequenceId}|${run.stepIndex}|resolve`,
      `Message sequence "${sequence.name || sequenceId}" stopped: ${reason}`,
    )
    finish(connectionId, sequenceId)
    return
  }
  const definitions = options.definitions
  const missing = setVariables.find((item) => !definitions[item.name]?.stateKey)
  if (missing) {
    reportOnce(
      `${connectionId}|${sequenceId}|assign|${missing.name}`,
      `Message sequence "${sequence.name || sequenceId}" stopped: "${
        missing.name
      }" cannot be assigned (it needs a stateful variable)`,
    )
    finish(connectionId, sequenceId)
    return
  }

  const qos = normalizeQos(step.qos)
  const retain = Boolean(step.retain)
  // Stopped or replaced while the templates were being resolved: do not publish the old step.
  if (!liveRun(connectionId, sequenceId, generation)) {
    return
  }
  // Mark before the publish leaves. A local broker can deliver the echo inside the publish
  // callback, which is before this function resumes.
  markOwnPublish(connectionId, sequenceId, topic, payload)
  try {
    await publishStep(client, topic, payload, qos, retain)
  } catch (error) {
    getLog().error(
      `Message sequence "${sequence.name || sequenceId}" could not publish step ${run.stepIndex + 1}: ${(
        error as Error
      ).toString()}`,
    )
    if (liveRun(connectionId, sequenceId, generation)) {
      finish(connectionId, sequenceId)
    }
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
  // The broker already accepted this step. Record it even when a stop or a retrigger won
  // the race during the publish: the bytes left, so the conversation and the history keep them.
  notifyPublished(connectionId, message)
  getLog().info(
    `Message sequence "${sequence.name || sequenceId}" sent step ${run.stepIndex + 1}/${
      sequence.steps.length
    } on ${topic} (connection ${connectionId})`,
  )
  try {
    void savePublishedMessageHistory(connectionId, message, payload, publishedPayloadType(payload), topic).catch(
      (error) => {
        getLog().error(
          `Message sequence "${sequence.name || sequenceId}" could not be saved: ${(error as Error).toString()}`,
        )
      },
    )
  } catch (error) {
    getLog().error(
      `Message sequence "${sequence.name || sequenceId}" could not be saved: ${(error as Error).toString()}`,
    )
  }
  // Do not move variables or send the rest of a run that was cancelled while this step was in flight.
  if (!liveRun(connectionId, sequenceId, generation)) {
    return
  }

  resolver.commit()
  applyAutoReplyVariableActions(record, {
    resetVariables: step.actions?.resetVariables,
    setVariables,
  })
  // The next delay starts now, not after the history write. A database problem must not
  // stall the device or swallow a message the broker already has.
  advance(connectionId, sequenceId, run, sequence, record)
}

const begin = (connectionId: string, sequenceId: string, trigger?: TriggerMessage): boolean => {
  const record = records.get(connectionId)
  const sequence = sequenceOf(record, sequenceId)
  if (!record || !sequence || sequence.enabled === false || !sequence.steps?.length) {
    return false
  }
  const client = ensureClient(connectionId)
  if (!client?.connected) {
    getLog().warn(
      `Message sequence "${sequence.name || sequenceId}" was not started: connection ${connectionId} is not connected`,
    )
    return false
  }
  // Starting the same sequence again drops the steps that have not been sent yet.
  cancelRun(connectionId, sequenceId)
  const run: SequenceRun = {
    generation: nextGeneration,
    stepIndex: 0,
    fires: [],
    scheduledDelayMs: 0,
    ...(trigger ? { message: trigger } : {}),
  }
  nextGeneration += 1
  let map = runs.get(connectionId)
  if (!map) {
    map = new Map()
    runs.set(connectionId, map)
  }
  map.set(sequenceId, run)
  notifyRuns(connectionId)
  syncScheduling()
  getLog().info(`Message sequence "${sequence.name || sequenceId}" started (connection ${connectionId})`)
  schedule(connectionId, sequenceId, run, sequence.steps[0]?.delayMs)
  return true
}

const startConnectSequences = (connectionId: string): void => {
  const record = records.get(connectionId)
  ;(record?.messageSequences ?? []).forEach((sequence) => {
    if (sequence && sequence.enabled !== false && sequence.trigger === 'connect') {
      begin(connectionId, sequence.id)
    }
  })
}

const handleIncoming = (connectionId: string, topic: string, payload: Buffer | string): void => {
  const record = records.get(connectionId)
  const sequences = (record?.messageSequences ?? []).filter(
    (sequence) => sequence && sequence.enabled !== false && sequence.trigger === 'message',
  )
  if (!sequences.length || !topic) {
    return
  }
  const text = typeof payload === 'string' ? payload : payload?.toString?.() ?? ''
  // Only the sequence that just published this payload ignores it. A sibling sequence on
  // this connection, and every other connection, still get to match.
  const incoming = sequences.filter((sequence) => !isOwnPublish(connectionId, sequence.id, topic, text))
  if (!incoming.length) {
    return
  }
  const options = connectionVariableOptions(record)
  const rules = incoming.map(asRule)
  if (!mightMatchIncomingTopic(rules, topic, { definitions: options.definitions, connectionId })) {
    return
  }
  const parsed = parseJsonPayload(text)
  incoming.forEach((sequence) => {
    const result = matchesAutoReplyRule(asRule(sequence), {
      topic,
      payload,
      definitions: options.definitions,
      connectionId,
    })
    if (result.error) {
      reportOnce(
        `${connectionId}|${sequence.id}|match`,
        `Message sequence "${sequence.name || sequence.id}": ${result.error}`,
      )
    }
    if (!result.matched) {
      return
    }
    begin(connectionId, sequence.id, { topic, payload: parsed.value })
  })
}

/** Subscribes to the publishes of every sequence; returns the unsubscribe function. */
export const onMessageSequencePublished = (listener: PublishedListener): (() => void) => {
  publishedListeners.add(listener)
  return () => {
    publishedListeners.delete(listener)
  }
}

/** Fired when a connection gains or loses a running sequence. */
export const onMessageSequenceRunsChanged = (listener: RunsListener): (() => void) => {
  runsListeners.add(listener)
  return () => {
    runsListeners.delete(listener)
  }
}

/** Ids of the sequences that still have a step waiting or in flight. */
export const runningMessageSequenceIds = (connectionId: string): string[] =>
  Array.from(runs.get(connectionId)?.keys() ?? [])

/**
 * Remembers the sequences of one connection.
 *
 * A sequence that was removed or disabled is cancelled here, so saving the form stops it
 * without waiting for the next delay. The body of a step is read when that step fires.
 * The delay of a step that is already waiting is rearmed when it changed.
 */
export const registerMessageSequences = (connectionId: string, record: ConnectionModel): void => {
  records.set(connectionId, record)
  clearReported(connectionId)
  const live = new Set(
    (record.messageSequences ?? [])
      .filter((sequence) => sequence && sequence.enabled !== false && sequence.steps?.length)
      .map((sequence) => sequence.id),
  )
  const current = runs.get(connectionId)
  if (current) {
    let cancelled = false
    Array.from(current.keys()).forEach((sequenceId) => {
      if (!live.has(sequenceId)) {
        cancelled = cancelRun(connectionId, sequenceId) || cancelled
        return
      }
      const run = current.get(sequenceId)
      // No timer: this step is inside fireStep and already has its payload. The next
      // schedule reads the edited delay.
      if (!run?.timer) {
        return
      }
      const step = sequenceOf(record, sequenceId)?.steps?.[run.stepIndex]
      if (!step) {
        cancelled = cancelRun(connectionId, sequenceId) || cancelled
        return
      }
      const delay = normalizeDelay(step.delayMs)
      if (delay !== run.scheduledDelayMs) {
        schedule(connectionId, sequenceId, run, delay)
      }
    })
    if (cancelled) {
      notifyRuns(connectionId)
      syncScheduling()
    }
  }
  ensureClient(connectionId)
}

/** Forgets a connection and cancels its sequences, e.g. when it is deleted. */
export const unregisterMessageSequences = (connectionId: string): void => {
  stopAllMessageSequences(connectionId)
  records.delete(connectionId)
  clearReported(connectionId)
  const client = clients.get(connectionId)
  if (client) {
    detachMessageSequences(client)
  }
}

/**
 * Attaches the sequence runner to the MQTT client of a connection.
 *
 * Safe to call again: the listeners stay, and the connection id is refreshed. `close`
 * cancels unfinished steps (a reconnect must not continue a half-sent OTA). `connect`
 * starts the sequences whose trigger is "connect", from the first step.
 */
export const attachMessageSequences = (client: MqttClient, connectionId: string): void => {
  const existing = attached.get(client)
  if (existing) {
    if (clients.get(existing.connectionId) === client) {
      clients.delete(existing.connectionId)
    }
    existing.connectionId = connectionId
    clients.set(connectionId, client)
    return
  }
  const onConnect = () => {
    const currentId = attached.get(client)?.connectionId
    if (currentId) {
      startConnectSequences(currentId)
    }
  }
  const onClose = () => {
    const currentId = attached.get(client)?.connectionId
    if (currentId) {
      stopAllMessageSequences(currentId)
    }
  }
  const onMessage: OnMessageCallback = (topic, payload) => {
    const currentId = attached.get(client)?.connectionId
    if (!currentId) {
      return
    }
    handleIncoming(currentId, topic, payload)
  }
  attached.set(client, { connectionId, onMessage, onConnect, onClose })
  clients.set(connectionId, client)
  client.on('connect', onConnect)
  client.on('close', onClose)
  client.on('message', onMessage)
  client.once('end', () => detachMessageSequences(client))
}

/** Removes the sequence listeners of a client. Unfinished steps are cancelled. */
export const detachMessageSequences = (client: MqttClient): void => {
  const current = attached.get(client)
  if (!current) {
    return
  }
  attached.delete(client)
  if (clients.get(current.connectionId) === client) {
    clients.delete(current.connectionId)
  }
  stopAllMessageSequences(current.connectionId)
  client.removeListener('message', current.onMessage)
  client.removeListener('connect', current.onConnect)
  client.removeListener('close', current.onClose)
}

/** Starts one sequence from its first step. A run that was already going is cancelled first. */
export const startMessageSequence = (connectionId: string, sequenceId: string): boolean =>
  begin(connectionId, sequenceId)

/** Cancels the unfinished steps of one sequence. */
export const stopMessageSequence = (connectionId: string, sequenceId: string): void => {
  if (cancelRun(connectionId, sequenceId)) {
    notifyRuns(connectionId)
    syncScheduling()
  }
}

/** Cancels every unfinished sequence of a connection. Returns how many were running. */
export const stopAllMessageSequences = (connectionId: string): number => {
  const map = runs.get(connectionId)
  if (!map?.size) {
    return 0
  }
  const ids = Array.from(map.keys())
  ids.forEach((sequenceId) => cancelRun(connectionId, sequenceId))
  notifyRuns(connectionId)
  syncScheduling()
  return ids.length
}

/** Test helper: drop runs, listeners on clients, and the echo guard. */
export const resetMessageSequenceState = (): void => {
  Array.from(runs.keys()).forEach((connectionId) => stopAllMessageSequences(connectionId))
  Array.from(attached.keys()).forEach((client) => detachMessageSequences(client))
  records.clear()
  clients.clear()
  ownPublishes.clear()
  reportedErrors.clear()
}
