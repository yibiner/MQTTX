/**
 * Entry point of the variable system ("payload variables").
 *
 * A topic, a payload or a reply template may contain `${...}` placeholders, which are filled in
 * right before the text is used. The implementation is split by concern under `./variables`:
 *
 *   variables/types.ts            the provider interface and the options/result types
 *   variables/placeholders.ts     the `${...}` syntax (name, `:config`, expression fallback)
 *   variables/expression.ts       the small arithmetic language inside a placeholder
 *   variables/providers/*.ts      the sources: built-in, message/topic, user variables, inline forms
 *   variables/resolver.ts         the one resolution pipeline (recursion, counters, unresolved)
 *   variables/registry.ts         the provider chain, name validation and the variable guide
 *   variables/counters.ts         persistence of `${count:3}`
 *
 * `connectionVariables.ts` builds the scopes of one connection from the model (client variables ->
 * global variables -> connection fields). Every feature of the app should use `connectionVariableMap`
 * instead of spelling that order out again.
 *
 * Extending it: implement a `VariableProvider` (`variables/types.ts`), declare its `names`,
 * `prefixes` and `guide`, and register it with `registerVariableProvider()` or pass it to one
 * resolver as `{ providers: [...] }`. See `variables/index.ts` for the short recipe.
 */
import {
  applyPayloadVariables,
  collectUnresolvedVariables,
  createPayloadVariableResolver,
  resolvePayloadVariables,
} from './variables/resolver'
import { getProviderVariableGuide } from './variables/registry'
import { connectionVariableGuide } from './connectionVariables'
import type { VariableGuideEntry } from './variables/types'

export {
  applyPayloadVariables,
  collectUnresolvedVariables,
  createPayloadVariableResolver,
  resolvePayloadVariables,
} from './variables/resolver'
export { mergeVariables, payloadTypeSupportsVariables, VARIABLE_PAYLOAD_TYPES } from './variables'
export {
  PAYLOAD_VARIABLE_NAME_PATTERN,
  VARIABLE_TOKEN_END,
  VARIABLE_TOKEN_START,
  scanPlaceholders,
} from './variables/placeholders'
export type { Placeholder } from './variables/placeholders'
export {
  flushPayloadCounters,
  readPayloadCounter,
  resetPayloadCounters,
  writePayloadCounter,
} from './variables/counters'
export {
  applyLegacyInlineMigration,
  migrateLegacyInlineVariables,
  scanLegacyInlineVariables,
} from './variables/migration'
export type {
  LegacyInlineConflict,
  LegacyInlineDefinition,
  LegacyMigrationApplyDependencies,
  LegacyMigrationPlan,
  LegacyMigrationResult,
  LegacyMigrationSources,
} from './variables/migration'
export {
  builtinVariableNames,
  getReservedVariableNames,
  getVariableProviders,
  isBuiltinPayloadVariable,
  isReservedVariableName,
  registerVariableProvider,
  validateVariableName,
} from './variables/registry'
export type { VariableNameIssue } from './variables/registry'
export { PAYLOAD_VARIABLES } from './variables'
export type { PayloadVariable } from './variables'
export type {
  PayloadVariableOptions,
  PayloadVariableResolver,
  PayloadVariableResult,
  VariableContext,
  VariableCounterSink,
  VariableGuideEntry,
  VariableGuideGroup,
  VariableProvider,
  VariableRequest,
  VariableValue,
} from './variables/types'
export {
  connectionFieldVariables,
  connectionScopedDefinitions,
  connectionVariableDefinitions,
  connectionVariableGuide,
  connectionVariableMap,
  connectionVariableOptions,
  connectionVariables,
  globalVariableDefinitions,
} from './connectionVariables'
export type { ConnectionVariableSet, ConnectionVariableSource } from './connectionVariables'
export {
  applyAutoReplyVariableActions,
  adoptLegacyCounterState,
  applyConnectionVariableTrigger,
  applyVariableResetTrigger,
  clearConnectionSession,
  clearConnectionVariableStates,
  clearConnectionVariableValues,
  computeDefinitionValue,
  createVariableDefinition,
  definitionsVariablesProvider,
  deleteVariableState,
  formatVariableValue,
  isStatefulKind,
  normalizeGlobalVariables,
  normalizeVariableDefinition,
  normalizeVariableMap,
  peekDefinitionValue,
  readConnectionSession,
  readVariableState,
  resetAllVariableStates,
  resetDefinitionState,
  resetGlobalVariableStates,
  sessionVariablesProvider,
  setDefinitionValue,
  startConnectionSession,
  summarizeDefinition,
  toStoredVariable,
  validateVariableDefinition,
  validateStoredVariables,
  writeVariableState,
  writeSessionSentCount,
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
} from './variables'
export type {
  DefinitionLocation,
  ResolvedVariableDefinition,
  VariableDefinitionIssue,
  VariableScope,
} from './variables'

/**
 * Every variable the app can currently offer, grouped by source: built-in, message/topic,
 * connection fields and the inline forms. The "变量说明" dialog renders this, so a provider that
 * declares `guide` entries documents itself.
 */
export const getVariableGuide = (): VariableGuideEntry[] => [...getProviderVariableGuide(), ...connectionVariableGuide]

export default applyPayloadVariables
