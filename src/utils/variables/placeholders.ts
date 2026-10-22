/**
 * Placeholder scanning: from a text to the `{ start, end, name, config, expression }` records the
 * resolver works on. Syntax only - which variable a name belongs to is decided by the providers.
 */
import { containsOperator } from './expression'

export const VARIABLE_TOKEN_START = '${'
export const VARIABLE_TOKEN_END = '}'

/**
 * A name the user may define and reference as `${name}` (ASCII identifier). Anchored, so a longer
 * piece of text is never mistaken for a name.
 */
export const PAYLOAD_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * A namespaced identifier a provider may own: `msg.sensor-1`, `msg.data.list[0].id`, `env.HOME`.
 * A dot is required, so a plain definition stays a plain name, and no whitespace is allowed, which
 * keeps `${msg.ts - 34000}` an arithmetic expression rather than a field path with spaces.
 */
const NAMESPACED_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[^\s{}]+)+$/

export interface Placeholder {
  /** index of "$" */
  start: number
  /** index of "}" */
  end: number
  /**
   * The identifier: a plain variable name (`ts`, `count`), a namespaced path (`msg.data.id`) or,
   * for an expression, its trimmed body (`base * 2`).
   */
  name: string
  /** the part after ":", e.g. "3" in ${count:3} or "-30..-60" in ${rssi:-30..-60} */
  config?: string
  /**
   * The arithmetic expression to evaluate when no provider defines `name`. Set for every body that
   * contains an operator, because `${msg.sensor-1}` is a field name while `${ts-34000}` is
   * arithmetic: the provisional name is tried first (see the resolver), this is the fallback.
   */
  expression?: string
}

export const scanPlaceholders = (text: string): Placeholder[] => {
  const found: Placeholder[] = []
  let index = 0
  while (index <= text.length) {
    const start = text.indexOf(VARIABLE_TOKEN_START, index)
    if (start === -1) {
      break
    }
    const end = text.indexOf(VARIABLE_TOKEN_END, start + VARIABLE_TOKEN_START.length)
    if (end === -1) {
      break
    }
    const raw = text.slice(start + VARIABLE_TOKEN_START.length, end)
    const separatorIndex = raw.indexOf(':')
    if (separatorIndex !== -1) {
      // ${name:config} - the config is part of the inline fallback, so the name stays a plain name.
      const name = raw.slice(0, separatorIndex).trim()
      const config = raw.slice(separatorIndex + 1).trim()
      if (PAYLOAD_VARIABLE_NAME_PATTERN.test(name)) {
        found.push({ start, end, name, config: config || undefined })
      }
    } else {
      const body = raw.trim()
      if (PAYLOAD_VARIABLE_NAME_PATTERN.test(body)) {
        found.push({ start, end, name: body })
      } else if (NAMESPACED_NAME_PATTERN.test(body)) {
        // A provider owns it (msg.<path>, env.<name>, ...); a hyphenated path is looked up exactly
        // first, so `${msg.sensor-1}` keeps meaning "the field named sensor-1".
        found.push({ start, end, name: body, expression: containsOperator(body) ? body : undefined })
      } else if (body && containsOperator(body)) {
        found.push({ start, end, name: body, expression: body })
      }
      // Anything else (a `${` in ordinary text, `${name:...}` without a valid name) is not a
      // variable and is left alone.
    }
    index = end + VARIABLE_TOKEN_END.length
  }
  return found
}
