import {
  getClientProfiles,
  getGlobalVariables,
  getMessagePresets,
  saveGlobalVariable,
  saveGlobalVariables,
} from '@/utils/configProfiles'
import { readPayloadCounter } from './counters'
import { normalizeVariableDefinition } from './definitions'
import { scanPlaceholders } from './placeholders'
import { adoptLegacyCounterState } from './state'
import { validateVariableName } from './registry'
import type { ResolvedVariableDefinition } from './definitions'

/**
 * One-click migration of the legacy inline forms to variable definitions.
 *
 * Before the stateful variable system, a value was configured inline in the template itself:
 *
 *   ${count:3}       a counter with initial value 3, +1 per send (state in `payloadCounters.count`)
 *   ${rssi:-30..-60} a random integer of the range, stateless
 *
 * Both keep working, but they are compatibility syntax now: their state is invisible, they cannot be
 * reset from the variable table, and they cannot be formatted. This module scans every place the app
 * resolves templates, groups the inline forms by name and produces a plan that turns each one into a
 * real variable definition:
 *
 *   ${count:3}       -> global variable `count`, kind `sequence`, initial 3, step 1
 *   ${rssi:-30..-60} -> global variable `rssi`, kind `random`, min -60, max -30
 *
 * The templates are deliberately left untouched: a definition wins over the inline fallback, and its
 * semantics are identical (the counter even continues from the persisted `payloadCounters` value).
 * That also makes the migration idempotent - a second scan finds nothing new to create because the
 * definitions now exist, and applying the same plan twice creates nothing new.
 *
 * The module has no UI dependency. The sources are injectable so the scan can be unit tested without
 * the database, and the whole operation can be triggered from a settings page or a command alike.
 */

/** One inline form found in the templates, normalized to the value the definition will store. */
export interface LegacyInlineDefinition {
  /** variable name, e.g. `count` */
  name: string
  /** the definition stored in the global variables list */
  stored: VariableDefinitionConfig
  /** the persisted `${name:N}` counter found at scan time (for reporting) */
  legacyCounter?: number
}

/** One name used with incompatible inline configs; it cannot be migrated automatically. */
export interface LegacyInlineConflict {
  name: string
  /** the distinct configs found, e.g. `['counter:1', 'range:-30..-60']` */
  configs: string[]
}

export interface LegacyMigrationPlan {
  definitions: LegacyInlineDefinition[]
  conflicts: LegacyInlineConflict[]
  /** number of non-empty template texts that were scanned */
  scanned: number
}

export interface LegacyMigrationResult {
  /** global variables created by this run */
  created: string[]
  /** names whose persisted `${name:N}` counter was moved into the state of the new definition */
  migratedState: string[]
  /** names skipped because a global variable of that name already exists */
  skipped: string[]
}

/**
 * Where the scan looks. Every source is optional and falls back to the app singleton, which is what
 * the settings action uses; a test (or another host) can pass the data directly instead.
 */
export interface LegacyMigrationSources {
  getMessagePresets?: () => MessagePresetModel[] | null | undefined
  getClientProfiles?: () => ClientProfileModel[] | null | undefined
  getGlobalVariables?: () => GlobalVariableModel[] | null | undefined
  /** all connections, e.g. `useServices().connectionService.getAll()` */
  listConnections?: () => Promise<ConnectionModel[] | null | undefined> | ConnectionModel[] | null | undefined
}

/** Dependencies of `applyLegacyInlineMigration`; the write side is injectable as well. */
export interface LegacyMigrationApplyDependencies extends LegacyMigrationSources {
  /** single write, kept for hosts that inject their own store implementation */
  saveGlobalVariable?: (variable: Omit<GlobalVariableModel, 'id'> & { id?: string }) => GlobalVariableModel
  /** preferred: create all migrated definitions with one store write */
  saveGlobalVariables?: (variables: Array<Omit<GlobalVariableModel, 'id'> & { id?: string }>) => GlobalVariableModel[]
  adoptLegacyCounterState?: (name: string, definition: ResolvedVariableDefinition) => boolean
}

/**
 * The database is loaded lazily: a host that injects `listConnections` (a unit test, a CLI import)
 * never touches the TypeORM service graph.
 */
const listConnectionsFromDatabase = async (): Promise<ConnectionModel[]> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const servicesModule = require('@/database/useServices')
  const useServices = servicesModule.default ?? servicesModule
  const { connectionService } = useServices()
  return (await connectionService.getAll()) ?? []
}

const defaultSources = (): Required<LegacyMigrationSources> => ({
  getMessagePresets: getMessagePresets as () => MessagePresetModel[],
  getClientProfiles: getClientProfiles as () => ClientProfileModel[],
  getGlobalVariables: getGlobalVariables as () => GlobalVariableModel[],
  listConnections: listConnectionsFromDatabase,
})

/**
 * The inline syntax of one placeholder config. Replicates `providers/inline.ts` on purpose: what the
 * scan classifies as a counter/range has to be exactly what the resolver would execute, so a config
 * the inline provider ignores is not migrated either.
 */
type LegacyInlineHit =
  | { kind: 'counter'; config: string; initial: number }
  | { kind: 'random'; config: string; min: number; max: number }

const parseRandomRange = (config: string): [number, number] | undefined => {
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

const parseCounterInitial = (config: string): number | undefined => {
  const trimmed = config.trim()
  return /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined
}

/** Classifies the `:config` part of a placeholder, or `undefined` when it is not a legacy inline form. */
const parseLegacyInlineConfig = (config: string | undefined): LegacyInlineHit | undefined => {
  if (!config) {
    return undefined
  }
  const range = parseRandomRange(config)
  if (range) {
    const [min, max] = range
    return { kind: 'random', config: `range:${min}..${max}`, min, max }
  }
  const initial = parseCounterInitial(config)
  if (initial !== undefined) {
    return { kind: 'counter', config: `counter:${initial}`, initial }
  }
  return undefined
}

/** The definition that replaces one inline form. */
const storedFor = (hit: LegacyInlineHit): VariableDefinitionConfig => {
  if (hit.kind === 'counter') {
    return { kind: 'sequence', initial: hit.initial, step: 1, value: String(hit.initial) }
  }
  return { kind: 'random', min: hit.min, max: hit.max, value: `${hit.min}..${hit.max}` }
}

/** The legacy `value` field of a global variable, kept for older readers of the list. */
const legacyValueOf = (stored: VariableDefinitionConfig): string => {
  if (stored.kind === 'sequence') {
    return String(stored.initial ?? 0)
  }
  return stored.value ?? ''
}

/** The value of one `StoredVariable` as a template (a constant/string or the definition's value). */
const storedVariableText = (stored: StoredVariable | undefined): string | undefined => {
  if (stored === undefined || stored === null) {
    return undefined
  }
  if (typeof stored === 'string') {
    return stored
  }
  // A hand-edited config may hold a non-string value in a definition; the scan only reads text.
  return typeof stored.value === 'string' ? stored.value : undefined
}

/**
 * Scans the known template sources for legacy inline forms and groups them by variable name.
 *
 * Sources: message presets (topic + payload), client presets (variables, automatic subscriptions and
 * automatic replies), the global variables list itself, and every connection of the database
 * (variables, automatic subscriptions, automatic replies). A name used with different configs is
 * reported as a conflict and is not migrated; a name that already exists as a global variable is
 * skipped, so the scan is empty after a successful migration.
 */
export const scanLegacyInlineVariables = async (sources: LegacyMigrationSources = {}): Promise<LegacyMigrationPlan> => {
  const resolved = { ...defaultSources(), ...sources }
  const messagePresets = (await resolved.getMessagePresets()) ?? []
  const clientProfiles = (await resolved.getClientProfiles()) ?? []
  const globalVariables = (await resolved.getGlobalVariables()) ?? []
  const connections = (await resolved.listConnections()) ?? []

  let scanned = 0
  const hits = new Map<string, LegacyInlineHit[]>()

  const scanText = (text: string | null | undefined): void => {
    if (typeof text !== 'string' || text.trim() === '') {
      return
    }
    scanned += 1
    scanPlaceholders(text).forEach((placeholder) => {
      const hit = parseLegacyInlineConfig(placeholder.config)
      if (!hit) {
        return
      }
      const found = hits.get(placeholder.name)
      if (found) {
        found.push(hit)
      } else {
        hits.set(placeholder.name, [hit])
      }
    })
  }

  const scanReplies = (rules: AutoReplyRuleModel[] | null | undefined): void => {
    ;(rules ?? []).forEach((rule) => {
      scanText(rule?.matchTopic)
      scanText(rule?.reply?.topic)
      scanText(rule?.reply?.payload)
    })
  }

  const scanAutoSubscriptions = (groups: AutoSubscribeGroupModel[] | null | undefined): void => {
    ;(groups ?? []).forEach((group) => {
      ;(group?.topics ?? []).forEach((topic) => scanText(topic?.topic))
    })
  }

  const scanVariables = (variables: { [name: string]: StoredVariable } | null | undefined): void => {
    Object.keys(variables ?? {}).forEach((name) => scanText(storedVariableText(variables?.[name])))
  }

  messagePresets.forEach((preset) => {
    scanText(preset?.topic)
    scanText(preset?.payload)
  })

  clientProfiles.forEach((profile) => {
    scanVariables(profile?.variables)
    scanAutoSubscriptions(profile?.autoSubscriptions)
    scanReplies(profile?.autoReplies)
  })

  globalVariables.forEach((variable) => {
    scanText(variable?.value)
    scanText(variable?.definition?.value)
  })

  connections.forEach((connection) => {
    scanVariables(connection?.variables)
    scanAutoSubscriptions(connection?.autoSubscriptions)
    scanReplies(connection?.autoReplies)
  })

  const existingNames = new Set(globalVariables.map((variable) => (variable?.name ?? '').trim()).filter(Boolean))
  const definitions: LegacyInlineDefinition[] = []
  const conflicts: LegacyInlineConflict[] = []

  hits.forEach((found, name) => {
    if (existingNames.has(name)) {
      return
    }
    const configs = Array.from(new Set(found.map((hit) => hit.config)))
    if (configs.length > 1) {
      // The same name means different things in different templates: a definition would change the
      // semantics of at least one of them, so the user has to resolve it manually.
      conflicts.push({ name, configs })
      return
    }
    const hit = found[0]
    const definition: LegacyInlineDefinition = { name, stored: storedFor(hit) }
    if (hit.kind === 'counter') {
      const legacyCounter = readPayloadCounter(name)
      if (legacyCounter !== undefined) {
        definition.legacyCounter = legacyCounter
      }
    }
    definitions.push(definition)
  })

  return { definitions, conflicts, scanned }
}

/**
 * Creates the global variable definitions of a plan and moves the persisted legacy counters into
 * their runtime state.
 *
 * A name that already exists as a global variable is skipped (it already takes precedence over the
 * inline form), which makes a repeated run a no-op. The connection/template texts are not rewritten:
 * `${count:3}` keeps working exactly as before, now served by the `count` definition.
 */
export const applyLegacyInlineMigration = (
  plan: LegacyMigrationPlan,
  dependencies: LegacyMigrationApplyDependencies = {},
): LegacyMigrationResult => {
  const getGlobals = dependencies.getGlobalVariables ?? getGlobalVariables
  const adopt = dependencies.adoptLegacyCounterState ?? adoptLegacyCounterState
  const existing = new Set((getGlobals() ?? []).map((variable) => (variable?.name ?? '').trim()).filter(Boolean))
  const created: string[] = []
  const migratedState: string[] = []
  const skipped: string[] = []

  /** A plan entry that may be created, or the reason it is skipped. */
  const pending: Array<{ name: string; stored: VariableDefinitionConfig }> = []
  plan.definitions.forEach((entry) => {
    const name = (entry?.name ?? '').trim()
    if (!name || !entry?.stored) {
      return
    }
    // A reserved (built-in/session) or invalid name can never be referenced as a user variable;
    // creating it would only produce a definition the resolver never uses.
    if (validateVariableName(name)) {
      skipped.push(name)
      return
    }
    if (existing.has(name)) {
      skipped.push(name)
      return
    }
    existing.add(name)
    pending.push({ name, stored: { ...entry.stored } })
  })
  if (pending.length === 0) {
    return { created, migratedState, skipped }
  }

  // One store write for the whole batch: the migration may create dozens of definitions and
  // `config.json` is rewritten as a whole on every write.
  let saved: GlobalVariableModel[]
  if (dependencies.saveGlobalVariable) {
    // A host that injected the single-write path keeps using it (tests / alternate stores).
    saved = pending.map((entry) =>
      (dependencies.saveGlobalVariable as NonNullable<typeof dependencies.saveGlobalVariable>)({
        name: entry.name,
        value: legacyValueOf(entry.stored),
        definition: entry.stored,
      }),
    )
  } else {
    const saveMany = dependencies.saveGlobalVariables ?? saveGlobalVariables
    saved = saveMany(
      pending.map((entry) => ({
        name: entry.name,
        value: legacyValueOf(entry.stored),
        definition: entry.stored,
      })),
    )
  }

  saved.forEach((variable, index) => {
    const entry = pending[index]
    if (!entry || !variable) {
      return
    }
    created.push(entry.name)
    if (entry.stored.kind === 'sequence') {
      const definition = normalizeVariableDefinition(entry.name, entry.stored, {
        scope: 'global',
        globalId: variable.id,
      })
      if (adopt(entry.name, definition)) {
        migratedState.push(entry.name)
      }
    }
  })

  return { created, migratedState, skipped }
}

/**
 * The whole one-click action: scan, then apply. Used by the settings button; a host that wants to
 * show the plan first calls the two functions separately.
 */
export const migrateLegacyInlineVariables = async (
  dependencies: LegacyMigrationApplyDependencies = {},
): Promise<{ plan: LegacyMigrationPlan; result: LegacyMigrationResult }> => {
  const plan = await scanLegacyInlineVariables(dependencies)
  return { plan, result: applyLegacyInlineMigration(plan, dependencies) }
}
