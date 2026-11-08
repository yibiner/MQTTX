/**
 * Minimal persistent store for the browser build.
 *
 * The desktop build uses `electron-store` (a JSON file in the app data directory). The web build has
 * no such file, so the same tiny API is provided on top of `localStorage` instead. Everything that
 * was written against electron-store (`get` / `set` / `has` / `delete` / `clear`) works unchanged,
 * which keeps the ported modules free of environment checks.
 *
 * Only the flat keys the ported modules use are supported on purpose: values are stored as JSON,
 * one localStorage entry per namespace, so a very large payload would be limited by the ~5 MB
 * localStorage quota rather than by disk.
 */

export interface PersistentStoreOptions {
  /** Namespace of this store; several stores can coexist under different names. */
  name?: string
  /** Values used while a key has not been written yet. */
  defaults?: { [key: string]: unknown }
}

const PREFIX = 'mqttx-web'

class LocalStorageStore {
  private storageKey: string

  private defaults: { [key: string]: unknown }

  public constructor(options: PersistentStoreOptions = {}) {
    this.storageKey = `${PREFIX}:${options.name ?? 'config'}`
    this.defaults = options.defaults ?? {}
  }

  /** Whole store content, mostly useful for debugging. */
  public get store(): { [key: string]: unknown } {
    return this.read()
  }

  public get(key: string): unknown
  public get<T>(key: string, defaultValue: T): T
  public get<T>(key: string, defaultValue?: T): unknown {
    const data = this.read()
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      return data[key]
    }
    if (Object.prototype.hasOwnProperty.call(this.defaults, key)) {
      return this.defaults[key]
    }
    return defaultValue
  }

  public set(key: string, value: unknown): void {
    const data = this.read()
    data[key] = value
    this.write(data)
  }

  public has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.read(), key)
  }

  public delete(key: string): void {
    const data = this.read()
    delete data[key]
    this.write(data)
  }

  public clear(): void {
    this.write({})
  }

  private read(): { [key: string]: unknown } {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(this.storageKey) : null
      if (!raw) {
        return {}
      }
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      // A corrupted entry must not break the app: start from an empty store instead.
      return {}
    }
  }

  private write(data: { [key: string]: unknown }): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(this.storageKey, JSON.stringify(data))
      }
    } catch (error) {
      // Quota exceeded or localStorage disabled: the caller keeps working with in-memory state.
      console.warn('[PersistentStore] Could not write to localStorage:', error)
    }
  }
}

/** Creates a store. Mirrors `new Store({ name })` of electron-store. */
export const createPersistentStore = (options: PersistentStoreOptions = {}): LocalStorageStore =>
  new LocalStorageStore(options)

export default LocalStorageStore
