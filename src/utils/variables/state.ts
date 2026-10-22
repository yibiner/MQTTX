import { v4 as uuidv4 } from 'uuid'
import { deletePayloadCounter, readPayloadCounter } from './counters'
import { connectionStateKey, globalStateKey, sessionStateKey } from './definitions'
import type { ResolvedVariableDefinition } from './definitions'

/**
 * Runtime state of the stateful variables ("可变变量").
 *
 * The value of a `${wf116wight}` that counts down does not belong in the definition (that is the
 * default and the rule); it belongs in a small local store, keyed by its scope:
 *
 *   g:<global variable id>            one value for every connection (a global preset variable)
 *   c:<connection id>:<variable name> one value per connection ("每个客户端使用不同的值")
 *   s:<connection id>                 session clock + messages sent in the session
 *
 * Writes are coalesced like the legacy counters, and reads prefer a local write that has not
 * reached the disk yet. A definition may ask for a lazy periodic reset (`resetEverySec`): the
 * reset happens on the next read, so no timer has to keep running in the background.
 */

const STATE_STORE_KEY = 'variableStates'
const SESSION_STORE_KEY = 'variableSessions'
/**
 * Runtime state lives in its own electron-store file instead of the preset `config.json`.
 *
 * The preset lists are read through a short TTL cache on the publish path (the file is re-read and
 * parsed as a whole by `conf`), so keeping a growing map of per-connection values in the same file
 * made every preset read more expensive as the state grew. A separate file keeps both sides small.
 */
const STATE_STORE_FILE = 'variable-state'
const FLUSH_DELAY = 500

export interface VariableStateRecord {
  /** the current value of a sequence / randomWalk / session / captured variable */
  value: number | string
  /** number of draws of a seeded random / choice variable */
  counter?: number
  updatedAt: number
  /** last explicit reset, used by `resetEverySec` (falls back to updatedAt when absent) */
  lastResetAt?: number
}

export interface ConnectionSessionState {
  startedAt: number
  sentCount: number
  updatedAt: number
}

let persistentStore: any | null | undefined
const memoryStates = new Map<string, VariableStateRecord>()
const memorySessions = new Map<string, ConnectionSessionState>()
const dirtyStates = new Set<string>()
const dirtySessions = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
/** Short lived cache of the whole persisted object: the editors read current values during render. */
const PERSISTED_CACHE_TTL = 500
let persistedStateCache: { data: { [key: string]: VariableStateRecord }; readAt: number } | null = null
let persistedSessionCache: { data: { [key: string]: ConnectionSessionState }; readAt: number } | null = null

/**
 * Moves the state an earlier build kept inside `config.json` into the state file, once.
 *
 * `variableStates` / `variableSessions` used to be top-level keys of the default store. They are
 * copied into the dedicated store and removed from the preset file; an already migrated store wins.
 */
const migrateLegacyStateStore = (Store: any, store: any): void => {
  try {
    const legacy = new Store()
    const legacyStates = legacy.get(STATE_STORE_KEY)
    const legacySessions = legacy.get(SESSION_STORE_KEY)
    if (legacyStates !== undefined) {
      if (store.get(STATE_STORE_KEY) === undefined) {
        store.set(STATE_STORE_KEY, legacyStates)
      }
      legacy.delete(STATE_STORE_KEY)
    }
    if (legacySessions !== undefined) {
      if (store.get(SESSION_STORE_KEY) === undefined) {
        store.set(SESSION_STORE_KEY, legacySessions)
      }
      legacy.delete(SESSION_STORE_KEY)
    }
  } catch (error) {
    // Migration is best effort: losing the runtime values only means the next send starts from the
    // definition's default; it must never prevent the app from starting.
  }
}

const getPersistentStore = (): any | null => {
  if (persistentStore === undefined) {
    if (process.type !== 'renderer') {
      // Outside Electron (unit tests / plain Node): keep the state in memory.
      persistentStore = null
      return persistentStore
    }
    try {
      const Store = require('electron-store')
      persistentStore = new Store({ name: STATE_STORE_FILE })
      migrateLegacyStateStore(Store, persistentStore)
    } catch (error) {
      // Fall back to the default store if a named file cannot be created for some reason.
      try {
        const Store = require('electron-store')
        persistentStore = new Store()
      } catch (fallbackError) {
        persistentStore = null
      }
    }
  }
  return persistentStore
}

const flushVariableStates = (): void => {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const store = getPersistentStore()
  if (!store || (dirtyStates.size === 0 && dirtySessions.size === 0)) {
    dirtyStates.clear()
    dirtySessions.clear()
    return
  }
  const pendingStates = Array.from(dirtyStates)
  const pendingSessions = Array.from(dirtySessions)
  dirtyStates.clear()
  dirtySessions.clear()
  persistedStateCache = null
  persistedSessionCache = null
  try {
    if (pendingStates.length) {
      const all = { ...(store.get(STATE_STORE_KEY) ?? {}) }
      pendingStates.forEach((key) => {
        const record = memoryStates.get(key)
        if (record) {
          all[key] = record
        } else {
          delete all[key]
        }
      })
      store.set(STATE_STORE_KEY, all)
    }
    if (pendingSessions.length) {
      const sessions = { ...(store.get(SESSION_STORE_KEY) ?? {}) }
      pendingSessions.forEach((key) => {
        const session = memorySessions.get(key)
        if (session) {
          sessions[key] = session
        } else {
          delete sessions[key]
        }
      })
      store.set(SESSION_STORE_KEY, sessions)
    }
  } catch (error) {
    // A failing state write must never break the publish itself.
  }
}

const scheduleFlush = (): void => {
  if (flushTimer) {
    return
  }
  flushTimer = setTimeout(flushVariableStates, FLUSH_DELAY)
  ;(flushTimer as any)?.unref?.()
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', flushVariableStates)
  window.addEventListener('pagehide', flushVariableStates)
}

const readAllPersisted = (): { [key: string]: VariableStateRecord } => {
  if (persistedStateCache && Date.now() - persistedStateCache.readAt < PERSISTED_CACHE_TTL) {
    return persistedStateCache.data
  }
  const store = getPersistentStore()
  if (!store) {
    return {}
  }
  try {
    const all = store.get(STATE_STORE_KEY)
    const data = all && typeof all === 'object' && !Array.isArray(all) ? all : {}
    persistedStateCache = { data, readAt: Date.now() }
    return data
  } catch (error) {
    return {}
  }
}

const readAllPersistedSessions = (): { [key: string]: ConnectionSessionState } => {
  if (persistedSessionCache && Date.now() - persistedSessionCache.readAt < PERSISTED_CACHE_TTL) {
    return persistedSessionCache.data
  }
  const store = getPersistentStore()
  if (!store) {
    return {}
  }
  try {
    const all = store.get(SESSION_STORE_KEY)
    const data = all && typeof all === 'object' && !Array.isArray(all) ? all : {}
    persistedSessionCache = { data, readAt: Date.now() }
    return data
  } catch (error) {
    return {}
  }
}

/** The current record of a state key, including a value written locally but not flushed yet. */
export const readVariableState = (stateKey: string): VariableStateRecord | undefined => {
  if (memoryStates.has(stateKey)) {
    return memoryStates.get(stateKey)
  }
  if (dirtyStates.has(stateKey)) {
    return memoryStates.get(stateKey)
  }
  return readAllPersisted()[stateKey]
}

export const writeVariableState = (
  stateKey: string,
  value: number | string,
  extra: { counter?: number; lastResetAt?: number } = {},
): VariableStateRecord => {
  const previous = readVariableState(stateKey)
  const record: VariableStateRecord = {
    value,
    counter: extra.counter,
    updatedAt: Date.now(),
    // `resetEverySec` is a wall-clock interval: it counts from the last reset (or the first use),
    // not from the last send, so a busy connection still resets on schedule.
    lastResetAt: extra.lastResetAt ?? previous?.lastResetAt ?? Date.now(),
  }
  memoryStates.set(stateKey, record)
  dirtyStates.add(stateKey)
  scheduleFlush()
  return record
}

/** Deletes the stored value of one variable, so the next read starts from its default again. */
export const deleteVariableState = (stateKey: string): void => {
  memoryStates.delete(stateKey)
  dirtyStates.add(stateKey)
  scheduleFlush()
}

const deleteVariableStatesByPrefix = (prefix: string): void => {
  Array.from(memoryStates.keys()).forEach((key) => {
    if (key.startsWith(prefix)) {
      memoryStates.delete(key)
      dirtyStates.add(key)
    }
  })
  Object.keys(readAllPersisted()).forEach((key) => {
    if (key.startsWith(prefix) && !memoryStates.has(key)) {
      // Mark the key as removed: flushing writes the remaining object without it.
      dirtyStates.add(key)
    }
  })
  scheduleFlush()
}

/** Resets the values of every stateful variable of one connection, keeping its session clock. */
export const clearConnectionVariableValues = (connectionId: string): void => {
  deleteVariableStatesByPrefix(`c:${connectionId}:`)
}

/** Forgets everything of one connection: its variable values and its session clock. */
export const clearConnectionVariableStates = (connectionId: string): void => {
  clearConnectionVariableValues(connectionId)
  clearConnectionSession(connectionId)
}

/** Resets the values of every global variable. */
export const resetGlobalVariableStates = (): void => {
  deleteVariableStatesByPrefix('g:')
}

/** Resets every runtime variable value (manual "reset all" action). */
export const resetAllVariableStates = (): void => {
  memoryStates.clear()
  dirtyStates.clear()
  Object.keys(readAllPersisted()).forEach((key) => dirtyStates.add(key))
  persistedStateCache = null
  // The session clocks (`${connectedAt}`) are context, not a variable value: keep them, but reset
  // the messages-sent counter of every session.
  const persistedSessions = readAllPersistedSessions()
  Object.keys(persistedSessions).forEach((key) => {
    const session = memorySessions.get(key) ?? persistedSessions[key]
    memorySessions.set(key, { ...session, sentCount: 0, updatedAt: Date.now() })
    dirtySessions.add(key)
  })
  memorySessions.forEach((session, key) => {
    memorySessions.set(key, { ...session, sentCount: 0 })
    dirtySessions.add(key)
  })
  persistedSessionCache = null
  scheduleFlush()
}

/** Resets the value of one definition, i.e. the next read starts from its initial value. */
export const resetDefinitionState = (definition: ResolvedVariableDefinition): void => {
  if (definition.stateKey) {
    deleteVariableState(definition.stateKey)
  }
}

// ---------------------------------------------------------------------------
// Session clock (per connection)
// ---------------------------------------------------------------------------

export const readConnectionSession = (connectionId: string): ConnectionSessionState | undefined => {
  const key = sessionStateKey(connectionId)
  const local = memorySessions.get(key)
  if (local) {
    return local
  }
  if (dirtySessions.has(key)) {
    // Deleted locally, not flushed yet.
    return undefined
  }
  return readAllPersistedSessions()[key]
}

/** Starts a new session of a connection: the clocks and the sent-message counter restart. */
export const startConnectionSession = (
  connectionId: string,
  startedAt: number = Date.now(),
): ConnectionSessionState => {
  const session: ConnectionSessionState = { startedAt, sentCount: 0, updatedAt: startedAt }
  memorySessions.set(sessionStateKey(connectionId), session)
  dirtySessions.add(sessionStateKey(connectionId))
  scheduleFlush()
  return session
}

export const clearConnectionSession = (connectionId: string): void => {
  const key = sessionStateKey(connectionId)
  memorySessions.delete(key)
  dirtySessions.add(key)
  scheduleFlush()
}

/** Stores the sent-message counter of a session after a message really went out. */
export const writeSessionSentCount = (connectionId: string, sentCount: number): void => {
  const session = readConnectionSession(connectionId) ?? startConnectionSession(connectionId)
  const next: ConnectionSessionState = { ...session, sentCount, updatedAt: Date.now() }
  memorySessions.set(sessionStateKey(connectionId), next)
  dirtySessions.add(sessionStateKey(connectionId))
  scheduleFlush()
}

// ---------------------------------------------------------------------------
// Computing a value
// ---------------------------------------------------------------------------

const seededUnit = (seed: number, index: number): number => {
  let t = (Math.imul(seed | 0, 0x9e3779b9) + Math.imul(index | 0, 0x85ebca6b)) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const clamp = (value: number, min: number | undefined, max: number | undefined): number => {
  let next = value
  if (min !== undefined && next < min) {
    next = min
  }
  if (max !== undefined && next > max) {
    next = max
  }
  return next
}

/** Number of decimal places of a number, capped to the precision the state store keeps. */
const decimalPlaces = (value: number): number => {
  if (!Number.isFinite(value) || Number.isInteger(value)) {
    return 0
  }
  const text = String(value)
  const point = text.indexOf('.')
  return point === -1 ? 0 : Math.min(text.length - point - 1, 6)
}

/** Rounds away the float noise of repeated additions (0.1 + 0.2 must stay 0.3). */
const roundNumber = (value: number, decimals: number): number =>
  Number(value.toFixed(Math.min(Math.max(decimals, 0), 6)))

/**
 * Applies the configured bound strategy to the value the *next* send will start from.
 *
 * `decimals` decides the width of a wrap: an integer sequence cycles through min..max inclusive
 * (span = max - min + 1, so after max comes min), a decimal one cycles through [min, max).
 */
const applyBoundStrategy = (
  value: number,
  definition: ResolvedVariableDefinition,
  initial: number,
  decimals: number,
): number => {
  const { min, max, onBound } = definition
  const below = min !== undefined && value < min
  const above = max !== undefined && value > max
  if (!below && !above) {
    return value
  }
  switch (onBound) {
    case 'wrap':
      if (min !== undefined && max !== undefined && max > min) {
        const span = decimals > 0 ? max - min : max - min + 1
        const wrapped = min + ((((value - min) % span) + span) % span)
        return roundNumber(wrapped, decimals)
      }
      return clamp(value, min, max)
    case 'reset':
      return initial
    case 'keep':
      return value
    default:
      return clamp(value, min, max)
  }
}

/** Zero padding / decimal places of a stateful value; `undefined` keeps the natural form. */
export const formatVariableValue = (
  value: number | string,
  format: { pad?: number; precision?: number } | undefined,
): string | number => {
  if (!format || (format.pad === undefined && format.precision === undefined)) {
    return value
  }
  let text = typeof value === 'string' ? value : String(value)
  if (typeof value === 'number' && format.precision !== undefined) {
    text = value.toFixed(format.precision)
  }
  if (format.pad !== undefined && format.pad > 0) {
    if (text.startsWith('-')) {
      text = '-' + text.slice(1).padStart(Math.max(format.pad - 1, 1), '0')
    } else {
      text = text.padStart(format.pad, '0')
    }
  }
  return text
}

export interface ComputeValueOptions {
  now: Date
  rand: () => number
  /** expands a session template at generation time (built-ins and connection variables) */
  expandTemplate?: (text: string) => string
}

export interface ComputedValue {
  value: string | number
  /** the value stored for the next send; absent means "this kind does not advance" */
  next?: number | string
  /** counter of a seeded random / choice variable */
  nextCounter?: number
}

const currentNumber = (record: VariableStateRecord | undefined, fallback: number): number => {
  const value = record?.value
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

/**
 * The value of one stateful definition for this message, together with the value its state moves
 * to afterwards. The resolver stages `next` and persists it only when the message was built.
 */
export const computeDefinitionValue = (
  definition: ResolvedVariableDefinition,
  options: ComputeValueOptions,
): ComputedValue | undefined => {
  if (!definition.stateKey || definition.kind === 'constant') {
    return undefined
  }
  let record = readVariableState(definition.stateKey)
  // Periodic reset is lazy: it happens when the variable is next used, so no timer has to run.
  if (record && definition.resetEverySec && definition.resetEverySec > 0) {
    const last = record.lastResetAt ?? record.updatedAt
    if (options.now.getTime() - last >= definition.resetEverySec * 1000) {
      deleteVariableState(definition.stateKey)
      record = undefined
    }
  }
  const initial = definition.initial ?? 0
  const draws = record?.counter ?? 0
  const unit = definition.seed !== undefined ? seededUnit(definition.seed, draws) : options.rand()

  switch (definition.kind) {
    case 'sequence': {
      const current = currentNumber(record, initial)
      const step = definition.step ?? 1
      const decimals = Math.max(decimalPlaces(step), definition.format?.precision ?? 0)
      const next = applyBoundStrategy(roundNumber(current + step, decimals), definition, initial, decimals)
      return { value: formatVariableValue(current, definition.format), next }
    }
    case 'randomWalk': {
      const current = currentNumber(record, initial)
      const range = Math.abs(definition.range ?? 1)
      // A signed distance from the previous value: an integer walk for an integer range, a decimal
      // walk when the definition asks for decimals (`format.precision`).
      const decimals = Math.max(
        definition.format?.precision ?? 0,
        Number.isInteger(range) ? 0 : Math.min(decimalPlaces(range), 6),
      )
      const raw = (unit * 2 - 1) * range
      const delta = roundNumber(raw, decimals)
      const next = applyBoundStrategy(roundNumber(current + delta, decimals), definition, initial, decimals)
      // The draw index must advance, otherwise a seeded walk always takes the same step.
      return { value: formatVariableValue(current, definition.format), next, nextCounter: draws + 1 }
    }
    case 'random': {
      const min = definition.min ?? 0
      const max = definition.max ?? 100
      const lower = Math.min(min, max)
      const upper = Math.max(min, max)
      const integer = Number.isInteger(lower) && Number.isInteger(upper) && !definition.format?.precision
      const raw = integer ? Math.floor(lower + unit * (upper - lower + 1)) : lower + unit * (upper - lower)
      const rounded = integer ? raw : Math.round(raw * 1000) / 1000
      return { value: formatVariableValue(rounded, definition.format), nextCounter: draws + 1 }
    }
    case 'choice': {
      const options = definition.options ?? []
      if (!options.length) {
        return { value: '', nextCounter: draws + 1 }
      }
      const weights = options.map((option) => Math.max(option.weight, 0))
      const total = weights.reduce((sum, weight) => sum + weight, 0)
      if (total <= 0) {
        return { value: options[0].value, nextCounter: draws + 1 }
      }
      const target = unit * total
      let cumulative = 0
      let picked = options[options.length - 1]
      for (let index = 0; index < options.length; index += 1) {
        cumulative += weights[index]
        if (target < cumulative) {
          picked = options[index]
          break
        }
      }
      return { value: picked.value, nextCounter: draws + 1 }
    }
    case 'session': {
      if (record && typeof record.value === 'string' && record.value !== '') {
        return { value: record.value }
      }
      const template = definition.value ?? ''
      const generated =
        definition.generator === 'template' && template ? options.expandTemplate?.(template) ?? template : uuidv4()
      return { value: generated, next: generated }
    }
    case 'captured': {
      if (record !== undefined) {
        return { value: record.value }
      }
      return { value: definition.value ?? '' }
    }
    default:
      return undefined
  }
}

/**
 * The value shown in the UI for a definition (does not advance anything).
 *
 * The lazy periodic reset is applied too: showing an expired value would be misleading. For a
 * sequence / random walk the default is shown after a reset, which is exactly what the next send
 * would use.
 */
export const peekDefinitionValue = (definition: ResolvedVariableDefinition): string | number | undefined => {
  if (!definition.stateKey || definition.kind === 'constant') {
    return definition.value
  }
  let record = readVariableState(definition.stateKey)
  if (record && definition.resetEverySec && definition.resetEverySec > 0) {
    const last = record.lastResetAt ?? record.updatedAt
    if (Date.now() - last >= definition.resetEverySec * 1000) {
      deleteVariableState(definition.stateKey)
      record = undefined
    }
  }
  if (definition.kind === 'session' || definition.kind === 'captured') {
    return record?.value ?? (definition.kind === 'captured' ? definition.value : undefined)
  }
  if (record === undefined) {
    return definition.kind === 'random' || definition.kind === 'choice'
      ? undefined
      : formatVariableValue(definition.initial ?? 0, definition.format)
  }
  return formatVariableValue(record.value, definition.format)
}

/** Sets the current value manually (debugging a device state from the variable editor). */
export const setDefinitionValue = (definition: ResolvedVariableDefinition, value: number | string): void => {
  if (!definition.stateKey) {
    return
  }
  writeVariableState(definition.stateKey, value, { counter: readVariableState(definition.stateKey)?.counter })
}

// ---------------------------------------------------------------------------
// Reset triggers
// ---------------------------------------------------------------------------

export interface ResetTriggerOptions {
  /** true when the connection was restored by an automatic reconnect, not opened by the user */
  reconnect?: boolean
}

/**
 * Applies one lifecycle trigger to a set of definitions and returns the names that were reset.
 *
 * `connect` honours `resetOnReconnect`: a variable may keep its value across automatic reconnects.
 * Global variables are reset through the same call, so a trigger of any connection affects the
 * shared state (the editors point that out).
 */
export const applyVariableResetTrigger = (
  trigger: VariableResetTrigger,
  definitions: ResolvedVariableDefinition[],
  options: ResetTriggerOptions = {},
): string[] => {
  const reset: string[] = []
  definitions.forEach((definition) => {
    if (!definition.stateKey || definition.kind === 'constant' || !definition.resetOn.includes(trigger)) {
      return
    }
    if (trigger === 'connect' && options.reconnect && !definition.resetOnReconnect) {
      return
    }
    deleteVariableState(definition.stateKey)
    reset.push(definition.name)
  })
  return reset
}

export interface VariableTriggerTarget {
  /** the global variable definitions of the preset manager */
  global: ResolvedVariableDefinition[]
  /** the definitions of one connection (its client variables and the global ones it can see) */
  connection: ResolvedVariableDefinition[]
}

/**
 * Applies a connection lifecycle trigger to one connection.
 *
 * The state lives per scope: a global definition is reset once (its state is shared), a
 * connection-scoped one only for this connection.
 */
export const applyConnectionVariableTrigger = (
  connectionId: string,
  trigger: VariableResetTrigger,
  targets: VariableTriggerTarget,
  options: ResetTriggerOptions = {},
): string[] => {
  const connectionScoped = targets.connection.filter((definition) => definition.scope === 'connection')
  const reset = applyVariableResetTrigger(trigger, connectionScoped, options)
  // Global definitions: their value is shared, so the reset is applied once and reported too.
  const globalReset = applyVariableResetTrigger(trigger, targets.global, options)
  return Array.from(new Set([...reset, ...globalReset]))
}

/** Copies a legacy `${count:3}` counter value into the state key of a migrated definition. */
export const adoptLegacyCounterState = (legacyName: string, definition: ResolvedVariableDefinition): boolean => {
  if (!definition.stateKey) {
    return false
  }
  const value = readPayloadCounter(legacyName)
  if (value === undefined) {
    return false
  }
  writeVariableState(definition.stateKey, value)
  deletePayloadCounter(legacyName)
  return true
}

export { connectionStateKey, globalStateKey, sessionStateKey }
export type { ResolvedVariableDefinition }
export type { VariableBoundStrategy, VariableResetTrigger }
