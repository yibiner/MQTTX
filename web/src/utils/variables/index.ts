/**
 * The variable system: one resolver, a chain of sources, and the helpers around it.
 *
 * Everything a feature needs is exported here; the compatibility entry point of the app is
 * `src/utils/payloadVariables.ts`, which re-exports this module plus the connection scopes.
 *
 * Extending the system (see `types.ts` for the interfaces):
 *
 *   1. implement a `VariableProvider` - `resolve(request, context)` returns the value of a name;
 *   2. declare `names`/`prefixes` (for the name validation and the guide) and `guide` entries;
 *   3. register it with `registerVariableProvider()` (app-wide) or pass it as
 *      `createPayloadVariableResolver({ providers: [...] })` (one message).
 *
 * A provider needs no parser change: the placeholder syntax, the arithmetic inside a placeholder,
 * the nested expansion of values, the counters and the unresolved reporting are independent of it.
 */
import { BUILTIN_VARIABLES, BUILTIN_VARIABLE_NAMES } from './providers/builtin'
import type { VariableValue } from './types'

export * from './types'
export { evaluateArithmeticExpression, formatExpressionNumber, containsOperator } from './expression'
export {
  PAYLOAD_VARIABLE_NAME_PATTERN,
  VARIABLE_TOKEN_END,
  VARIABLE_TOKEN_START,
  scanPlaceholders,
} from './placeholders'
export type { Placeholder } from './placeholders'
export {
  applyPayloadVariables,
  collectUnresolvedVariables,
  createPayloadVariableResolver,
  resolvePayloadVariables,
} from './resolver'
export {
  builtinVariableNames,
  getReservedVariableNames,
  getProviderVariableGuide,
  getVariableProviders,
  isBuiltinPayloadVariable,
  isReservedVariableName,
  registerVariableProvider,
  validateVariableName,
} from './registry'
export type { VariableNameIssue } from './registry'
export { BUILTIN_VARIABLES, BUILTIN_VARIABLE_NAMES } from './providers/builtin'
export {
  connectionStateKey,
  createVariableDefinition,
  globalStateKey,
  isStatefulKind,
  normalizeGlobalVariables,
  normalizeVariableDefinition,
  normalizeVariableMap,
  sessionStateKey,
  summarizeDefinition,
  toStoredVariable,
  validateVariableDefinition,
  validateStoredVariables,
} from './definitions'
export type {
  DefinitionLocation,
  ResolvedVariableDefinition,
  VariableDefinitionIssue,
  VariableScope,
} from './definitions'
export {
  applyConnectionVariableTrigger,
  applyVariableResetTrigger,
  clearConnectionSession,
  clearConnectionVariableStates,
  clearConnectionVariableValues,
  computeDefinitionValue,
  deleteVariableState,
  formatVariableValue,
  peekDefinitionValue,
  readConnectionSession,
  readVariableState,
  resetAllVariableStates,
  resetDefinitionState,
  resetGlobalVariableStates,
  setDefinitionValue,
  startConnectionSession,
  writeSessionSentCount,
  writeVariableState,
} from './state'
export type { ConnectionSessionState, ComputedValue, ComputeValueOptions, VariableStateRecord } from './state'
export { definitionsVariablesProvider } from './providers/definitions'
export {
  applyAutoReplyVariableActions,
  assignSequenceRunStart,
  markManualDisconnect,
  onConnectionClosed,
  onConnectionDeleted,
  onConnectionEstablished,
  onConnectionVariablesChanged,
  onGlobalVariableChanged,
  onGlobalVariableDeleted,
  resetAllVariables,
  resetConnectionVariables,
  resetLifecycleState,
  resetVariable,
  setVariableValue,
} from './lifecycle'
export type { LifecycleResetResult } from './lifecycle'
export { APP_STARTED_AT, sessionVariablesProvider } from './providers/session'
export { builtinVariablesProvider } from './providers/builtin'
export { messageVariablesProvider } from './providers/message'
export { userVariablesProvider } from './providers/user'

/**
 * Replaces every known placeholder in the payload with its current value. Kept for compatibility
 * with the original module; `applyPayloadVariables` is the same function.
 */
export { applyPayloadVariables as default } from './resolver'

/** The shape of the original built-in table, kept so existing imports keep working. */
export interface PayloadVariable {
  name: string
  value: (now: Date) => VariableValue
}

export const PAYLOAD_VARIABLES: PayloadVariable[] = BUILTIN_VARIABLES.map((variable) => ({
  name: variable.name,
  value: variable.value,
}))

/**
 * Merges variable scopes into the map the resolver consumes, the closest scope first: the client
 * variables of a connection win over the global variables of the preset manager.
 *
 * A name that the closer scope defines with an empty value counts as "not defined" there, so the
 * outer scope (or the inline `${name:config}` of the message) takes over -- that is how a single
 * connection can fall back to the global value.
 */
export const mergeVariables = (
  ...scopes: Array<{ [name: string]: string } | null | undefined>
): { [name: string]: string } => {
  const merged: { [name: string]: string } = {}
  scopes.forEach((scope) => {
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
      return
    }
    Object.keys(scope).forEach((name) => {
      const value = scope[name]
      if (!name || typeof value !== 'string' || value.trim() === '' || name in merged) {
        return
      }
      merged[name] = value
    })
  })
  return merged
}

/**
 * Payload types whose content is a template the variables are resolved in. An encoded payload
 * (base64, hex, CBOR, MsgPack) is data, not text, so only the topic is resolved for it.
 */
export const VARIABLE_PAYLOAD_TYPES: readonly PayloadType[] = ['Plaintext', 'JSON']

export const payloadTypeSupportsVariables = (type?: PayloadType | string | null): boolean =>
  VARIABLE_PAYLOAD_TYPES.includes(type as PayloadType)
