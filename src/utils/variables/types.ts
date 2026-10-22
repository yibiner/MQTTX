/**
 * Types of the variable system.
 *
 * A variable is resolved in one pass over a text (a topic, a payload, a reply template) by a chain
 * of `VariableProvider`s. A provider is the only thing a new kind of variable has to implement:
 * the placeholder syntax, the arithmetic, the counters, the recursion guard and the unresolved
 * reporting are all handled by `resolver.ts`, not by the provider.
 *
 * The chain of the app is, closest definition first:
 *
 *   1. built-in variables (`${timestamp}`, `${uuid}`, ...)  -- reserved, cannot be overridden
 *   2. context variables (`${msg.<path>}`, `${topic}`, `${connectedAt}`, `${sessionSentCount}`)
 *   3. user-defined variables (client variables, global variables, connection fields)
 *   4. registered extensions                                -- see `registerVariableProvider`
 *   5. inline forms (`${count:1}`, `${rssi:-30..-60}`)      -- legacy compatibility fallback
 *
 * A registered provider that is `reserved` is asked right after the built-in variables instead of
 * after the user-defined ones, and its names cannot be used for a user variable. See
 * `src/utils/variables/README.md` for the extension recipe.
 */

import type { ResolvedVariableDefinition } from './definitions'

/** A value a provider can produce for a placeholder. `undefined` means "not defined here". */
export type VariableValue = string | number | boolean | null | Record<string, unknown> | readonly unknown[] | undefined

/** The clock and send counter of one connection session (`${connectedAt}`, `${sessionSentCount}`). */
export interface VariableSession {
  /** epoch ms of the successful connect that started the session */
  readonly startedAt?: number
  /** epoch ms when the app process started, `${appStartedAt}` */
  readonly appStartedAt: number
  /** 1-based index of the message being built in this session */
  readonly sentCount: number
}

/**
 * The bridge to the runtime state of the stateful definitions. The resolver stages every value the
 * next message starts from and persists it on `commit()`, so a preview never advances a counter.
 */
export interface VariableStateSink {
  /** The effective value of a stateful definition, e.g. the current water weight; stages the next value. */
  read(definition: ResolvedVariableDefinition): string | number | undefined
}

/** One placeholder, i.e. the `name` and the optional `config` of `${name:config}`. */
export interface VariableRequest {
  /** the identifier, e.g. `ts`, `msg.data.id`, `clientId` */
  readonly name: string
  /** the part after `:`, e.g. `3` in `${count:3}` or `-30..-60` in `${rssi:-30..-60}` */
  readonly config?: string
}

/** Everything one message can tell the providers; shared by all placeholders of that message. */
export interface VariableContext {
  /** the moment the message is sent; all time variables of one message share it */
  readonly now: Date
  /** random source of the inline range form, injectable for tests */
  readonly rand: () => number
  /** user-defined variables, the scopes already merged (closest scope first) */
  readonly variables: Readonly<Record<string, string>>
  /** the received message of an automatic reply, reachable as `msg.<path>` */
  readonly message?: unknown
  /**
   * Whether this text belongs to a context that *has* a received message (an automatic reply), even
   * when the payload could not be parsed as JSON. In such a context every message field renders,
   * and a missing one renders as an empty string. Without it (a plain publish), `${msg...}` falls
   * through to the user variables, so a variable named `msg` keeps working.
   */
  readonly messageContext?: boolean
  /** topic the text belongs to or was received on, reachable as `topic` */
  readonly topic?: string
  /** counter persistence; only the inline form uses it */
  readonly counters: VariableCounterSink
  /** the stateful user variables of this message, by name */
  readonly definitions?: Readonly<Record<string, ResolvedVariableDefinition>>
  /** reads/advances the runtime state of the stateful definitions */
  readonly variableState?: VariableStateSink
  /** session clock and sent-message counter, when the resolver knows the connection */
  readonly session?: VariableSession
}

/** Reads and stages counter values; the resolver commits the staged ones after a successful text. */
export interface VariableCounterSink {
  /** the stored value of the counter, or undefined when it was never used */
  read(name: string): number | undefined
  /** the value the next send must use; committed by the resolver, not written here */
  stage(name: string, nextValue: number): void
}

/**
 * The group a variable belongs to in the variable guide ("变量说明").
 *
 * The four groups are the sections the guide dialog knows; a new provider has to file under one of
 * them (or the dialog needs one more heading key).
 */
export type VariableGuideGroup = 'builtin' | 'context' | 'connection' | 'inline'

/** One entry of the variable guide; the names are shown, the group only labels the section. */
export interface VariableGuideEntry {
  readonly name: string
  readonly group: VariableGuideGroup
}

/**
 * A source of variables.
 *
 * `resolve` returns the value of a name or `undefined` to let the next provider answer. The
 * resolver expands string values of `nested` providers (a user variable may reference another
 * placeholder), guards against reference cycles and reports what none of the providers could
 * resolve, so a provider stays a small, focused lookup.
 */
export interface VariableProvider {
  /** stable id, used for diagnostics and uniqueness */
  readonly id: string
  /** exact names this provider owns; a reserved provider's names cannot be user-defined */
  readonly names?: readonly string[]
  /**
   * Namespaces this provider owns, e.g. `msg` for `msg.<path>`. A namespaced token that also
   * contains an operator (`${env.MY-VAR}`) is tried against the owning provider as a whole name
   * before it is evaluated as arithmetic.
   */
  readonly prefixes?: readonly string[]
  /**
   * A reserved provider wins over every user-defined variable and its names cannot be used as a
   * variable name. Context providers (message, topic) are not reserved: they only answer when the
   * context carries a message/topic.
   */
  readonly reserved?: boolean
  /**
   * Whether a string value may reference further placeholders, e.g. `device = PLC-${line}`.
   * Message fields are not expanded: a received payload is data, never a template.
   */
  readonly nested?: boolean
  /** entries this provider contributes to the variable guide */
  readonly guide?: readonly VariableGuideEntry[]
  resolve(request: VariableRequest, context: VariableContext): VariableValue
}

export interface PayloadVariableOptions {
  /**
   * User-defined variables, keyed by name. The caller passes the scopes merged from the closest one
   * to the outermost one (client variables -> global variables -> connection fields), so a name
   * defined closer to the message wins. Use `connectionVariableMap()` to build it for a connection.
   */
  variables?: { [name: string]: string }
  now?: Date
  rand?: () => number
  /** Whether the counters used by this text are persisted (default true). */
  commitCounters?: boolean
  /** The message this text answers (an automatic reply); its fields become `msg.<path>`. */
  message?: unknown
  /**
   * Set by a caller that renders a reply: a received message exists even when `message` is undefined
   * (the payload was not JSON), so `${msg.x}` renders as an empty string instead of being reported
   * as unresolved. Defaults to `message !== undefined`.
   */
  messageContext?: boolean
  /** The topic the text belongs to; `${topic}` resolves to it. */
  topic?: string
  /** Extra providers for this resolver only, e.g. a caller that knows a value only it can provide. */
  providers?: readonly VariableProvider[]
  /** The stateful variables of this message (connection variables + global variables), by name. */
  definitions?: { [name: string]: ResolvedVariableDefinition }
  /** The connection the message belongs to; needed for the variable state and the session clock. */
  connectionId?: string
}

export interface PayloadVariableResult {
  /** the text with every resolvable placeholder replaced; unresolved ones stay verbatim */
  text: string
  /** names that no provider and no inline form could resolve */
  unresolved: string[]
}

export interface PayloadVariableResolver {
  /** replaces every resolvable placeholder of one text (a topic or a payload) */
  resolve: (text: string) => string
  /** names that neither a provider nor an inline config could resolve */
  readonly unresolved: string[]
  /** persists the counters this resolver used; does nothing when `commitCounters` is false */
  commit: () => void
}
