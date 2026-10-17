import { expect } from 'chai'
import { evaluatePayloadCondition, isValidCondition, parseJsonPayload } from '@/utils/jmesPathCondition'

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
