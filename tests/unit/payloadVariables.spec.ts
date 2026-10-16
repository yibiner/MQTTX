import { expect } from 'chai'
import applyPayloadVariables, {
  readPayloadCounter,
  resetPayloadCounters,
  writePayloadCounter,
} from '@/utils/payloadVariables'

// Outside Electron the counters live in memory (see getPersistentStore), which is exactly the
// fallback the debounced disk flush has to preserve.
describe('payloadVariables counters', () => {
  beforeEach(() => {
    resetPayloadCounters()
  })

  after(() => {
    resetPayloadCounters()
  })

  it('increments a counter on every resolved message and keeps the value readable', () => {
    expect(readPayloadCounter('count')).to.equal(undefined)

    expect(applyPayloadVariables('{"seq":${count:1}}')).to.equal('{"seq":1}')
    expect(applyPayloadVariables('{"seq":${count:1}}')).to.equal('{"seq":2}')
    // The stored value is the next one to use, not the last one that was sent.
    expect(readPayloadCounter('count')).to.equal(3)
  })

  it('resumes from a stored counter instead of the initial value', () => {
    writePayloadCounter('count', 41)
    expect(applyPayloadVariables('{"seq":${count:1}}')).to.equal('{"seq":41}')
    expect(readPayloadCounter('count')).to.equal(42)
  })

  it('clears written counters', () => {
    writePayloadCounter('custom', 7)
    expect(readPayloadCounter('custom')).to.equal(7)

    resetPayloadCounters()
    expect(readPayloadCounter('custom')).to.equal(undefined)
  })

  it('leaves unknown or unconfigured variables untouched', () => {
    expect(applyPayloadVariables('${notAVariable}')).to.equal('${notAVariable}')
    // A counter needs an initial value; without one the token stays as written.
    expect(applyPayloadVariables('${count}')).to.equal('${count}')
  })
})
