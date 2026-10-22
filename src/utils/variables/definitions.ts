/**
 * Definitions of stateful payload variables.
 *
 * A variable used to be a constant string. A definition keeps that form (a bare string is a
 * constant) and adds the stateful kinds - a counter that counts down, a random walk, a value that
 * is generated once per connection session, and so on. See `types.ts` for how the resolver consumes
 * them and `state.ts` for where their current value lives.
 *
 * The scope of a definition decides its state key, i.e. which connections share the value:
 *
 * - a global variable of the preset manager -> `g:<variable id>`, one value for every connection
 * - a client variable of a connection / client preset -> `c:<connection id>:<name>`, one value per
 *   connection ("每个客户端使用不同的值")
 */
export type VariableScope = 'global' | 'connection'

/** A definition with every default applied, ready for the resolver and the state store. */
export interface ResolvedVariableDefinition {
  name: string
  kind: VariableKind
  /** constant template / captured default */
  value?: string
  initial?: number
  step?: number
  min?: number
  max?: number
  onBound: VariableBoundStrategy
  resetOn: VariableResetTrigger[]
  resetOnReconnect: boolean
  resetEverySec?: number
  range?: number
  options?: Array<{ value: string; weight: number }>
  seed?: number
  generator: 'uuid' | 'template'
  format?: { pad?: number; precision?: number }
  /** where the current value lives; absent means "no runtime state" (a constant) */
  stateKey?: string
  /** the global preset id, when the definition comes from the global variables list */
  globalId?: string
  scope: VariableScope
}

export interface DefinitionLocation {
  scope: VariableScope
  /** connection id for a connection-scoped definition */
  connectionId?: string
  /** global preset id for a global definition */
  globalId?: string
}

/** Where the current value of a global variable is stored. */
export const globalStateKey = (globalId: string): string => `g:${globalId}`

/** Where the current value of a connection-scoped variable is stored. */
export const connectionStateKey = (connectionId: string, name: string): string => `c:${connectionId}:${name}`

/** Where the session clock / send counter of one connection is stored. */
export const sessionStateKey = (connectionId: string): string => `s:${connectionId}`

const RESET_TRIGGERS: VariableResetTrigger[] = ['connect', 'disconnect', 'appStart', 'manual', 'bound']
const BOUND_STRATEGIES: VariableBoundStrategy[] = ['clamp', 'wrap', 'reset', 'keep']

const STATE_KEYS: VariableKind[] = ['sequence', 'random', 'randomWalk', 'choice', 'session', 'captured']

/** Whether a definition keeps a current value that changes between sends. */
export const isStatefulKind = (kind: VariableKind): boolean => STATE_KEYS.includes(kind)

export const KIND_ALIASES: VariableKind[] = [
  'constant',
  'sequence',
  'random',
  'randomWalk',
  'choice',
  'session',
  'captured',
]

const numberFrom = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined
  }
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * A finite number from whatever a hand-edited `config.json`, an old backup or an imported file put
 * into a numeric field. A string like `"200"` is accepted (and becomes a number), anything else is
 * undefined so the definition falls back to its default instead of crashing the publish path with
 * `value.toFixed is not a function`.
 */
const finiteNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** A string field from potentially dirty data. */
const textOrUndefined = (value: unknown): string | undefined =>
  value === undefined || value === null ? undefined : typeof value === 'string' ? value : String(value)

const boundedInt = (value: unknown, min: number, max: number): number | undefined => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return Math.min(Math.max(Math.round(parsed), min), max)
}

/**
 * Merges a stored value (a bare string = constant, an object = a definition) with its defaults.
 * The location decides the state key; a mutation of a global definition is shared by every
 * connection, a connection-scoped one only affects that connection.
 */
export const normalizeVariableDefinition = (
  name: string,
  stored: StoredVariable | undefined,
  location: DefinitionLocation,
): ResolvedVariableDefinition => {
  const config: VariableDefinitionConfig =
    stored === undefined ? {} : typeof stored === 'string' ? { kind: 'constant', value: stored } : { ...stored }
  const kind: VariableKind = config.kind && KIND_ALIASES.includes(config.kind) ? config.kind : 'constant'
  const stateKey =
    kind === 'constant'
      ? undefined
      : location.scope === 'global'
      ? location.globalId
        ? globalStateKey(location.globalId)
        : undefined
      : location.connectionId
      ? connectionStateKey(location.connectionId, name)
      : undefined
  const resetOn = Array.isArray(config.resetOn)
    ? config.resetOn.filter((trigger): trigger is VariableResetTrigger => RESET_TRIGGERS.includes(trigger))
    : []
  if (kind === 'session' && !resetOn.includes('connect')) {
    // A session value is generated once per connection session by definition.
    resetOn.push('connect')
  }
  const format =
    config.format && (config.format.pad !== undefined || config.format.precision !== undefined)
      ? {
          pad: config.format.pad === undefined ? undefined : boundedInt(config.format.pad, 0, 20),
          precision: config.format.precision === undefined ? undefined : boundedInt(config.format.precision, 0, 6),
        }
      : undefined

  return {
    name,
    kind,
    value: textOrUndefined(config.value),
    initial: finiteNumber(config.initial) ?? numberFrom(textOrUndefined(config.value)),
    step: finiteNumber(config.step),
    min: finiteNumber(config.min),
    max: finiteNumber(config.max),
    onBound: config.onBound && BOUND_STRATEGIES.includes(config.onBound) ? config.onBound : 'clamp',
    resetOn,
    resetOnReconnect: typeof config.resetOnReconnect === 'boolean' ? config.resetOnReconnect : true,
    resetEverySec:
      finiteNumber(config.resetEverySec) === undefined
        ? undefined
        : Math.max(Math.round(Number(config.resetEverySec)), 0),
    range: finiteNumber(config.range),
    options: Array.isArray(config.options)
      ? config.options
          .filter((option) => option && typeof option.value === 'string' && Number.isFinite(Number(option.weight)))
          .map((option) => ({ value: option.value, weight: Math.max(Number(option.weight), 0) }))
      : undefined,
    seed: Number.isFinite(Number(config.seed)) ? Number(config.seed) : undefined,
    generator: config.generator === 'template' ? 'template' : 'uuid',
    format,
    stateKey,
    globalId: location.globalId,
    scope: location.scope,
  }
}

/** Normalizes a `{ name: stored }` map (connection variables, client preset variables). */
export const normalizeVariableMap = (
  map: { [name: string]: StoredVariable } | null | undefined,
  location: Omit<DefinitionLocation, 'scope'> = {},
): { [name: string]: ResolvedVariableDefinition } => {
  const definitions: { [name: string]: ResolvedVariableDefinition } = {}
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    // A hand-edited config.json / an old backup may hold something that is not a map at all.
    return definitions
  }
  Object.keys(map).forEach((name) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed in definitions) {
      // The first definition of a name wins, like the legacy merge did.
      return
    }
    definitions[trimmed] = normalizeVariableDefinition(trimmed, map[name], {
      scope: 'connection',
      connectionId: location.connectionId,
    })
  })
  return definitions
}

/** Normalizes the stored global variables list of the preset manager. */
export const normalizeGlobalVariables = (
  variables:
    | Array<{ id: string; name: string; value: string; definition?: VariableDefinitionConfig }>
    | null
    | undefined,
): { [name: string]: ResolvedVariableDefinition } => {
  const definitions: { [name: string]: ResolvedVariableDefinition } = {}
  if (!Array.isArray(variables)) {
    // A hand-edited config.json must not crash the publish path.
    return definitions
  }
  variables.forEach((variable) => {
    if (!variable || typeof variable !== 'object') {
      // A corrupted global variable list must not crash the publish path.
      return
    }
    const name = (variable.name ?? '').trim()
    if (!name || name in definitions) {
      return
    }
    const definition =
      variable.definition && typeof variable.definition === 'object'
        ? (variable.definition as VariableDefinitionConfig)
        : undefined
    const stored: VariableDefinitionConfig = {
      ...(definition ?? {}),
      // The legacy `value` is the constant template; keep it as the default of a stateful variable.
      value: definition?.value ?? variable.value,
    }
    const kind = definition?.kind
    if (kind && kind !== 'constant' && kind !== 'session' && kind !== 'captured') {
      // Numeric kinds have no template: the legacy `value` is their initial number. A session
      // keeps its generator template and a captured variable its fallback value.
      stored.value = undefined
      stored.initial = finiteNumber(variable.definition?.initial) ?? numberFrom(String(variable.value ?? ''))
    }
    definitions[name] = normalizeVariableDefinition(name, stored, {
      scope: 'global',
      globalId: variable.id,
    })
  })
  return definitions
}

/** The persisted form of a definition, written back to a connection / client preset map. */
export const toStoredVariable = (definition: ResolvedVariableDefinition): StoredVariable => {
  if (definition.kind === 'constant') {
    return definition.value ?? ''
  }
  const stored: VariableDefinitionConfig = {
    kind: definition.kind,
    value: definition.value,
    initial: definition.initial,
    step: definition.step,
    min: definition.min,
    max: definition.max,
    onBound: definition.onBound,
    resetOn: definition.resetOn.length ? [...definition.resetOn] : undefined,
    resetOnReconnect: definition.resetOnReconnect,
    resetEverySec: definition.resetEverySec,
    range: definition.range,
    options: definition.options,
    seed: definition.seed,
    generator: definition.generator === 'uuid' ? undefined : definition.generator,
    format: definition.format,
  }
  Object.keys(stored).forEach((key) => {
    if ((stored as { [key: string]: unknown })[key] === undefined) {
      delete (stored as { [key: string]: unknown })[key]
    }
  })
  return stored
}

/** A brand-new definition of a kind, used by the editors. */
export const createVariableDefinition = (kind: VariableKind, name = '', value = ''): ResolvedVariableDefinition =>
  normalizeVariableDefinition(name, kind === 'constant' ? value : { kind, value: value || undefined }, {
    scope: 'connection',
  })

/**
 * Validation of one definition. The return codes are translated by the editors; keeping the rules
 * here means the connection editor, the client preset editor and the global variables dialog cannot
 * drift apart.
 */
export type VariableDefinitionIssue =
  | 'initialOutsideRange'
  | 'minGreaterThanMax'
  | 'stepZero'
  | 'rangeNegative'
  | 'randomRange'
  | 'choiceOptions'
  | 'precisionRange'
  | 'padRange'
  | 'resetEverySecNegative'
  | 'seedNotNumber'

export const validateVariableDefinition = (definition: ResolvedVariableDefinition): VariableDefinitionIssue[] => {
  const issues: VariableDefinitionIssue[] = []
  const { min, max } = definition
  if (min !== undefined && max !== undefined && min > max) {
    issues.push('minGreaterThanMax')
  }
  if (['sequence', 'randomWalk'].includes(definition.kind)) {
    const initial = definition.initial
    if (initial !== undefined && Number.isNaN(initial)) {
      issues.push('initialOutsideRange')
    } else if (initial !== undefined) {
      if (min !== undefined && initial < min) {
        issues.push('initialOutsideRange')
      }
      if (max !== undefined && initial > max) {
        issues.push('initialOutsideRange')
      }
    }
  }
  if (definition.kind === 'sequence' && definition.step !== undefined && definition.step === 0) {
    issues.push('stepZero')
  }
  if (definition.kind === 'randomWalk' && definition.range !== undefined && definition.range < 0) {
    issues.push('rangeNegative')
  }
  if (definition.kind === 'random' && min !== undefined && max !== undefined && min > max) {
    issues.push('randomRange')
  }
  if (definition.kind === 'choice' && !(definition.options ?? []).length) {
    issues.push('choiceOptions')
  }
  if (definition.format?.pad !== undefined && (definition.format.pad < 0 || definition.format.pad > 20)) {
    issues.push('padRange')
  }
  if (
    definition.format?.precision !== undefined &&
    (definition.format.precision < 0 || definition.format.precision > 6)
  ) {
    issues.push('precisionRange')
  }
  if (definition.resetEverySec !== undefined && definition.resetEverySec < 0) {
    issues.push('resetEverySecNegative')
  }
  if (definition.seed !== undefined && Number.isNaN(definition.seed)) {
    issues.push('seedNotNumber')
  }
  return issues
}

/** Validation issues of every definition of a stored map, keyed by variable name. */
export const validateStoredVariables = (
  map: { [name: string]: StoredVariable } | null | undefined,
  location: DefinitionLocation,
): Array<{ name: string; issues: VariableDefinitionIssue[] }> =>
  Object.keys(map ?? {})
    .map((name) => ({
      name,
      issues: validateVariableDefinition(normalizeVariableDefinition(name, map?.[name], location)),
    }))
    .filter((entry) => entry.issues.length > 0)

/** Human readable summary used by the variable table, e.g. `序列 -20` or `随机 -60..-30`. */
export const summarizeDefinition = (definition: ResolvedVariableDefinition): string => {
  switch (definition.kind) {
    case 'sequence':
      return `sequence ${definition.step ?? 1}`
    case 'random':
      return `random ${definition.min ?? 0}..${definition.max ?? 100}`
    case 'randomWalk':
      return `walk ±${definition.range ?? 1}`
    case 'choice':
      return `choice ×${(definition.options ?? []).length}`
    case 'session':
      return definition.generator === 'template' ? 'session template' : 'session uuid'
    case 'captured':
      return 'captured'
    default:
      return 'constant'
  }
}
