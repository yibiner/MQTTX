export const DEFAULT_MAX_PAYLOAD_DISPLAY_SIZE = 512 * 1024 // 512KB
export const MIN_MAX_PAYLOAD_DISPLAY_SIZE = 16 * 1024 // 16KB
export const MAX_MAX_PAYLOAD_DISPLAY_SIZE = 2 * 1024 * 1024 // 2MB

export const SHOW_MAX_LENGTH = 100

export function normalizeMaxPayloadDisplaySize(value?: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return DEFAULT_MAX_PAYLOAD_DISPLAY_SIZE
  }
  if (value < MIN_MAX_PAYLOAD_DISPLAY_SIZE) {
    return MIN_MAX_PAYLOAD_DISPLAY_SIZE
  }
  if (value > MAX_MAX_PAYLOAD_DISPLAY_SIZE) {
    return MAX_MAX_PAYLOAD_DISPLAY_SIZE
  }
  return value
}

// Local publish history (topic + message pairs) kept on disk.
export const DEFAULT_HISTORY_MAX_COUNT = 20
export const MIN_HISTORY_MAX_COUNT = 1
export const MAX_HISTORY_MAX_COUNT = 200

export function normalizeHistoryMaxCount(value?: number | string | null): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value
  if (parsed === undefined || parsed === null || Number.isNaN(parsed)) {
    return DEFAULT_HISTORY_MAX_COUNT
  }
  if (parsed < MIN_HISTORY_MAX_COUNT) {
    return MIN_HISTORY_MAX_COUNT
  }
  if (parsed > MAX_HISTORY_MAX_COUNT) {
    return MAX_HISTORY_MAX_COUNT
  }
  return Math.floor(parsed)
}

export function isLargeData(message: string, maxPayloadDisplaySize = DEFAULT_MAX_PAYLOAD_DISPLAY_SIZE): boolean {
  return message.length >= maxPayloadDisplaySize
}

/**
 * One-line preview of a message for the lists that show it (message presets, publish history).
 *
 * A message saved from a formatted editor starts with an indentation or a line break while those
 * lists only show the first line of a cell: the row then looks empty and the message appears not
 * to be configured at all. JSON is therefore compacted with JSON.parse/stringify (spaces inside
 * string values are content and are kept), everything else has its line breaks and repeated
 * whitespace collapsed into single spaces.
 *
 * @returns the preview, or an empty string when there is nothing visible to show (empty,
 *          whitespace-only or non-string input), so callers can render their own placeholder.
 */
export function toSingleLinePreview(value?: string | null): string {
  if (typeof value !== 'string') {
    return ''
  }
  const text = value.trim()
  if (!text) {
    return ''
  }
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed !== null && typeof parsed === 'object') {
        return JSON.stringify(parsed)
      }
    } catch (error) {
      // Not valid JSON (unquoted template variables, single quotes, ...): collapse it below.
    }
  }
  return text.replace(/\s+/g, ' ')
}

export function calculateTextSize(text: string, decimals = 2) {
  const blob = new Blob([text], { type: 'text/plain' })
  const bytes = blob.size

  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export default {}
