/**
 * Display filter for the connection message list.
 *
 * Keywords are matched against the topic and the payload. Nothing is filtered until the user enters
 * a keyword and confirms it. Stored history uses the same rule, so a page is not filled with rows
 * the list will not draw. Sending is unchanged. Rows the local agent published follow this filter
 * on screen; the agent's own reads do not use it.
 */

export type MessageKeywordMode = 'hide' | 'show'

export interface MessageKeywordQuery {
  keywords?: string
  mode?: MessageKeywordMode
}

export const DEFAULT_MESSAGE_KEYWORDS = ''
export const MESSAGE_KEYWORD_STORAGE_KEY = 'messageKeywordFilter'
export const MESSAGE_KEYWORD_MODE_STORAGE_KEY = 'messageKeywordMode'

export const parseMessageKeywords = (text: string | null | undefined): string[] => {
  if (!text) {
    return []
  }
  const seen = new Set<string>()
  const keywords: string[] = []
  text.split(/[\s,，]+/).forEach((part) => {
    const word = part.trim()
    if (!word) {
      return
    }
    const key = word.toLowerCase()
    if (seen.has(key)) {
      return
    }
    seen.add(key)
    keywords.push(word)
  })
  return keywords
}

const includesKeyword = (value: string, keyword: string): boolean => value.toLowerCase().includes(keyword.toLowerCase())

/** True when the topic or the payload contains any keyword. */
export const messageMatchesKeyword = (
  message: { topic?: string; payload?: string },
  keywords: string[],
): boolean => {
  if (!keywords.length) {
    return false
  }
  const topic = message.topic ?? ''
  const payload = message.payload ?? ''
  return keywords.some((keyword) => includesKeyword(topic, keyword) || includesKeyword(payload, keyword))
}

/**
 * Whether this row stays on screen.
 *
 * An empty keyword list shows every message. `hide` drops matches; `show` keeps only matches.
 */
export const passesMessageKeywordFilter = (
  message: { topic?: string; payload?: string },
  keywordsText: string | null | undefined,
  mode: MessageKeywordMode,
): boolean => {
  const keywords = parseMessageKeywords(keywordsText)
  if (!keywords.length) {
    return true
  }
  const matched = messageMatchesKeyword(message, keywords)
  return mode === 'show' ? matched : !matched
}

/** LIKE metacharacters are matched literally, so a keyword of `100%` does not mean "100" plus anything. */
const escapeLike = (word: string): string => word.replace(/[\\%_]/g, (char) => `\\${char}`)

/**
 * SQLite predicate with the same meaning as `passesMessageKeywordFilter`.
 *
 * The local agent's read path does not use this predicate. A row the agent published is filtered
 * here the same way as any other row.
 */
export const messageKeywordSql = (
  filter: MessageKeywordQuery | null | undefined,
): { sql: string; params: Record<string, string> } | undefined => {
  const keywords = parseMessageKeywords(filter?.keywords)
  if (!keywords.length) {
    return undefined
  }
  const params: Record<string, string> = {}
  const parts = keywords.map((word, index) => {
    const key = `messageKeyword${index}`
    params[key] = `%${escapeLike(word)}%`
    return `(msg.topic LIKE :${key} ESCAPE '\\' OR msg.payload LIKE :${key} ESCAPE '\\')`
  })
  const matched = parts.join(' OR ')
  const body = filter?.mode === 'show' ? `(${matched})` : `NOT (${matched})`
  return { sql: body, params }
}

export const readStoredMessageKeywords = (): string => {
  const stored = localStorage.getItem(MESSAGE_KEYWORD_STORAGE_KEY)
  return stored === null ? DEFAULT_MESSAGE_KEYWORDS : stored
}

export const readStoredMessageKeywordMode = (): MessageKeywordMode =>
  localStorage.getItem(MESSAGE_KEYWORD_MODE_STORAGE_KEY) === 'show' ? 'show' : 'hide'
