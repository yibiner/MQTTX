import { expect } from 'chai'
import {
  DEFAULT_MESSAGE_KEYWORDS,
  MESSAGE_KEYWORD_MODE_STORAGE_KEY,
  MESSAGE_KEYWORD_STORAGE_KEY,
  messageKeywordSql,
  parseMessageKeywords,
  passesMessageKeywordFilter,
  readStoredMessageKeywordMode,
  readStoredMessageKeywords,
} from '@/utils/messageKeywordFilter'

const heartbeat = {
  topic: 'app/SN0106/device/heart/post',
  payload: '{"cmd":"HEARTBEAT","count":1}',
}
const command = {
  topic: 'app/SN0106/device/system/post',
  payload: '{"cmd":"SET","enabled":true}',
}

describe('messageKeywordFilter', () => {
  const memory = new Map<string, string>()

  before(() => {
    ;(global as unknown as { localStorage: Storage }).localStorage = {
      getItem: (key: string) => (memory.has(key) ? memory.get(key)! : null),
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
      removeItem: (key: string) => {
        memory.delete(key)
      },
      clear: () => memory.clear(),
      key: () => null,
      length: 0,
    } as Storage
  })

  afterEach(() => {
    memory.clear()
  })

  it('splits on commas and spaces and keeps one copy of a repeated word', () => {
    expect(parseMessageKeywords(' HEARTBEAT, PING  heartbeat，NTP ')).to.deep.equal(['HEARTBEAT', 'PING', 'NTP'])
    expect(parseMessageKeywords('')).to.deep.equal([])
  })

  it('hides a matching payload and keeps the other rows', () => {
    expect(passesMessageKeywordFilter(heartbeat, 'HEARTBEAT', 'hide')).to.equal(false)
    expect(passesMessageKeywordFilter(command, 'HEARTBEAT', 'hide')).to.equal(true)
    expect(passesMessageKeywordFilter({ topic: 'app/x', payload: '{"cmd":"heartbeat"}' }, 'HEARTBEAT', 'hide')).to.equal(
      false,
    )
  })

  it('shows only matches when that mode is selected, and an empty list shows everything', () => {
    expect(passesMessageKeywordFilter(heartbeat, 'HEARTBEAT', 'show')).to.equal(true)
    expect(passesMessageKeywordFilter(command, 'HEARTBEAT', 'show')).to.equal(false)
    expect(passesMessageKeywordFilter(heartbeat, '   ', 'hide')).to.equal(true)
  })

  it('matches a keyword in the topic as well as the payload', () => {
    expect(passesMessageKeywordFilter({ topic: 'app/SN0106/device/heart/post', payload: '{}' }, 'heart/post', 'hide')).to.equal(
      false,
    )
  })

  it('builds a SQL predicate that treats % and _ as literal characters', () => {
    const clause = messageKeywordSql({ keywords: '100%, A_B', mode: 'hide' })
    expect(clause?.sql).to.contain("ESCAPE '\\'")
    expect(clause?.sql).to.contain('NOT (')
    expect(clause?.params.messageKeyword0).to.equal('%100\\%%')
    expect(clause?.params.messageKeyword1).to.equal('%A\\_B%')
    expect(messageKeywordSql({ keywords: '  ', mode: 'hide' })).to.equal(undefined)
    const show = messageKeywordSql({ keywords: 'HEARTBEAT', mode: 'show' })
    expect(show?.sql).to.not.contain('NOT (')
    expect(show?.sql).to.not.contain('agent')
  })

  it('filters nothing until the user stores a keyword, and keeps an empty list', () => {
    expect(readStoredMessageKeywords()).to.equal(DEFAULT_MESSAGE_KEYWORDS)
    expect(DEFAULT_MESSAGE_KEYWORDS).to.equal('')
    expect(readStoredMessageKeywordMode()).to.equal('hide')
    localStorage.setItem(MESSAGE_KEYWORD_STORAGE_KEY, '')
    localStorage.setItem(MESSAGE_KEYWORD_MODE_STORAGE_KEY, 'show')
    expect(readStoredMessageKeywords()).to.equal('')
    expect(readStoredMessageKeywordMode()).to.equal('show')
  })
})
