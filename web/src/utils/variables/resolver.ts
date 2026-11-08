import { evaluateArithmeticExpression, formatExpressionNumber } from './expression'
import { Placeholder, scanPlaceholders, VARIABLE_TOKEN_END } from './placeholders'
import { getVariableProviders } from './registry'
import { APP_STARTED_AT } from './providers/session'
import { computeDefinitionValue, readConnectionSession, writeSessionSentCount, writeVariableState } from './state'
import type { ResolvedVariableDefinition } from './definitions'
import type {
  PayloadVariableOptions,
  PayloadVariableResolver,
  PayloadVariableResult,
  VariableContext,
  VariableProvider,
  VariableRequest,
  VariableSession,
  VariableStateSink,
  VariableValue,
} from './types'

/**
 * The resolver: one pass over a text, one chain of providers per name.
 *
 * It owns everything that is the same for every variable source - the placeholder syntax, the
 * recursive expansion of nested values, the reference-cycle guard, the arithmetic fallback, the
 * JSON quote handling and the list of what could not be resolved - so a provider only answers
 * "what is the value of this name". See `types.ts` for the chain order.
 */

/** How often a variable may reference another variable before it counts as unresolvable. */
const MAX_VARIABLE_DEPTH = 10

interface ResolveContext {
  now: Date
  rand: () => number
  variables: Readonly<Record<string, string>>
  message?: unknown
  topic?: string
  definitions: Readonly<Record<string, ResolvedVariableDefinition>>
  connectionId?: string
  session?: VariableSession
  /** resolved value per name, so every occurrence of a name stays consistent */
  values: Map<string, string | number>
  /** runtime values of stateful variables to persist once the text was built */
  stagedStates: Map<string, { value: number | string; counter?: number }>
}

/** Turns a provider value into the text/number a placeholder is replaced with. */
const toTextValue = (value: VariableValue): string | number => {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'object') {
    // A message object/array is echoed as JSON, like the old `${msg}` handling did.
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    return value
  }
  return String(value)
}

const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/

export const createPayloadVariableResolver = (options: PayloadVariableOptions = {}): PayloadVariableResolver => {
  const context: ResolveContext = {
    now: options.now ?? new Date(),
    rand: options.rand ?? Math.random,
    variables: options.variables ?? {},
    message: options.message,
    topic: options.topic,
    definitions: options.definitions ?? {},
    connectionId: options.connectionId,
    values: new Map(),
    stagedStates: new Map(),
  }
  if (options.connectionId) {
    const stored = readConnectionSession(options.connectionId)
    context.session = {
      startedAt: stored?.startedAt,
      appStartedAt: APP_STARTED_AT,
      // The message being built is the next one of the session.
      sentCount: (stored?.sentCount ?? 0) + 1,
    }
  }
  const stateSink: VariableStateSink = {
    read: (definition) => {
      const computed = computeDefinitionValue(definition, {
        now: context.now,
        rand: context.rand,
        expandTemplate: (text) => expandText(text, []),
      })
      if (!computed) {
        return undefined
      }
      if (computed.next !== undefined || computed.nextCounter !== undefined) {
        const previous = context.stagedStates.get(definition.stateKey as string)
        context.stagedStates.set(definition.stateKey as string, {
          value: computed.next ?? previous?.value ?? computed.value,
          counter: computed.nextCounter ?? previous?.counter,
        })
      }
      return computed.value
    },
  }
  const providerContext: VariableContext = {
    now: context.now,
    rand: context.rand,
    variables: context.variables,
    message: context.message,
    messageContext: options.messageContext ?? options.message !== undefined,
    topic: context.topic,
    definitions: context.definitions,
    variableState: stateSink,
    session: context.session,
  }
  const providers: VariableProvider[] = [...getVariableProviders(), ...(options.providers ?? [])]

  const unresolved = new Set<string>()

  /**
   * Whether a provider declares this name. Used when a token also contains an operator: only a
   * provider that owns the name (`names`) or its namespace (`prefixes`) may claim it as a whole,
   * so `${msg.sensor-1}` is a field while `${ts-34000}` is left to the arithmetic.
   */
  const providerOwnsName = (provider: VariableProvider, name: string): boolean =>
    Boolean(provider.names?.includes(name)) ||
    Boolean(provider.prefixes?.some((prefix) => name === prefix || name.startsWith(`${prefix}.`)))

  /**
   * Resolves one name through the chain, with the recursive expansion of `nested` providers.
   *
   * The first provider that returns a value wins; a string value of a `nested` provider (a user
   * variable) is expanded again, which is how `device = PLC-${line}` works. A reference cycle is
   * reported instead of expanded forever, also when the cycle runs through an expression.
   */
  const resolveRequest = (
    request: VariableRequest,
    stack: string[],
    requireDeclaredName = false,
  ): string | number | undefined => {
    const cached = context.values.get(request.name)
    if (cached !== undefined) {
      return cached
    }
    for (const provider of providers) {
      if (requireDeclaredName && !providerOwnsName(provider, request.name)) {
        continue
      }
      const raw = provider.resolve(request, providerContext)
      if (raw === undefined) {
        continue
      }
      const value = toTextValue(raw)
      if (typeof value === 'string' && provider.nested) {
        if (stack.includes(request.name) || stack.length >= MAX_VARIABLE_DEPTH) {
          // Self reference or a reference cycle: report it instead of expanding forever.
          unresolved.add(request.name)
          return undefined
        }
        const expanded = expandText(value, [...stack, request.name])
        context.values.set(request.name, expanded)
        return expanded
      }
      context.values.set(request.name, value)
      return value
    }
    return undefined
  }

  /** The numeric value of one identifier inside an expression, or undefined when it is not one. */
  const numericValueOf = (identifier: string, stack: string[]): number | undefined => {
    const value = resolveRequest({ name: identifier }, stack)
    if (value === undefined) {
      return undefined
    }
    if (typeof value === 'number') {
      return value
    }
    const text = String(value).trim()
    return NUMBER_PATTERN.test(text) ? Number(text) : undefined
  }

  /** Evaluates the arithmetic of a placeholder that no provider could answer as a name. */
  const resolveExpression = (placeholder: Placeholder, stack: string[]): string | number | undefined => {
    const expression = placeholder.expression as string
    const cacheKey = `expr:${expression}`
    const cached = context.values.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }
    const result = evaluateArithmeticExpression(expression, (identifier) => numericValueOf(identifier, stack))
    if (result.value === undefined) {
      // `result.unresolved` is the identifier that failed; a syntax error / division by zero has
      // none, and then the whole expression is the thing the user has to look at.
      unresolved.add(result.unresolved ?? expression)
      return undefined
    }
    const value = Number(formatExpressionNumber(result.value))
    context.values.set(cacheKey, value)
    return value
  }

  const resolvePlaceholder = (placeholder: Placeholder, stack: string[]): string | number | undefined => {
    if (placeholder.expression !== undefined) {
      // The provisional name is tried first: `${msg.sensor-1}` is the field named `sensor-1`, while
      // `${ts-34000}` is arithmetic (nothing defines `ts-34000`, so the expression takes over).
      const exact = resolveRequest({ name: placeholder.name }, stack, true)
      if (exact !== undefined) {
        return exact
      }
      return resolveExpression(placeholder, stack)
    }
    const value = resolveRequest({ name: placeholder.name }, stack)
    if (value === undefined) {
      unresolved.add(placeholder.name)
    }
    return value
  }

  function expandText(text: string, stack: string[]): string {
    const placeholders = scanPlaceholders(text)
    if (!placeholders.length) {
      return text
    }

    let result = ''
    let index = 0
    for (const placeholder of placeholders) {
      const value = resolvePlaceholder(placeholder, stack)
      if (value === undefined) {
        // Unknown variable: copy it over verbatim, the caller reports it.
        result += text.slice(index, placeholder.end + VARIABLE_TOKEN_END.length)
        index = placeholder.end + VARIABLE_TOKEN_END.length
        continue
      }
      const isQuotedJsonString = text[placeholder.start - 1] === '"' && text[placeholder.end + 1] === '"'
      if (isQuotedJsonString && typeof value === 'number') {
        // "${timestamp}" -> 1791979522744 (drop the quotes so JSON numbers keep their type)
        result += text.slice(index, placeholder.start - 1) + String(value)
        index = placeholder.end + VARIABLE_TOKEN_END.length + 1
      } else {
        result += text.slice(index, placeholder.start) + String(value)
        index = placeholder.end + VARIABLE_TOKEN_END.length
      }
    }
    return result + text.slice(index)
  }

  return {
    resolve: (text: string) => (text ? expandText(text, []) : text),
    get unresolved(): string[] {
      return Array.from(unresolved)
    },
    commit: () => {
      if (options.commitCounters === false) {
        return
      }
      // Persist everything the resolved texts advanced, only once they were built successfully:
      // the stateful variables and the session message counter.
      context.stagedStates.forEach((state, stateKey) =>
        writeVariableState(stateKey, state.value, { counter: state.counter }),
      )
      context.stagedStates.clear()
      if (options.connectionId && context.session) {
        writeSessionSentCount(options.connectionId, context.session.sentCount)
      }
    },
  }
}

/** Resolves a single text with a resolver of its own, see `createPayloadVariableResolver`. */
export const resolvePayloadVariables = (text: string, options: PayloadVariableOptions = {}): PayloadVariableResult => {
  if (!text || !text.includes('${')) {
    return { text, unresolved: [] }
  }

  const resolver = createPayloadVariableResolver(options)
  const resolved = resolver.resolve(text)
  resolver.commit()
  return { text: resolved, unresolved: resolver.unresolved }
}

/**
 * Replaces every known placeholder in the payload with its current value.
 *
 * All variables of one payload share the same `now`, and a stateful variable that appears several
 * times in one message advances only once per send, so every occurrence stays consistent.
 * Unknown placeholders are left untouched.
 *
 * @deprecated use `resolvePayloadVariables` when the caller also needs the list of placeholders
 *             that could not be resolved (the publish path blocks those instead of sending them).
 */
export const applyPayloadVariables = (
  payload: string,
  now: Date = new Date(),
  rand: () => number = Math.random,
): string => resolvePayloadVariables(payload, { now, rand }).text

/**
 * Names of the placeholders that the given texts cannot resolve, in order of first appearance.
 *
 * The publish paths use it as a gate before they resolve for real: a probe must not advance
 * counters, and an unresolved `${name}` has to be reported instead of being published as it is.
 */
export const collectUnresolvedVariables = (
  variables: { [name: string]: string },
  texts: Array<string | undefined | null>,
  options: { definitions?: { [name: string]: ResolvedVariableDefinition }; connectionId?: string } = {},
): string[] => {
  const resolver = createPayloadVariableResolver({ variables, ...options, commitCounters: false })
  texts.forEach((text) => {
    if (text) {
      resolver.resolve(text)
    }
  })
  return resolver.unresolved
}
