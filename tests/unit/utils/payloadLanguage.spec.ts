import { expect } from 'chai'
import isJsonPayload from '@/utils/payloadLanguage'

describe('payloadLanguage', () => {
  it('highlights objects and arrays as JSON', () => {
    expect(isJsonPayload('{"temperature": 26.5}')).to.equal(true)
    expect(isJsonPayload('[\n  1,\n  2\n]')).to.equal(true)
    expect(isJsonPayload('  {"a": {"b": "${count:1}"}}  ')).to.equal(true)
  })

  it('leaves plain text alone', () => {
    expect(isJsonPayload('hello world')).to.equal(false)
    expect(isJsonPayload('app/ACME901/device/system/post')).to.equal(false)
    expect(isJsonPayload('')).to.equal(false)
  })

  it('does not treat a bare number or string as JSON', () => {
    expect(isJsonPayload('123')).to.equal(false)
    expect(isJsonPayload('"abc"')).to.equal(false)
  })

  it('falls back to plain text for broken JSON', () => {
    expect(isJsonPayload('{"temperature": }')).to.equal(false)
    expect(isJsonPayload('{"unresolved": ${count}}')).to.equal(false)
  })
})
