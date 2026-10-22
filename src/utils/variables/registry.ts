import { PAYLOAD_VARIABLE_NAME_PATTERN } from './placeholders'
import { builtinVariablesProvider, BUILTIN_VARIABLE_NAMES } from './providers/builtin'
import { definitionsVariablesProvider } from './providers/definitions'
import { inlineVariablesProvider } from './providers/inline'
import { messageVariablesProvider } from './providers/message'
import { sessionVariablesProvider } from './providers/session'
import { userVariablesProvider } from './providers/user'
import type { VariableGuideEntry, VariableProvider } from './types'

/**
 * The chain of variable providers and the small amount of metadata derived from it.
 *
 * The sources are a list, not code in the resolver: adding a kind of variable (an environment
 * lookup, a device register, a value a caller knows) means implementing one `VariableProvider` and
 * registering it - the placeholder syntax, the arithmetic, the counters and the unresolved
 * reporting keep working for it.
 *
 * Order (see `types.ts`): built-in -> context (message/topic, session clocks) -> user-defined
 * variables (definitions, then the legacy string map) -> registered -> inline forms. The inline
 * forms are not part of this list; the resolver always appends them last.
 */
const providers: VariableProvider[] = [
  builtinVariablesProvider,
  messageVariablesProvider,
  sessionVariablesProvider,
  definitionsVariablesProvider,
  userVariablesProvider,
]

/** The current source chain, closest definition first. */
export const getVariableProviders = (): readonly VariableProvider[] => providers

/**
 * Adds a variable source to the app.
 *
 * - a normal provider is asked after the user-defined variables, so a name the user defined wins;
 * - a provider that is `reserved` (or registered with `{ reserved: true }`) is asked right after
 *   the built-in variables - before the context and the user-defined variables - and its names can
 *   no longer be used as a variable name.
 *
 * Returns the function that removes it again (used by tests and by toggleable integrations).
 */
export const registerVariableProvider = (
  provider: VariableProvider,
  options: { reserved?: boolean } = {},
): (() => void) => {
  if (providers.some((registered) => registered.id === provider.id)) {
    throw new Error(`Variable provider "${provider.id}" is already registered`)
  }
  const reserved = options.reserved ?? provider.reserved ?? false
  const entry = reserved === Boolean(provider.reserved) ? provider : { ...provider, reserved }
  const index = reserved
    ? Math.max(
        providers.findIndex((registered) => !registered.reserved),
        0,
      )
    : providers.length
  providers.splice(index, 0, entry)
  return () => {
    const current = providers.indexOf(entry)
    if (current !== -1) {
      providers.splice(current, 1)
    }
  }
}

/** The names a provider chain reserves, i.e. that cannot be used for a user-defined variable. */
export const getReservedVariableNames = (): string[] =>
  providers.filter((provider) => provider.reserved).flatMap((provider) => [...(provider.names ?? [])])

/** Whether `name` belongs to a reserved provider (a built-in variable), so it cannot be redefined. */
export const isReservedVariableName = (name: string): boolean => getReservedVariableNames().includes(name)

/** Backwards-compatible name of `isReservedVariableName`, used by the variable editors. */
export const isBuiltinPayloadVariable = isReservedVariableName

/**
 * The guide entries of the provider chain, grouped by where the variable comes from.
 *
 * Everything a provider declares shows up here, so a new source documents itself; the dialog only
 * has to translate the four group headings. The public `getVariableGuide` of the facade adds the
 * connection fields, which are not a provider of this chain.
 */
export const getProviderVariableGuide = (): VariableGuideEntry[] =>
  [...providers, inlineVariablesProvider].flatMap((provider) => [...(provider.guide ?? [])])

/** A reserved name of the built-in variables, for the editors that talk about "内置变量". */
export const builtinVariableNames = (): readonly string[] => BUILTIN_VARIABLE_NAMES

/** Why a name cannot be used for a user-defined variable, or undefined when it can. */
export type VariableNameIssue = 'invalid' | 'reserved' | 'duplicate'

/**
 * Validates a user-defined variable name: it has to be referenceable as `${name}`, must not shadow a
 * reserved (built-in) variable and must be unique among `takenNames`.
 *
 * The editors translate the returned issue; keeping the decision here means the two dialogs that
 * edit variables cannot drift apart, and a new reserved namespace is picked up by both.
 */
export const validateVariableName = (
  name: string,
  takenNames: readonly string[] = [],
): VariableNameIssue | undefined => {
  const trimmed = (name ?? '').trim()
  if (!PAYLOAD_VARIABLE_NAME_PATTERN.test(trimmed)) {
    return 'invalid'
  }
  if (isReservedVariableName(trimmed)) {
    return 'reserved'
  }
  if (takenNames.includes(trimmed)) {
    return 'duplicate'
  }
  return undefined
}
