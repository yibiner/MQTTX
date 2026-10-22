/**
 * Persistence of the payload counters (`${count:3}`).
 *
 * The value of a counter survives an app restart, so a counter is not "a random number that happens
 * to be reproducible" but a real sequence. Values live in `electron-store` when the app runs in a
 * renderer, and in memory in tests / plain Node.
 */
const COUNTER_STORE_KEY = 'payloadCounters'

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
 * several windows mostly share one counter sequence -- only a local write that has not reached
 * the disk yet takes precedence. Inside the flush delay (500ms) a second window can still read the
 * previous value, so cross-window exactness is best-effort, not a guarantee.
 */
const COUNTER_FLUSH_DELAY = 500

export const flushPayloadCounters = (): void => {
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

/** Deletes one legacy counter (used when a `${name:3}` is migrated to a variable definition). */
export const deletePayloadCounter = (name: string): void => {
  memoryCounters.delete(name)
  dirtyCounters.delete(name)
  const store = getPersistentStore()
  if (store) {
    try {
      store.delete(`${COUNTER_STORE_KEY}.${name}`)
    } catch (error) {
      // ignore
    }
  }
}
