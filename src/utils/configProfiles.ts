import { v4 as uuidv4 } from 'uuid'

/**
 * Reusable presets ("预设管理"), stored locally in electron-store:
 *
 * - Server presets: a fixed broker address (dev / test / production), with a friendly alias.
 * - Client presets: a reusable MQTT identity (clientId / username / password / behaviour).
 * - Message presets: a reusable topic + message pair, selectable in the publish window.
 * - Global variables: named values referenced as `${name}` in every topic and message.
 *
 * Server/client presets are offered as pickers when creating a new connection, message
 * presets appear directly in the send window. Everything the picker fills in stays editable.
 */

const SERVER_PROFILES_KEY = 'serverProfiles'
const CLIENT_PROFILES_KEY = 'clientProfiles'

let persistentStore: any | null | undefined
const memoryFallback: { [key: string]: any } = {}

const getStore = (): any | null => {
  if (persistentStore === undefined) {
    if (process.type !== 'renderer') {
      // Outside Electron (unit tests / plain Node): keep profiles in memory.
      persistentStore = null
      return persistentStore
    }
    try {
      const Store = require('electron-store')
      persistentStore = new Store()
    } catch (error) {
      // Outside Electron (tests): keep profiles in memory.
      persistentStore = null
    }
  }
  return persistentStore
}

const readList = <T>(key: string): T[] => {
  const store = getStore()
  const list = store ? store.get(key) : memoryFallback[key]
  return Array.isArray(list) ? list : []
}

const writeList = <T>(key: string, list: T[]): void => {
  const store = getStore()
  if (store) {
    store.set(key, list)
  } else {
    memoryFallback[key] = list
  }
}

export const getServerProfiles = (): ServerProfileModel[] => readList(SERVER_PROFILES_KEY)

export const getServerProfile = (id: string): ServerProfileModel | undefined =>
  getServerProfiles().find((profile) => profile.id === id)

export function saveServerProfile(profile: Omit<ServerProfileModel, 'id'> & { id?: string }): ServerProfileModel {
  const profiles = getServerProfiles()
  const saved: ServerProfileModel = { ...profile, id: profile.id ?? uuidv4() } as ServerProfileModel
  const index = profiles.findIndex((item) => item.id === saved.id)
  if (index === -1) {
    profiles.unshift(saved)
  } else {
    profiles.splice(index, 1, saved)
  }
  writeList(SERVER_PROFILES_KEY, profiles)
  return saved
}

export const deleteServerProfile = (id: string): void => {
  writeList(
    SERVER_PROFILES_KEY,
    getServerProfiles().filter((profile) => profile.id !== id),
  )
}

export const getClientProfiles = (): ClientProfileModel[] => readList(CLIENT_PROFILES_KEY)

export const getClientProfile = (id: string): ClientProfileModel | undefined =>
  getClientProfiles().find((profile) => profile.id === id)

export function saveClientProfile(profile: Omit<ClientProfileModel, 'id'> & { id?: string }): ClientProfileModel {
  const profiles = getClientProfiles()
  const saved: ClientProfileModel = { ...profile, id: profile.id ?? uuidv4() } as ClientProfileModel
  const index = profiles.findIndex((item) => item.id === saved.id)
  if (index === -1) {
    profiles.unshift(saved)
  } else {
    profiles.splice(index, 1, saved)
  }
  writeList(CLIENT_PROFILES_KEY, profiles)
  return saved
}

export const deleteClientProfile = (id: string): void => {
  writeList(
    CLIENT_PROFILES_KEY,
    getClientProfiles().filter((profile) => profile.id !== id),
  )
}

const MESSAGE_PRESETS_KEY = 'messagePresets'

export const getMessagePresets = (): MessagePresetModel[] => readList(MESSAGE_PRESETS_KEY)

export const getMessagePreset = (id: string): MessagePresetModel | undefined =>
  getMessagePresets().find((preset) => preset.id === id)

export function saveMessagePreset(preset: Omit<MessagePresetModel, 'id'> & { id?: string }): MessagePresetModel {
  const presets = getMessagePresets()
  const saved: MessagePresetModel = { ...preset, id: preset.id ?? uuidv4() } as MessagePresetModel
  const index = presets.findIndex((item) => item.id === saved.id)
  if (index === -1) {
    presets.unshift(saved)
  } else {
    presets.splice(index, 1, saved)
  }
  writeList(MESSAGE_PRESETS_KEY, presets)
  return saved
}

export const deleteMessagePreset = (id: string): void => {
  writeList(
    MESSAGE_PRESETS_KEY,
    getMessagePresets().filter((preset) => preset.id !== id),
  )
}

const GLOBAL_VARIABLES_KEY = 'globalVariables'

export const getGlobalVariables = (): GlobalVariableModel[] => readList(GLOBAL_VARIABLES_KEY)

export const getGlobalVariable = (id: string): GlobalVariableModel | undefined =>
  getGlobalVariables().find((variable) => variable.id === id)

export function saveGlobalVariable(variable: Omit<GlobalVariableModel, 'id'> & { id?: string }): GlobalVariableModel {
  const variables = getGlobalVariables()
  const saved: GlobalVariableModel = { ...variable, id: variable.id ?? uuidv4() } as GlobalVariableModel
  const index = variables.findIndex((item) => item.id === saved.id)
  if (index === -1) {
    variables.unshift(saved)
  } else {
    variables.splice(index, 1, saved)
  }
  writeList(GLOBAL_VARIABLES_KEY, variables)
  return saved
}

export const deleteGlobalVariable = (id: string): void => {
  writeList(
    GLOBAL_VARIABLES_KEY,
    getGlobalVariables().filter((variable) => variable.id !== id),
  )
}

/**
 * The `{ name: value }` view of the global variables, as consumed by the payload variable
 * resolver. The list is newest first and the first definition of a name wins, so a duplicated
 * name (the dialog prevents them, an edited config.json may not) is resolved predictably.
 */
export const getGlobalVariableMap = (): { [name: string]: string } => {
  const map: { [name: string]: string } = {}
  getGlobalVariables().forEach((variable) => {
    if (variable.name && !(variable.name in map)) {
      map[variable.name] = variable.value
    }
  })
  return map
}
