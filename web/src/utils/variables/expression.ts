/**
 * The small arithmetic language that may be written inside a placeholder.
 *
 * A payload often needs a value relative to another one - "the time 34 seconds ago", "the received
 * offset in seconds" - which is all this engine is for:
 *
 *     ${ts-34000}   ${timestamp+5000}   ${base * 2}   ${(base + 2) * 3}   ${-base + 10}
 *     ${msg.ts - 34000}   ${msg.data.list[0].id * 1}
 *
 * Grammar, the usual precedence:
 *   expression := term (('+' | '-') term)*
 *   term       := unary (('*' | '/' | '%') unary)*
 *   unary      := ('+' | '-') unary | primary
 *   primary    := number | identifier ('.' identifier | '[' digits ']')* | '(' expression ')'
 *
 * It is deliberately not a scripting language: no functions, no assignments, no strings. Every
 * identifier is handed to the caller (`lookup`), which resolves it through the same providers as a
 * plain `${name}`. A value that is not numeric makes the expression unresolved, so a payload is
 * never published with a `NaN` in it.
 *
 * The engine is independent of the variable sources: it only knows identifiers and numbers. That is
 * what makes the arithmetic work for future providers too - a new provider needs no parser change.
 */

type ExpressionToken =
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; value: string }
  | { kind: 'operator'; value: string }

/**
 * One token, at a time (sticky, so the parser can decide where to continue).
 *
 * Numbers first, then identifiers. An identifier may address a nested field (`msg.data.ts`) or an
 * array element (`msg.list[0].id`) - the leading `-` of a subtraction is never part of it, which is
 * why a hyphenated field can only be reached through a plain `${msg.sensor-1}` (see the resolver),
 * not inside an expression.
 */
const EXPRESSION_TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+|\[\d+\])*)|([-+*/%()]))/y

/** A payload template never needs a longer expression; the cap keeps a hostile text from blowing up. */
const MAX_EXPRESSION_TOKENS = 256
/** Parentheses nesting the recursive-descent parser accepts. */
const MAX_EXPRESSION_NESTING = 64

/** Cheap gate: a plain variable name never contains one of these, so the token is an expression. */
export const containsOperator = (text: string): boolean => /[+\-*/%()]/.test(text)

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
    if (tokens.length > MAX_EXPRESSION_TOKENS) {
      // Not a payload expression: report it as unresolved instead of parsing an arbitrarily long
      // text (deeply nested parentheses or a huge chain would otherwise be a stack/CPU hazard).
      return undefined
    }
    index = EXPRESSION_TOKEN.lastIndex
  }
  return tokens.length ? tokens : undefined
}

/** Rounds away the float noise of e.g. `0.1 + 0.2`, and keeps integers integer. */
export const formatExpressionNumber = (value: number): string => {
  if (Number.isInteger(value)) {
    return String(value)
  }
  return String(Number(value.toFixed(6)))
}

export interface ExpressionResult {
  /** the number the expression evaluates to, when it could be evaluated */
  value?: number
  /** the identifier that made it fail (or the whole expression for a syntax error / division by 0) */
  unresolved?: string
}

/**
 * Evaluates one expression. `lookup` turns an identifier into a number, or returns undefined when
 * the identifier cannot be turned into one (unknown name, non-numeric value).
 */
export const evaluateArithmeticExpression = (
  text: string,
  lookup: (identifier: string) => number | undefined,
): ExpressionResult => {
  const tokens = tokenizeExpression(text)
  if (!tokens) {
    return {}
  }
  let position = 0
  let failure: string | undefined
  let nesting = 0

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
      nesting += 1
      if (nesting > MAX_EXPRESSION_NESTING) {
        return undefined
      }
      const value = parseExpression()
      nesting -= 1
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
