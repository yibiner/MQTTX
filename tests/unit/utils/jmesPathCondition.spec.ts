import { expect } from 'chai'
import {
  evaluatePayloadCondition,
  formatJsonText,
  isValidCondition,
  parseJsonKeepingBigIntegers,
  parseJsonPayload,
} from '@/utils/jmesPathCondition'

describe('jmesPathCondition utility', () => {
  it('matches a field equality', () => {
    const data = { cmd: 'WIFI_RECONNECT_SERVICE', ts: 1654766480047 }
    expect(evaluatePayloadCondition("cmd == 'WIFI_RECONNECT_SERVICE'", data).matched).to.equal(true)
    expect(evaluatePayloadCondition("cmd == 'OTHER'", data).matched).to.equal(false)
  })

  it('treats a missing field as no match', () => {
    expect(evaluatePayloadCondition('cmd', {}).matched).to.equal(false)
    expect(evaluatePayloadCondition('cmd', { cmd: null }).matched).to.equal(false)
    expect(evaluatePayloadCondition('cmd', { cmd: 'x' }).matched).to.equal(true)
  })

  it('supports numbers, and/or and nested fields', () => {
    const data = { code: 0, data: { status: 'ok' }, list: [1] }
    expect(evaluatePayloadCondition('data.status == `ok` && code == `0`', data).matched).to.equal(true)
    expect(evaluatePayloadCondition('code == `1` || data.status == `ok`', data).matched).to.equal(true)
    expect(evaluatePayloadCondition('length(list) > `0`', data).matched).to.equal(true)
  })

  it('matches everything for an empty condition', () => {
    expect(evaluatePayloadCondition('', { a: 1 }).matched).to.equal(true)
    expect(evaluatePayloadCondition(null, { a: 1 }).matched).to.equal(true)
  })

  it('reports a syntax error instead of throwing', () => {
    const result = evaluatePayloadCondition('cmd ==', { cmd: 'x' })
    expect(result.matched).to.equal(false)
    expect(result.error).to.be.a('string')
  })

  it('validates expressions for the editor', () => {
    expect(isValidCondition("cmd == 'x'")).to.equal(true)
    expect(isValidCondition('')).to.equal(true)
    expect(isValidCondition('cmd ==')).to.equal(false)
  })

  it('parses a JSON payload and reports invalid ones', () => {
    expect(parseJsonPayload('{"a":1}').value).to.deep.equal({ a: 1 })
    expect(parseJsonPayload('not json').error).to.be.a('string')
    expect(parseJsonPayload('').error).to.be.a('string')
    expect(parseJsonPayload(Buffer.from('{"a":2}')).value).to.deep.equal({ a: 2 })
  })
})

/**
 * A device `msgId` is a 64-bit integer: `JSON.parse` rounds it to the nearest double, and a reply that
 * echoed the field used to send the rounded number back (…115 became …222000).
 */
describe('parseJsonPayload big integers', () => {
  it('keeps an integer beyond 2^53 as its exact digits', () => {
    const text = '{"msgId":16541683218561123115}'
    expect(parseJsonPayload(text).value).to.deep.equal({ msgId: '16541683218561123115' })
    expect(parseJsonKeepingBigIntegers(text).msgId).to.equal('16541683218561123115')
  })

  it('leaves ordinary numbers as numbers', () => {
    const value = parseJsonPayload('{"ts":1792486795034,"timezone":8,"ratio":1.5,"code":0}').value
    expect(value).to.deep.equal({ ts: 1792486795034, timezone: 8, ratio: 1.5, code: 0 })
  })

  it('does not touch digits inside strings, and survives escapes', () => {
    const value = parseJsonPayload('{"note":"16541683218561123115 \\"x\\"","msgId":16541683218561123115}').value
    expect(value.note).to.equal('16541683218561123115 "x"')
    expect(value.msgId).to.equal('16541683218561123115')
  })

  it('reports invalid JSON instead of throwing', () => {
    expect(parseJsonPayload('{oops}').error).to.be.a('string')
  })
})

describe('formatJsonText', () => {
  it('indents JSON without rounding big integers', () => {
    const formatted = formatJsonText('{"cmd":"NTP","ts":1792486795034,"msgId":16541683218561123115}')
    expect(formatted).to.contain('"msgId": 16541683218561123115')
    expect(formatted).to.not.contain('16541683218561122000')
    // `{`, three entries and `}`
    expect(formatted.split('\n')).to.have.lengthOf(5)
  })

  it('handles nested objects, arrays and empty containers', () => {
    const formatted = formatJsonText('{"a":[1,2],"b":{"c":"x"},"e":{},"f":[]}')
    expect(formatted).to.contain('"a": [')
    expect(formatted).to.contain('"e": {}')
    expect(formatted).to.contain('"f": []')
    expect(formatJsonText('{"a":1}').split('\n')).to.have.lengthOf(3)
  })

  it('returns text that is not JSON untouched', () => {
    expect(formatJsonText('not json at all')).to.equal('not json at all')
  })
})

describe('parseJsonKeepingBigIntegers precision guard', () => {
  it('parses a payload without unsafe integers exactly like JSON.parse', () => {
    const text = '{"cmd":"NTP_SYNC","ts":1792486795034,"list":[1,2.5,-3],"ok":true,"none":null}'
    expect(parseJsonKeepingBigIntegers(text)).to.deep.equal(JSON.parse(text))
  })

  it('does not rewrite digits that only appear inside a string', () => {
    // The 20 digits are preceded by the opening quote of the string, so nothing can lose precision.
    const value = parseJsonKeepingBigIntegers('{"id":"16541683218561123115","n":1}')
    expect(value.id).to.equal('16541683218561123115')
    expect(value.n).to.equal(1)
  })

  it('keeps every position of an unsafe integer, not just an object value', () => {
    expect(parseJsonKeepingBigIntegers('16541683218561123115')).to.equal('16541683218561123115')
    expect(parseJsonKeepingBigIntegers('[1, 16541683218561123115]')).to.deep.equal([1, '16541683218561123115'])
    expect(parseJsonKeepingBigIntegers('{"n": -16541683218561123115}')).to.deep.equal({ n: '-16541683218561123115' })
  })

  it('keeps a long number-heavy payload linear', () => {
    // The scanner used to re-slice the rest of the text per number, which is quadratic: at this size
    // the old implementation needed seconds, the linear one a few milliseconds. The bound is generous
    // on purpose, so the assertion measures the complexity and not the machine.
    const numbers = Array.from({ length: 3000 }, (_value, index) => 1234567 + index)
    const text = JSON.stringify({ numbers })
    const started = Date.now()
    const value = parseJsonKeepingBigIntegers(text)
    const elapsed = Date.now() - started
    expect(value.numbers).to.deep.equal(numbers)
    expect(elapsed).to.be.lessThan(500)
  })
})
