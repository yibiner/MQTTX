import { v4 as uuidv4 } from 'uuid'
import { builtinMessageSequencePresets } from '@/utils/messageSequenceExamples'

/**
 * Reusable presets ("预设管理"), stored locally in electron-store:
 *
 * - Server presets: a fixed broker address (dev / test / production), with a friendly alias.
 * - Client presets: a reusable MQTT identity (clientId / username / password / behaviour).
 * - Topic presets: a reusable topic template, selectable wherever a topic is filled in.
 * - Message presets: a reusable topic + message pair, selectable in the publish window.
 * - Message sequence presets: a reusable sequence, picked wherever sequences are edited.
 * - Automatic reply presets: a reusable reply rule, picked wherever reply rules are edited.
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

/**
 * Every list of this module, cached per process.
 *
 * `electron-store` is backed by `conf`, whose `store` getter reads and JSON-parses `config.json`
 * from disk on *every* `get()`. The profiles are read on hot paths (the global variables once per
 * received message, see `getGlobalVariableMap`), so the file was re-read per message.
 *
 * A local write refreshes the entry (`writeList` is the only writer). The short TTL covers the rest:
 * the app can open a second window, and its `config.json` writes are invisible to this process's
 * store instance, so a purely write-invalidated cache would show stale presets in the other window.
 */
const LIST_CACHE_TTL = 1000
const listCache = new Map<string, { value: any[]; readAt: number }>()

const readList = <T>(key: string): T[] => {
  const cached = listCache.get(key)
  if (cached && Date.now() - cached.readAt < LIST_CACHE_TTL) {
    return cached.value as T[]
  }
  const store = getStore()
  const list = store ? store.get(key) : memoryFallback[key]
  const value = Array.isArray(list) ? list : []
  listCache.set(key, { value, readAt: Date.now() })
  return value
}

const writeList = <T>(key: string, list: T[]): void => {
  const store = getStore()
  if (store) {
    store.set(key, list)
  } else {
    memoryFallback[key] = list
  }
  // Write-through: keep the cached array (the same object the callers just edited) in place.
  listCache.set(key, { value: list, readAt: Date.now() })
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
const TOPIC_PRESETS_KEY = 'topicPresets'
const MESSAGE_SEQUENCE_PRESETS_KEY = 'messageSequencePresets'

const hasStoredKey = (key: string): boolean => {
  const store = getStore()
  if (store) {
    return Boolean(store.has?.(key))
  }
  return Object.prototype.hasOwnProperty.call(memoryFallback, key)
}

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

export const getTopicPresets = (): TopicPresetModel[] => readList(TOPIC_PRESETS_KEY)

/**
 * Stores the topic as written. `${name}` is not resolved here: the connection that later sends or
 * matches the topic fills it from its own variables.
 */
export function saveTopicPreset(preset: Omit<TopicPresetModel, 'id'> & { id?: string }): TopicPresetModel {
  const presets = getTopicPresets()
  const saved: TopicPresetModel = {
    id: preset.id ?? uuidv4(),
    name: String(preset.name ?? '').trim(),
    topic: String(preset.topic ?? '').trim(),
  }
  const index = presets.findIndex((item) => item.id === saved.id)
  if (index === -1) {
    presets.unshift(saved)
  } else {
    presets.splice(index, 1, saved)
  }
  writeList(TOPIC_PRESETS_KEY, presets)
  return saved
}

export const deleteTopicPreset = (id: string): void => {
  writeList(
    TOPIC_PRESETS_KEY,
    getTopicPresets().filter((preset) => preset.id !== id),
  )
}

export const getMessageSequencePresets = (): MessageSequencePresetModel[] => readList(MESSAGE_SEQUENCE_PRESETS_KEY)

export const getMessageSequencePreset = (id: string): MessageSequencePresetModel | undefined =>
  getMessageSequencePresets().find((preset) => preset.id === id)

/**
 * The two device sequences exist the first time the list is read. Once the key has been written,
 * deleting them stays deleted: an empty list is a choice, not a missing install.
 */
export const ensureMessageSequencePresets = (): MessageSequencePresetModel[] => {
  if (!hasStoredKey(MESSAGE_SEQUENCE_PRESETS_KEY)) {
    writeList(MESSAGE_SEQUENCE_PRESETS_KEY, builtinMessageSequencePresets())
  }
  return getMessageSequencePresets()
}

export function saveMessageSequencePreset(
  preset: Omit<MessageSequencePresetModel, 'id'> & { id?: string },
): MessageSequencePresetModel {
  const presets = getMessageSequencePresets()
  const saved: MessageSequencePresetModel = { ...preset, id: preset.id ?? uuidv4() }
  const index = presets.findIndex((item) => item.id === saved.id)
  if (index === -1) {
    presets.unshift(saved)
  } else {
    presets.splice(index, 1, saved)
  }
  writeList(MESSAGE_SEQUENCE_PRESETS_KEY, presets)
  return saved
}

export const deleteMessageSequencePreset = (id: string): void => {
  writeList(
    MESSAGE_SEQUENCE_PRESETS_KEY,
    getMessageSequencePresets().filter((preset) => preset.id !== id),
  )
}

const AUTO_REPLY_PRESETS_KEY = 'autoReplyPresets'

/**
 * Automatic reply presets. Unlike the sequences there is no builtin seed: a reply rule is specific
 * to a device's protocol, and a wrong default would answer real traffic the user never meant to.
 *
 * A preset holds every rule the user added. Presets saved earlier stored only `rule`; reading them
 * still yields that one rule in `rules`.
 */
export function replyPresetRules(
  preset: Pick<AutoReplyPresetModel, 'rule' | 'rules'> | null | undefined,
): AutoReplyRuleModel[] {
  if (!preset) {
    return []
  }
  if (Array.isArray(preset.rules) && preset.rules.length) {
    return preset.rules
  }
  return preset.rule ? [preset.rule] : []
}

const normalizeReplyPreset = (preset: AutoReplyPresetModel): AutoReplyPresetModel => {
  const rules = replyPresetRules(preset)
  return { ...preset, rules, rule: rules[0] ?? preset.rule }
}

export const getAutoReplyPresets = (): AutoReplyPresetModel[] =>
  readList<AutoReplyPresetModel>(AUTO_REPLY_PRESETS_KEY).map(normalizeReplyPreset)

export const getAutoReplyPreset = (id: string): AutoReplyPresetModel | undefined =>
  getAutoReplyPresets().find((preset) => preset.id === id)

export function saveAutoReplyPreset(preset: Omit<AutoReplyPresetModel, 'id'> & { id?: string }): AutoReplyPresetModel {
  const presets = getAutoReplyPresets()
  const saved = normalizeReplyPreset({ ...preset, id: preset.id ?? uuidv4() })
  const index = presets.findIndex((item) => item.id === saved.id)
  if (index === -1) {
    presets.unshift(saved)
  } else {
    presets.splice(index, 1, saved)
  }
  writeList(AUTO_REPLY_PRESETS_KEY, presets)
  return saved
}

export const deleteAutoReplyPreset = (id: string): void => {
  writeList(
    AUTO_REPLY_PRESETS_KEY,
    getAutoReplyPresets().filter((preset) => preset.id !== id),
  )
}

const BEHAVIOR_TEMPLATES_KEY = 'behaviorTemplates'

/**
 * Behaviour templates ("行为模板"). A template stores only what it adds. Inherited behaviour is
 * resolved from `parentId` when a connection is created or when the template is shown; it is not
 * copied until the user stops syncing with the parent.
 */
export const getBehaviorTemplates = (): BehaviorTemplateModel[] => readList(BEHAVIOR_TEMPLATES_KEY)

export const getBehaviorTemplate = (id: string): BehaviorTemplateModel | undefined =>
  getBehaviorTemplates().find((template) => template.id === id)

export function saveBehaviorTemplate(
  template: Omit<BehaviorTemplateModel, 'id'> & { id?: string },
): BehaviorTemplateModel {
  const templates = getBehaviorTemplates()
  const saved: BehaviorTemplateModel = {
    ...template,
    id: template.id ?? uuidv4(),
    name: String(template.name ?? '').trim(),
    parentId: template.parentId || null,
  }
  const index = templates.findIndex((item) => item.id === saved.id)
  if (index === -1) {
    templates.unshift(saved)
  } else {
    templates.splice(index, 1, saved)
  }
  writeList(BEHAVIOR_TEMPLATES_KEY, templates)
  return saved
}

export const deleteBehaviorTemplate = (id: string): void => {
  writeList(
    BEHAVIOR_TEMPLATES_KEY,
    getBehaviorTemplates().filter((template) => template.id !== id),
  )
}

const GLOBAL_VARIABLES_KEY = 'globalVariables'

/**
 * Bumped on every change of the global variables list.
 *
 * The variable definitions of a connection are normalized from this list, and the automatic-reply
 * engine caches them per connection for its hot path. The revision lets that cache notice an edit
 * without re-reading the list (or guessing from a TTL).
 */
let globalVariablesRevision = 0

export const getGlobalVariablesRevision = (): number => globalVariablesRevision

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
  globalVariablesRevision += 1
  return saved
}

/**
 * Adds several global variables with one write of the store.
 *
 * The legacy-inline migration can create dozens of definitions at once; writing the whole
 * `config.json` once instead of once per definition keeps the one-click action from freezing the
 * renderer. The ids are generated here and returned, so the caller can adopt the persisted state of
 * the corresponding counter.
 */
export function saveGlobalVariables(
  variables: Array<Omit<GlobalVariableModel, 'id'> & { id?: string }>,
): GlobalVariableModel[] {
  if (!Array.isArray(variables) || variables.length === 0) {
    return []
  }
  const saved = variables.map((variable) => ({ ...variable, id: variable.id ?? uuidv4() } as GlobalVariableModel))
  writeList(GLOBAL_VARIABLES_KEY, [...saved, ...getGlobalVariables()])
  globalVariablesRevision += 1
  return saved
}

export const deleteGlobalVariable = (id: string): void => {
  writeList(
    GLOBAL_VARIABLES_KEY,
    getGlobalVariables().filter((variable) => variable.id !== id),
  )
  globalVariablesRevision += 1
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
