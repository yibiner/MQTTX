import jmespath from 'jmespath'

/**
 * JMESPath conditions of the automatic reply rules.
 *
 * The expression is evaluated against the received payload parsed as JSON, so a rule reads like
 * `cmd == 'WIFI_RECONNECT_SERVICE'` or `startsWith(msg, 'WIFI_') && code == \`0\``.
 *
 * The result is converted with the JMESPath `to_boolean` semantics: `null`, `false`, `''`, `[]` and
 * `{}` are false, everything else is true. A missing field therefore never matches, and an
 * expression that yields a value (`cmd`) still means "the field exists and is truthy".
 */
export interface ConditionResult {
  matched: boolean
  /** Why the condition could not be evaluated, e.g. a syntax error in the expression. */
  error?: string
}

/** Number and keyword literals of the two scanners below, matched in place with a sticky regex. */
const NUMBER_LITERAL = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const JSON_TOKEN_LITERAL = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/y
const INTEGER_LITERAL = /^-?\d+$/
/** A number literal that `Number` cannot hold exactly: 16 digits or more, after `:`/`,`/`[`/start. */
const UNSAFE_INTEGER_LITERAL = /(?:^|[:,[])\s*-?\d{16,}/

/** Parses a payload as JSON without throwing; `error` is undefined when it parsed. */
/**
 * Parses JSON while keeping integers that `JSON.parse` cannot represent exactly.
 *
 * A device `msgId` is typically a 64-bit integer (20 digits), far beyond 2^53 - 1: `JSON.parse` turns
 * it into the nearest double, and a reply that echoes the field would send the rounded value back
 * (16541683218561123115 became 16541683218561122000). Such a literal is kept as its exact digits in a
 * string, so `${msg.msgId}` renders what the device sent. Numbers that fit in a double are untouched.
 */
export const parseJsonKeepingBigIntegers = (text: string): any => {
  // Fast path: an integer only loses precision above 2^53-1, i.e. from 16 digits on, and a number
  // literal can only start after `:`, `,`, `[` or at the very beginning of the text (an occurrence
  // inside a string literal is preceded by its opening quote). Without such a literal the text can
  // go to the native parser, which is both exact and several times faster than the scan below.
  if (!UNSAFE_INTEGER_LITERAL.test(text)) {
    return JSON.parse(text)
  }
  // Slices of the original text, joined once. One string per character would retain a second copy
  // of a large payload; appending with `+=` copied the whole text on every character.
  const parts: string[] = []
  let index = 0
  let plainStart = 0
  let inString = false
  const flushPlain = (end: number) => {
    if (end > plainStart) {
      parts.push(text.slice(plainStart, end))
    }
    plainStart = end
  }
  while (index < text.length) {
    const char = text[index]
    if (inString) {
      if (char === '\\') {
        index += 2
        continue
      }
      if (char === '"') {
        inString = false
      }
      index += 1
      continue
    }
    if (char === '"') {
      inString = true
      index += 1
      continue
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      // Sticky: matching from `index` reads the literal in place. Re-slicing the rest of the text
      // here made a number-heavy payload quadratic (`slice()` copies the tail on every number).
      NUMBER_LITERAL.lastIndex = index
      const literal = NUMBER_LITERAL.exec(text)
      if (literal) {
        const token = literal[0]
        const isInteger = INTEGER_LITERAL.test(token)
        if (isInteger && !Number.isSafeInteger(Number(token))) {
          flushPlain(index)
          parts.push(`"${token}"`)
          index = NUMBER_LITERAL.lastIndex
          plainStart = index
          continue
        }
        index = NUMBER_LITERAL.lastIndex
        continue
      }
    }
    index += 1
  }
  flushPlain(text.length)
  return JSON.parse(parts.join(''))
}

/**
 * Indents a JSON text without parsing it.
 *
 * A debug preview of a reply has to show what is actually sent. Going through `JSON.parse` would round
 * the 64-bit integers again (`16541683218561123115` -> `16541683218561122000`), so the text is only
 * re-laid out: strings, numbers and everything else keep their exact literal. Invalid JSON is returned
 * untouched instead of being mangled.
 */
export const formatJsonText = (text: string): string => {
  const tokens: string[] = []
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      index += 1
      continue
    }
    if (char === '"') {
      let end = index + 1
      while (end < text.length) {
        if (text[end] === '\\') {
          end += 2
          continue
        }
        if (text[end] === '"') {
          end += 1
          break
        }
        end += 1
      }
      tokens.push(text.slice(index, end))
      index = end
      continue
    }
    if (char === '{' || char === '}' || char === '[' || char === ']' || char === ',' || char === ':') {
      tokens.push(char)
      index += 1
      continue
    }
    // Sticky, like the number scan above: formatting must not copy the tail of the text per token.
    JSON_TOKEN_LITERAL.lastIndex = index
    const literal = JSON_TOKEN_LITERAL.exec(text)
    if (literal) {
      tokens.push(literal[0])
      index = JSON_TOKEN_LITERAL.lastIndex
      continue
    }
    // Not JSON after all: give the caller the original text.
    return text
  }

  // Built in pieces. Trimming the whole string with a regex on every closing bracket copied the
  // text so far, which froze the preview of a large payload.
  const parts: string[] = []
  let depth = 0
  const trimTrailingWhitespace = () => {
    while (parts.length) {
      const last = parts[parts.length - 1]
      const trimmed = last.replace(/\s+$/, '')
      if (trimmed === last) {
        return
      }
      if (!trimmed) {
        parts.pop()
        continue
      }
      parts[parts.length - 1] = trimmed
      return
    }
  }
  const endsWith = (suffix: string): boolean => {
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]
      if (!part) {
        continue
      }
      return part.endsWith(suffix)
    }
    return false
  }
  tokens.forEach((token) => {
    if (token === '{' || token === '[') {
      parts.push(token)
      depth += 1
      parts.push('\n' + '  '.repeat(depth))
      return
    }
    if (token === '}' || token === ']') {
      depth = Math.max(0, depth - 1)
      trimTrailingWhitespace()
      // An empty object/array stays on one line.
      if (endsWith('{') || endsWith('[')) {
        parts.push(token)
      } else {
        parts.push('\n' + '  '.repeat(depth) + token)
      }
      return
    }
    if (token === ',') {
      parts.push(',\n' + '  '.repeat(depth))
      return
    }
    if (token === ':') {
      parts.push(': ')
      return
    }
    parts.push(token)
  })
  return parts.join('')
}

export const parseJsonPayload = (payload: string | Buffer | undefined | null): { value?: any; error?: string } => {
  if (payload === undefined || payload === null) {
    return { error: 'empty payload' }
  }
  const text = typeof payload === 'string' ? payload : payload.toString()
  if (!text.trim()) {
    return { error: 'empty payload' }
  }
  try {
    return { value: parseJsonKeepingBigIntegers(text) }
  } catch (error) {
    return { error: (error as Error).toString() }
  }
}

const toBoolean = (value: any): boolean => {
  if (value === null || value === undefined || value === false || value === '') {
    return false
  }
  if (Array.isArray(value)) {
    return value.length > 0
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0
  }
  return true
}

/**
 * Evaluates a JMESPath condition against an already parsed payload. An empty expression matches
 * everything, which is what a rule without a condition means.
 */
export const evaluatePayloadCondition = (expression: string | null | undefined, data: unknown): ConditionResult => {
  if (!expression || !expression.trim()) {
    return { matched: true }
  }
  try {
    return { matched: toBoolean(jmespath.search(data, expression)) }
  } catch (error) {
    return { matched: false, error: (error as Error).toString() }
  }
}

/** `true` when the expression is syntactically valid JMESPath, used to validate the rule editor. */
export const isValidCondition = (expression: string | null | undefined): boolean => {
  if (!expression || !expression.trim()) {
    return true
  }
  try {
    jmespath.compile(expression)
    return true
  } catch (error) {
    return false
  }
}
