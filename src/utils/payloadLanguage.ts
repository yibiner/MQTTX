import { jsonParse } from './jsonUtils'

/**
 * Whether a payload should be highlighted as JSON.
 *
 * Only objects and arrays count: `123` or `"abc"` are valid JSON as well, but in a message preset
 * they read as plain text and the JSON mode would only decorate them with noise. A payload that
 * still holds unresolved variables outside of a string (`${count}` without quotes) is not JSON yet,
 * so it falls back to plain text as well.
 */
export default (payload: string): boolean => {
  const trimmed = payload.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false
  }
  try {
    const parsed = jsonParse(trimmed)
    return typeof parsed === 'object' && parsed !== null
  } catch (error) {
    return false
  }
}
