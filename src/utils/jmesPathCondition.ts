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
  let json = ''
  let index = 0
  let inString = false
  while (index < text.length) {
    const char = text[index]
    if (inString) {
      json += char
      if (char === '\\') {
        json += text[index + 1] ?? ''
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
      json += char
      index += 1
      continue
    }
    if (char === '-' || (char >= '0' && char <= '9')) {
      const literal = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index))
      if (literal) {
        const token = literal[0]
        // Only integer literals are rewritten: `1.5` and `1e3` are still numbers.
        const isInteger = /^-?\d+$/.test(token)
        if (isInteger && !Number.isSafeInteger(Number(token))) {
          json += `"${token}"`
        } else {
          json += token
        }
        index += token.length
        continue
      }
    }
    json += char
    index += 1
  }
  return JSON.parse(json)
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
    const literal = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/.exec(text.slice(index))
    if (literal) {
      tokens.push(literal[0])
      index += literal[0].length
      continue
    }
    // Not JSON after all: give the caller the original text.
    return text
  }

  let depth = 0
  let out = ''
  tokens.forEach((token, position) => {
    if (token === '{' || token === '[') {
      out += token
      depth += 1
      out += '\n' + '  '.repeat(depth)
      return
    }
    if (token === '}' || token === ']') {
      depth = Math.max(0, depth - 1)
      out = out.replace(/\s+$/, '')
      // An empty object/array stays on one line.
      if (out.endsWith('{') || out.endsWith('[')) {
        out += token
      } else {
        out += '\n' + '  '.repeat(depth) + token
      }
      return
    }
    if (token === ',') {
      out += ',\n' + '  '.repeat(depth)
      return
    }
    if (token === ':') {
      out += ': '
      return
    }
    out += token
    if (tokens[position + 1] === '{' || tokens[position + 1] === '[') {
      // keep the bracket handling above to add the newline
    }
  })
  return out
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
