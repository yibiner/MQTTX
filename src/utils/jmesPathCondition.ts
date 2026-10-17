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
export const parseJsonPayload = (payload: string | Buffer | undefined | null): { value?: any; error?: string } => {
  if (payload === undefined || payload === null) {
    return { error: 'empty payload' }
  }
  const text = typeof payload === 'string' ? payload : payload.toString()
  if (!text.trim()) {
    return { error: 'empty payload' }
  }
  try {
    return { value: JSON.parse(text) }
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
