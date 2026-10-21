import lodashGet from 'lodash/get'
import { v4 as uuidv4 } from 'uuid'
import time from './time'

/**
 * Dynamic variables that are filled in right before a message is published.
 *
 * Syntax: `${name}` for the built-in variables, `${name:config}` for user variables.
 *
 * Built-in variables:
 * - `${timestamp}` / `${ts}`  — epoch milliseconds, e.g. 1791979522744
 * - `${timestampSec}`         — epoch seconds
 * - `${datetime}`             — local "YYYY-MM-DD HH:mm:ss"
 * - `${date}` / `${time}`     — local "YYYY-MM-DD" / "HH:mm:ss"
 * - `${iso}`                  — UTC ISO 8601, e.g. 2026-10-14T12:00:03.643Z
 * - `${uuid}`                 — a fresh UUID v4 on every send
 *
 * Simple arithmetic is supported inside a placeholder, which is how a payload asks for
 * "34 seconds ago": `${ts-34000}`, `${timestamp+5000}`, `${base * 2}`, `(${count:1} + 1) / 2`.
 * An expression may use numbers, the built-in variables, user variables and - in an automatic reply -
 * the fields of the received message (`${msg.ts - 34000}`), with `+ - * / %`, parentheses and the usual
 * precedence. A token without an operator keeps its previous meaning, and a variable whose value is not
 * numeric is reported as unresolved instead of silently producing `NaN`.
 *
 * User variables (`name` is chosen freely, e.g. rssi):
 * - `${count:3}`       — auto-increment counter: the first send uses 3, every following send +1.
 *                        The current value is persisted locally, so it survives app restarts and
 *                        wins over the inline initial value. `Settings → Reset payload variables`
 *                        clears the stored values.
 * - `${rssi:-30..-60}` — a random integer between both bounds (inclusive), drawn fresh on every
 *                        send. Bounds may be given in any order and may be negative.
 *
 * User-defined variables are referenced with the same `${name}` syntax and can be used in a topic
 * as well as in a payload. They are looked up before the inline config above, so defining `rssi`
 * turns `${rssi:-30..-60}` into that value while every payload that does not define `rssi` stays
 * unchanged. The scopes are merged by `mergeVariables`, the closest one first:
 *
 *   1. the "客户端变量" of the connection (edited in the connection form)
 *   2. the global variables of the preset manager
 *   3. the fields of the connection itself (`connectionFieldVariables`), so `${clientId}`,
 *      `${username}`, `${name}`, `${host}` and `${port}` need no configuration
 *
 * An empty value counts as "not defined" and falls through to the next scope. A value may reference
 * further placeholders (e.g. `requestNo = ${count:1000}`); a placeholder that cannot be resolved is
 * left in the text and reported by `resolvePayloadVariables`, so the publish path can refuse to
 * send it instead of publishing the raw template.
 *
 * The payload stored in the publish history keeps the raw template, so every re-send gets a
 * fresh value, while the actually published message carries the real data.
 *
 * When a placeholder is written as a quoted JSON string ("${timestamp}") and the value is a
 * number, the surrounding quotes are removed as well, so the JSON keeps the correct type:
 *   { "cmd": "HEARTBEAT", "ts": 1791979522744 }
 */
export interface PayloadVariable {
  name: string
  value: (now: Date) => string | number
}

export const PAYLOAD_VARIABLES: PayloadVariable[] = [
  { name: 'timestamp', value: (now) => now.getTime() },
  { name: 'ts', value: (now) => now.getTime() },
  { name: 'timestampSec', value: (now) => Math.floor(now.getTime() / 1000) },
  { name: 'datetime', value: (now) => time.toFormat(now).slice(0, 19) },
  { name: 'date', value: (now) => time.toFormat(now).slice(0, 10) },
  { name: 'time', value: (now) => time.toFormat(now).slice(11, 19) },
  { name: 'iso', value: (now) => now.toISOString() },
  { name: 'uuid', value: () => uuidv4() },
]

const VARIABLE_TOKEN_START = '${'
const VARIABLE_TOKEN_END = '}'
const COUNTER_STORE_KEY = 'payloadCounters'
/**
 * A variable name that can be referenced as `${name}`. Anchored, so text that merely contains a
 * `${` sequence (e.g. `${HOME}/x`) is not treated as a variable either.
 */
export const PAYLOAD_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Whether `name` is one of the built-in variables, whose names are reserved. */
export const isBuiltinPayloadVariable = (name: string): boolean =>
  PAYLOAD_VARIABLES.some((variable) => variable.name === name)

// ---------------------------------------------------------------------------
// Counter persistence (electron-store when available, memory as test fallback)
// ---------------------------------------------------------------------------
let persistentStore: any | null | undefined
const memoryCounters = new Map<string, number>()
/** counters changed in memory but not written to disk yet */
const dirtyCounters = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

const getPersistentStore = (): any | null => {
  if (persistentStore === undefined) {
    if (process.type !== 'renderer') {
      // Outside Electron (unit tests / plain Node): keep counters in memory.
      persistentStore = null
      return persistentStore
    }
    try {
      const Store = require('electron-store')
      persistentStore = new Store()
    } catch (error) {
      // Not running inside Electron (unit tests / plain Node): keep counters in memory.
      persistentStore = null
    }
  }
  return persistentStore
}

/**
 * A burst of publishes (timed messages, multiple variables per message) used to hit the disk
 * with a synchronous read+write of config.json for every single counter: conf re-reads the whole
 * file on each `get`/`set`. Writes are therefore coalesced; reads stay disk-backed so that
 * several windows still share one counter sequence -- only a local write that has not reached
 * the disk yet takes precedence.
 */
const COUNTER_FLUSH_DELAY = 500

const flushPayloadCounters = (): void => {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const store = getPersistentStore()
  if (dirtyCounters.size === 0) {
    return
  }
  if (!store) {
    dirtyCounters.clear()
    return
  }
  const pending = Array.from(dirtyCounters)
  dirtyCounters.clear()
  try {
    pending.forEach((name) => {
      store.set(`${COUNTER_STORE_KEY}.${name}`, memoryCounters.get(name))
    })
  } catch (error) {
    // A failing counter write must never break the publish itself.
  }
}

const scheduleFlush = (): void => {
  if (flushTimer) {
    return
  }
  flushTimer = setTimeout(flushPayloadCounters, COUNTER_FLUSH_DELAY)
  // Never keep the process alive just to persist a counter.
  ;(flushTimer as any)?.unref?.()
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  // Flush whatever is pending when the window closes instead of losing the last increments.
  window.addEventListener('beforeunload', flushPayloadCounters)
  window.addEventListener('pagehide', flushPayloadCounters)
}

export const readPayloadCounter = (name: string): number | undefined => {
  if (dirtyCounters.has(name)) {
    return memoryCounters.get(name)
  }
  const store = getPersistentStore()
  if (store) {
    try {
      const value = store.get(`${COUNTER_STORE_KEY}.${name}`)
      return typeof value === 'number' ? value : undefined
    } catch (error) {
      return undefined
    }
  }
  return memoryCounters.get(name)
}

export const writePayloadCounter = (name: string, value: number): void => {
  memoryCounters.set(name, value)
  const store = getPersistentStore()
  if (!store) {
    return
  }
  dirtyCounters.add(name)
  scheduleFlush()
}

export const resetPayloadCounters = (): void => {
  memoryCounters.clear()
  dirtyCounters.clear()
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const store = getPersistentStore()
  if (store) {
    try {
      store.delete(COUNTER_STORE_KEY)
    } catch (error) {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Placeholder parsing and resolution
// ---------------------------------------------------------------------------
interface Placeholder {
  /** index of "$" */
  start: number
  /** index of "}" */
  end: number
  name: string
  /** the part after ":", e.g. "3" in ${count:3} or "-30..-60" in ${rssi:-30..-60} */
  config?: string
  /** the placeholder body when it is an arithmetic expression, e.g. "ts-34000" */
  expression?: string
}

/**
 * A small arithmetic expression, written inside a placeholder: `${ts-34000}`, `${base * 2}`,
 * `${(count:1 + 1) * 10}` (the counter resolves like any other variable, see below).
 *
 * Grammar, the usual precedence:
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/' | '%') unary)*
 *   unary      := ('+' | '-') unary | primary
 *   primary    := number | identifier ('.' identifier)* | '(' expression ')'
 *
 * It is deliberately not a scripting language: no functions, no assignments, no strings. Every
 * identifier is resolved through the same scopes as a plain `${name}` (built-in, user variable, and
 * the received message for `${msg.x}`), and a value that is not numeric makes the expression
 * unresolved so the payload is never published with a `NaN` in it.
 */
type ExpressionToken =
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; value: string }
  | { kind: 'operator'; value: string }

const EXPRESSION_TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)|([-+*/%()]))/y

/** Cheap gate: a plain variable name never contains one of these, so the token is an expression. */
const containsOperator = (text: string): boolean => /[+\-*/%()]/.test(text)

const tokenizeExpression = (text: string): ExpressionToken[] | undefined => {
  const tokens: ExpressionToken[] = []
  let index = 0
  while (index < text.length) {
    if (text[index] === ' ') {
      index += 1
      continue
    }
    EXPRESSION_TOKEN.lastIndex = index
    const match = EXPRESSION_TOKEN.exec(text)
    if (!match) {
      return undefined
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: 'number', value: Number(match[1]) })
    } else if (match[2] !== undefined) {
      tokens.push({ kind: 'identifier', value: match[2] })
    } else {
      tokens.push({ kind: 'operator', value: match[3] })
    }
    index = EXPRESSION_TOKEN.lastIndex
  }
  return tokens.length ? tokens : undefined
}

/** Rounds away the float noise of e.g. `0.1 + 0.2`, and keeps integers integer. */
const formatExpressionNumber = (value: number): string => {
  if (Number.isInteger(value)) {
    return String(value)
  }
  return String(Number(value.toFixed(6)))
}

interface ExpressionParseResult {
  value?: number
  /** identifiers the expression needed but the scopes could not turn into a number */
  unresolved?: string
}

const evaluateExpression = (text: string, lookup: (name: string) => number | undefined): ExpressionParseResult => {
  const tokens = tokenizeExpression(text)
  if (!tokens) {
    return {}
  }
  let position = 0
  let failure: string | undefined

  const peek = (): ExpressionToken | undefined => tokens[position]
  const eatOperator = (values: string[]): string | undefined => {
    const token = peek()
    if (token && token.kind === 'operator' && values.includes(token.value)) {
      position += 1
      return token.value
    }
    return undefined
  }

  const parsePrimary = (): number | undefined => {
    const token = peek()
    if (!token) {
      return undefined
    }
    if (token.kind === 'number') {
      position += 1
      return token.value
    }
    if (token.kind === 'identifier') {
      position += 1
      const value = lookup(token.value)
      if (value === undefined) {
        failure = failure ?? token.value
      }
      return value
    }
    if (token.value === '(') {
      position += 1
      const value = parseExpression()
      if (eatOperator([')']) === undefined) {
        return undefined
      }
      return value
    }
    return undefined
  }

  const parseUnary = (): number | undefined => {
    const sign = eatOperator(['+', '-'])
    const value = parsePrimary()
    if (value === undefined) {
      return undefined
    }
    return sign === '-' ? -value : value
  }

  const parseTerm = (): number | undefined => {
    let value = parseUnary()
    if (value === undefined) {
      return undefined
    }
    for (;;) {
      const operator = eatOperator(['*', '/', '%'])
      if (!operator) {
        return value
      }
      const right = parseUnary()
      if (right === undefined) {
        return undefined
      }
      if (operator === '*') {
        value *= right
      } else if (operator === '/') {
        if (right === 0) {
          return undefined
        }
        value /= right
      } else {
        if (right === 0) {
          return undefined
        }
        value %= right
      }
    }
  }

  const parseExpression = (): number | undefined => {
    let value = parseTerm()
    if (value === undefined) {
      return undefined
    }
    for (;;) {
      const operator = eatOperator(['+', '-'])
      if (!operator) {
        return value
      }
      const right = parseTerm()
      if (right === undefined) {
        return undefined
      }
      value = operator === '+' ? value + right : value - right
    }
  }

  const value = parseExpression()
  if (value === undefined || position !== tokens.length || !Number.isFinite(value)) {
    return { unresolved: failure }
  }
  return { value }
}

const scanPlaceholders = (payload: string): Placeholder[] => {
  const found: Placeholder[] = []
  let index = 0
  while (index <= payload.length) {
    const start = payload.indexOf(VARIABLE_TOKEN_START, index)
    if (start === -1) {
      break
    }
    const end = payload.indexOf(VARIABLE_TOKEN_END, start + VARIABLE_TOKEN_START.length)
    if (end === -1) {
      break
    }
    const raw = payload.slice(start + VARIABLE_TOKEN_START.length, end)
    const separatorIndex = raw.indexOf(':')
    const head = separatorIndex === -1 ? raw : raw.slice(0, separatorIndex)
    const config = separatorIndex === -1 ? undefined : raw.slice(separatorIndex + 1)
    if (PAYLOAD_VARIABLE_NAME_PATTERN.test(head)) {
      found.push({ start, end, name: head, config: config ? config : undefined })
    } else if (!config && head.trim() && containsOperator(head)) {
      // Not a plain `${name}`: it is either arithmetic or nothing at all (a `${` in ordinary text).
      found.push({ start, end, name: head.trim(), expression: head })
    }
    index = end + VARIABLE_TOKEN_END.length
  }
  return found
}

const parseCounterInit = (config: string): number | undefined => {
  const trimmed = config.trim()
  return /^-?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : undefined
}

const parseRange = (config: string): [number, number] | undefined => {
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

const randomIntInRange = (min: number, max: number, rand: () => number): number =>
  min + Math.floor(rand() * (max - min + 1))

// ---------------------------------------------------------------------------
// Scoped resolution
// ---------------------------------------------------------------------------
export interface PayloadVariableOptions {
  /**
   * User-defined variables, keyed by name. The caller passes the scopes merged from the closest
   * one to the outermost one (message preset → client preset → server preset → global variables),
   * so a name that is defined closer to the message wins.
   */
  variables?: { [name: string]: string }
  now?: Date
  rand?: () => number
  /** Whether the counters used by this text are persisted (default true). */
  commitCounters?: boolean
  /**
   * The message this text answers, when there is one (an automatic reply): its fields are reachable
   * as `msg.<path>`, both as a plain `${msg.ts}` and inside an expression.
   */
  message?: unknown
}

export interface PayloadVariableResult {
  /** the text with every resolvable placeholder replaced; unresolved ones stay verbatim */
  text: string
  /** names that neither a built-in variable, a user variable nor an inline config could resolve */
  unresolved: string[]
}

interface ResolveContext {
  variables: { [name: string]: string }
  message?: unknown
  now: Date
  rand: () => number
  /** resolved value per variable name, so every occurrence of a name stays consistent */
  values: Map<string, string | number>
  /** counters to persist once the text was built: name -> next value */
  usedCounters: Map<string, number>
}

/** How often a variable may reference another variable before it counts as unresolvable. */
const MAX_VARIABLE_DEPTH = 10

function expandText(text: string, context: ResolveContext, stack: string[], unresolved: Set<string>): string {
  const placeholders = scanPlaceholders(text)
  if (!placeholders.length) {
    return text
  }

  let result = ''
  let index = 0
  for (const placeholder of placeholders) {
    const value = resolvePlaceholderValue(placeholder, context, stack, unresolved)
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

/**
 * Evaluates one arithmetic placeholder, e.g. `${ts-34000}` or `${msg.ts - 34000}`.
 *
 * Every identifier goes through the same scopes as a plain `${name}` (built-in, user variable, the
 * fields of the received message), and only a numeric value can take part: a value that is not a
 * number makes the placeholder unresolved, so nothing is ever published as `NaN`.
 */
function resolveExpressionValue(
  placeholder: Placeholder,
  context: ResolveContext,
  unresolved: Set<string>,
): string | number | undefined {
  const expression = placeholder.expression as string
  const cached = context.values.get(expression)
  if (cached !== undefined) {
    return cached
  }
  const result = evaluateExpression(expression, (name) => numericValueOf(name, context))
  if (result.value === undefined) {
    unresolved.add(result.unresolved ?? expression)
    return undefined
  }
  const value = formatExpressionNumber(result.value)
  const numeric = Number(value)
  context.values.set(expression, numeric)
  return numeric
}

/** A name resolved like `${name}`, used by the expression identifiers. */
const scalarValueOf = (
  name: string,
  context: ResolveContext,
  stack: string[],
  unresolved: Set<string>,
): string | number | undefined => resolveBaseValue({ start: 0, end: 0, name }, context, stack, unresolved)

/** The numeric value of one identifier inside an expression, or undefined when it is not a number. */
const numericValueOf = (name: string, context: ResolveContext, depth = 0): number | undefined => {
  if (depth > MAX_VARIABLE_DEPTH) {
    return undefined
  }
  // The received message of an automatic reply: `msg.ts`, `msg.data.id`, ...
  if (name === 'msg' || name.startsWith('msg.')) {
    const path = name === 'msg' ? '' : name.slice('msg.'.length)
    const field = path ? lodashGet(context.message, path) : context.message
    if (typeof field === 'number') {
      return field
    }
    return typeof field === 'string' && /^-?\d+(?:\.\d+)?$/.test(field.trim()) ? Number(field) : undefined
  }
  const value = scalarValueOf(name, context, [], new Set())
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'number') {
    return value
  }
  const text = String(value).trim()
  return /^-?\d+(?:\.\d+)?$/.test(text) ? Number(text) : undefined
}

function resolvePlaceholderValue(
  placeholder: Placeholder,
  context: ResolveContext,
  stack: string[],
  unresolved: Set<string>,
): string | number | undefined {
  if (placeholder.expression !== undefined) {
    return resolveExpressionValue(placeholder, context, unresolved)
  }
  return resolveBaseValue(placeholder, context, stack, unresolved)
}

function resolveBaseValue(
  placeholder: Placeholder,
  context: ResolveContext,
  stack: string[],
  unresolved: Set<string>,
): string | number | undefined {
  const cached = context.values.get(placeholder.name)
  if (cached !== undefined) {
    return cached
  }

  // Built-in names are reserved, so they are checked before any user-defined variable.
  const builtin = PAYLOAD_VARIABLES.find((variable) => variable.name === placeholder.name)
  if (builtin) {
    const value = builtin.value(context.now)
    context.values.set(placeholder.name, value)
    return value
  }

  // A user-defined variable is an explicit value and therefore wins over the inline default of
  // `${name:config}`; an empty value counts as "not defined" and falls through to it.
  const defined = context.variables[placeholder.name]
  if (defined !== undefined && defined.trim() !== '') {
    if (stack.includes(placeholder.name) || stack.length >= MAX_VARIABLE_DEPTH) {
      // Self reference or a reference cycle: report it instead of expanding forever.
      unresolved.add(placeholder.name)
      return undefined
    }
    const value = expandText(defined, context, [...stack, placeholder.name], unresolved)
    context.values.set(placeholder.name, value)
    return value
  }

  if (placeholder.config !== undefined) {
    const range = parseRange(placeholder.config)
    if (range) {
      const value = randomIntInRange(range[0], range[1], context.rand)
      context.values.set(placeholder.name, value)
      return value
    }
    const init = parseCounterInit(placeholder.config)
    if (init !== undefined) {
      const value = readPayloadCounter(placeholder.name) ?? init
      context.usedCounters.set(placeholder.name, value + 1)
      context.values.set(placeholder.name, value)
      return value
    }
  }

  unresolved.add(placeholder.name)
  return undefined
}

/**
 * A resolver bound to one message.
 *
 * A placeholder is resolved by the first of these that matches, which keeps existing payload
 * templates working while letting a user-defined variable take the place of an inline default:
 *
 * 1. built-in variables (`${timestamp}`, `${uuid}`, ...) — their names are reserved
 * 2. `variables[name]` — user-defined variables, the closest scope wins
 * 3. the inline config, i.e. `${count:3}` (counter) or `${rssi:-30..-60}` (random range)
 *
 * A variable value may contain placeholders itself (e.g. `requestNo = ${count:1000}`); they are
 * expanded recursively, up to `MAX_VARIABLE_DEPTH` levels, and a value that references itself is
 * reported instead of being expanded forever.
 *
 * Unresolved placeholders are copied over verbatim, so the caller decides what to do with them:
 * the publish path asks the user before sending them. Their names are listed by `unresolved`.
 */
export interface PayloadVariableResolver {
  /** replaces every resolvable placeholder of one text (a topic or a payload) */
  resolve: (text: string) => string
  /** names that neither a built-in variable, a user variable nor an inline config could resolve */
  readonly unresolved: string[]
  /** persists the counters this resolver used; does nothing when `commitCounters` is false */
  commit: () => void
}

/**
 * Creates the resolver of one message.
 *
 * Sharing it between the topic and the payload keeps the whole message consistent: the same
 * variable gets the same value in both, and a counter used in both (`${count:1}` in the topic and
 * in the payload) advances exactly once. The counters are only persisted on `commit()`, so a
 * caller that resolves once to check for unresolved names and then again for the message it
 * really sends does not advance them twice.
 */
export const createPayloadVariableResolver = (options: PayloadVariableOptions = {}): PayloadVariableResolver => {
  const context: ResolveContext = {
    variables: options.variables ?? {},
    message: options.message,
    now: options.now ?? new Date(),
    rand: options.rand ?? Math.random,
    values: new Map(),
    usedCounters: new Map(),
  }
  const unresolved = new Set<string>()
  return {
    resolve: (text: string) => expandText(text, context, [], unresolved),
    get unresolved(): string[] {
      return Array.from(unresolved)
    },
    commit: () => {
      if (options.commitCounters === false) {
        return
      }
      // Commit the counter increments only once the texts were built successfully.
      context.usedCounters.forEach((value, name) => writePayloadCounter(name, value))
      context.usedCounters.clear()
    },
  }
}

/** Resolves a single text with a resolver of its own, see `createPayloadVariableResolver`. */
export const resolvePayloadVariables = (text: string, options: PayloadVariableOptions = {}): PayloadVariableResult => {
  if (!text || !text.includes(VARIABLE_TOKEN_START)) {
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
 * All variables of one payload share the same `now`, and a counter that appears several times
 * in one message is incremented only once per send, so every occurrence stays consistent.
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
 * The values a connection exposes to its own messages: `${clientId}`, `${username}`, `${name}`,
 * `${host}` and `${port}`.
 *
 * A device usually shows up in its topic, so a template like `sensor/${clientId}/data` serves
 * every connection without editing the message. These values are derived from the connection
 * itself, so a variable the user defined (client or global) still wins over them.
 *
 * The password is deliberately not exposed: the value of a variable ends up in a published
 * message, and therefore on the broker and in the receiver's logs.
 */
export const connectionFieldVariables = (
  connection: Partial<Pick<ConnectionModel, 'clientId' | 'username' | 'name' | 'host' | 'port'>> | null | undefined,
): { [name: string]: string } => {
  const fields: { [name: string]: string } = {}
  if (!connection) {
    return fields
  }
  const add = (name: string, value: string | number | null | undefined) => {
    if (value === undefined || value === null) {
      return
    }
    const text = String(value)
    // An empty field (a connection without a username) stays undefined instead of resolving to ""
    if (text.trim() === '') {
      return
    }
    fields[name] = text
  }
  add('clientId', connection.clientId)
  add('username', connection.username)
  add('name', connection.name)
  add('host', connection.host)
  add('port', connection.port)
  return fields
}

/**
 * Merges variable scopes into the map a resolver consumes, the closest scope first/**
 * Merges variable scopes into the map a resolver consumes, the closest scope first: the client
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
 * Names of the placeholders that the given texts cannot resolve, in order of first appearance.
 *
 * The publish paths use it as a gate before they resolve for real: a probe must not advance
 * counters, and an unresolved `${name}` has to be reported instead of being published as it is.
 */
export const collectUnresolvedVariables = (
  variables: { [name: string]: string },
  texts: Array<string | undefined | null>,
): string[] => {
  const resolver = createPayloadVariableResolver({ variables, commitCounters: false })
  texts.forEach((text) => {
    if (text) {
      resolver.resolve(text)
    }
  })
  return resolver.unresolved
}

export default applyPayloadVariables
