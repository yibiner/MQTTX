import { v4 as uuidv4 } from 'uuid'
import time from './time'

/**
 * Dynamic variables that are filled in right before a message is published.
 *
 * Syntax: `${name}` for the built-in variables, `${name:config}` for user variables.
 *
 * Built-in variables:
 * - `${timestamp}` / `${ts}`  — epoch milliseconds, e.g. 1791979522744
 * - `${timestampSec}`         — epoch seconds
 * - `${datetime}`             — local "YYYY-MM-DD HH:mm:ss"
 * - `${date}` / `${time}`     — local "YYYY-MM-DD" / "HH:mm:ss"
 * - `${iso}`                  — UTC ISO 8601, e.g. 2026-10-14T12:00:03.643Z
 * - `${uuid}`                 — a fresh UUID v4 on every send
 *
 * User variables (`name` is chosen freely, e.g. rssi):
 * - `${count:3}`       — auto-increment counter: the first send uses 3, every following send +1.
 *                        The current value is persisted locally, so it survives app restarts and
 *                        wins over the inline initial value. `Settings → Reset payload variables`
 *                        clears the stored values.
 * - `${rssi:-30..-60}` — a random integer between both bounds (inclusive), drawn fresh on every
 *                        send. Bounds may be given in any order and may be negative.
 *
 * The payload stored in the publish history keeps the raw template, so every re-send gets a
 * fresh value, while the actually published message carries the real data.
 *
 * When a placeholder is written as a quoted JSON string ("${timestamp}") and the value is a
 * number, the surrounding quotes are removed as well, so the JSON keeps the correct type:
 *   { "cmd": "HEARTBEAT", "ts": 1791979522744 }
 */
export interface PayloadVariable {
  name: string
  value: (now: Date) => string | number
}

export const PAYLOAD_VARIABLES: PayloadVariable[] = [
  { name: 'timestamp', value: (now) => now.getTime() },
  { name: 'ts', value: (now) => now.getTime() },
  { name: 'timestampSec', value: (now) => Math.floor(now.getTime() / 1000) },
  { name: 'datetime', value: (now) => time.toFormat(now).slice(0, 19) },
  { name: 'date', value: (now) => time.toFormat(now).slice(0, 10) },
  { name: 'time', value: (now) => time.toFormat(now).slice(11, 19) },
  { name: 'iso', value: (now) => now.toISOString() },
  { name: 'uuid', value: () => uuidv4() },
]

const VARIABLE_TOKEN_START = '${'
const VARIABLE_TOKEN_END = '}'
const COUNTER_STORE_KEY = 'payloadCounters'
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*/

// ---------------------------------------------------------------------------
// Counter persistence (electron-store when available, memory as test fallback)
// ---------------------------------------------------------------------------
let persistentStore: any | null | undefined
const memoryCounters = new Map<string, number>()
/** counters changed in memory but not written to disk yet */
const dirtyCounters = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

const getPersistentStore = (): any | null => {
  if (persistentStore === undefined) {
    if (process.type !== 'renderer') {
      // Outside Electron (unit tests / plain Node): keep counters in memory.
      persistentStore = null
      return persistentStore
    }
    try {
      const Store = require('electron-store')
      persistentStore = new Store()
    } catch (error) {
      // Not running inside Electron (unit tests / plain Node): keep counters in memory.
      persistentStore = null
    }
  }
  return persistentStore
}

/**
 * A burst of publishes (timed messages, multiple variables per message) used to hit the disk
 * with a synchronous read+write of config.json for every single counter: conf re-reads the whole
 * file on each `get`/`set`. Writes are therefore coalesced; reads stay disk-backed so that
 * several windows still share one counter sequence -- only a local write that has not reached
 * the disk yet takes precedence.
 */
const COUNTER_FLUSH_DELAY = 500

const flushPayloadCounters = (): void => {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const store = getPersistentStore()
  if (dirtyCounters.size === 0) {
    return
  }
  if (!store) {
    dirtyCounters.clear()
    return
  }
  const pending = Array.from(dirtyCounters)
  dirtyCounters.clear()
  try {
    pending.forEach((name) => {
      store.set(`${COUNTER_STORE_KEY}.${name}`, memoryCounters.get(name))
    })
  } catch (error) {
    // A failing counter write must never break the publish itself.
  }
}

const scheduleFlush = (): void => {
  if (flushTimer) {
    return
  }
  flushTimer = setTimeout(flushPayloadCounters, COUNTER_FLUSH_DELAY)
  // Never keep the process alive just to persist a counter.
  ;(flushTimer as any)?.unref?.()
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  // Flush whatever is pending when the window closes instead of losing the last increments.
  window.addEventListener('beforeunload', flushPayloadCounters)
  window.addEventListener('pagehide', flushPayloadCounters)
}

export const readPayloadCounter = (name: string): number | undefined => {
  if (dirtyCounters.has(name)) {
    return memoryCounters.get(name)
  }
  const store = getPersistentStore()
  if (store) {
    try {
      const value = store.get(`${COUNTER_STORE_KEY}.${name}`)
      return typeof value === 'number' ? value : undefined
    } catch (error) {
      return undefined
    }
  }
  return memoryCounters.get(name)
}

export const writePayloadCounter = (name: string, value: number): void => {
  memoryCounters.set(name, value)
  const store = getPersistentStore()
  if (!store) {
    return
  }
  dirtyCounters.add(name)
  scheduleFlush()
}

export const resetPayloadCounters = (): void => {
  memoryCounters.clear()
  dirtyCounters.clear()
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const store = getPersistentStore()
  if (store) {
    try {
      store.delete(COUNTER_STORE_KEY)
    } catch (error) {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Placeholder parsing and resolution
// ---------------------------------------------------------------------------
interface Placeholder {
  /** index of "$" */
  start: number
  /** index of "}" */
  end: number
  name: string
  /** the part after ":", e.g. "3" in ${count:3} or "-30..-60" in ${rssi:-30..-60} */
  config?: string
}

const scanPlaceholders = (payload: string): Placeholder[] => {
  const found: Placeholder[] = []
  let index = 0
  while (index <= payload.length) {
    const start = payload.indexOf(VARIABLE_TOKEN_START, index)
    if (start === -1) {
      break
    }
    const end = payload.indexOf(VARIABLE_TOKEN_END, start + VARIABLE_TOKEN_START.length)
    if (end === -1) {
      break
    }
    const raw = payload.slice(start + VARIABLE_TOKEN_START.length, end)
    const separatorIndex = raw.indexOf(':')
    const name = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex)
    const config = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 1)
    NAME_PATTERN.lastIndex = 0
    if (name && NAME_PATTERN.test(name)) {
      found.push({ start, end, name, config: config ? config : undefined })
    }
    index = end + VARIABLE_TOKEN_END.length
  }
  return found
}

const parseCounterInit = (config: string): number | undefined => {
  const trimmed = config.trim()
  return /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined
}

const parseRange = (config: string): [number, number] | undefined => {
  const parts = config.split('..')
  if (parts.length !== 2) {
    return undefined
  }
  const a = Number.parseInt(parts[0].trim(), 10)
  const b = Number.parseInt(parts[1].trim(), 10)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return undefined
  }
  return [Math.min(a, b), Math.max(a, b)]
}

const randomIntInRange = (min: number, max: number, rand: () => number): number =>
  min + Math.floor(rand() * (max - min + 1))

/**
 * Replaces every known placeholder in the payload with its current value.
 *
 * All variables of one payload share the same `now`, and a counter that appears several times
 * in one message is incremented only once per send, so every occurrence stays consistent.
 * Unknown placeholders are left untouched.
 */
export const applyPayloadVariables = (
  payload: string,
  now: Date = new Date(),
  rand: () => number = Math.random,
): string => {
  if (!payload || !payload.includes(VARIABLE_TOKEN_START)) {
    return payload
  }

  const placeholders = scanPlaceholders(payload)
  if (!placeholders.length) {
    return payload
  }

  // Resolve every unique variable name once per message.
  const values = new Map<string, string | number>()
  const usedCounters: Array<{ name: string; value: number }> = []
  for (const placeholder of placeholders) {
    if (values.has(placeholder.name)) {
      continue
    }
    const timeVariable = PAYLOAD_VARIABLES.find((v) => v.name === placeholder.name)
    if (timeVariable) {
      values.set(placeholder.name, timeVariable.value(now))
      continue
    }
    if (placeholder.config === undefined) {
      continue
    }
    const range = parseRange(placeholder.config)
    if (range) {
      values.set(placeholder.name, randomIntInRange(range[0], range[1], rand))
      continue
    }
    const init = parseCounterInit(placeholder.config)
    if (init === undefined) {
      continue
    }
    const value = readPayloadCounter(placeholder.name) ?? init
    usedCounters.push({ name: placeholder.name, value })
    values.set(placeholder.name, value)
  }

  let result = ''
  let index = 0
  for (const placeholder of placeholders) {
    const value = values.get(placeholder.name)
    const isQuotedJsonString =
      value !== undefined && payload[placeholder.start - 1] === '"' && payload[placeholder.end + 1] === '"'
    if (value === undefined) {
      // Unknown variable: copy it over verbatim.
      result += payload.slice(index, placeholder.end + VARIABLE_TOKEN_END.length)
      index = placeholder.end + VARIABLE_TOKEN_END.length
    } else if (isQuotedJsonString && typeof value === 'number') {
      // "${timestamp}" -> 1791979522744 (drop the quotes so JSON numbers keep their type)
      result += payload.slice(index, placeholder.start - 1) + String(value)
      index = placeholder.end + VARIABLE_TOKEN_END.length + 1
    } else {
      result += payload.slice(index, placeholder.start) + String(value)
      index = placeholder.end + VARIABLE_TOKEN_END.length
    }
  }
  result += payload.slice(index)

  // Commit counter increments only after the payload was built successfully.
  for (const counter of usedCounters) {
    writePayloadCounter(counter.name, counter.value + 1)
  }
  return result
}

export default applyPayloadVariables
