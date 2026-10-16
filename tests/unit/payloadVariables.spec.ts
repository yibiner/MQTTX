import { expect } from 'chai'
import applyPayloadVariables, {
  collectUnresolvedVariables,
  createPayloadVariableResolver,
  readPayloadCounter,
  resetPayloadCounters,
  resolvePayloadVariables,
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

describe('payloadVariables scopes', () => {
  beforeEach(() => {
    resetPayloadCounters()
  })

  after(() => {
    resetPayloadCounters()
  })

  it('resolves a user-defined variable in a payload and in a topic', () => {
    const variables = { sn: 'SN04010302CA26BEEF', prefix: 'app' }

    expect(resolvePayloadVariables('${prefix}/${sn}/device/heart/post', { variables })).to.deep.equal({
      text: 'app/SN04010302CA26BEEF/device/heart/post',
      unresolved: [],
    })
    expect(resolvePayloadVariables('{"cmd":"HEARTBEAT","sn":"${sn}"}', { variables }).text).to.equal(
      '{"cmd":"HEARTBEAT","sn":"SN04010302CA26BEEF"}',
    )
  })

  it('lets a user-defined variable win over the inline counter and range config', () => {
    const variables = { count: '100', rssi: '-45' }
    const payload = '{"seq":${count:1},"rssi":${rssi:-30..-60}}'

    expect(resolvePayloadVariables(payload, { variables }).text).to.equal('{"seq":100,"rssi":-45}')
    // The counter of an overridden name is not advanced either.
    expect(readPayloadCounter('count')).to.equal(undefined)
  })

  it('keeps the inline config for names that are not defined anywhere', () => {
    expect(resolvePayloadVariables('${count:1}', { variables: { other: 'x' } }).text).to.equal('1')
    expect(readPayloadCounter('count')).to.equal(2)
    expect(resolvePayloadVariables('${rssi:-5..-5}', { variables: {} }).text).to.equal('-5')
  })

  it('keeps the built-in names reserved so they cannot be shadowed', () => {
    const result = resolvePayloadVariables('{"ts":${timestamp}}', {
      variables: { timestamp: 'nope' },
      now: new Date(1791979522744),
    })

    expect(result.text).to.equal('{"ts":1791979522744}')
    expect(result.unresolved).to.deep.equal([])
  })

  it('reports the placeholders that nothing could resolve', () => {
    const result = resolvePayloadVariables('{"a":"${sn}","b":"${missing}"}', { variables: { sn: '1' } })

    expect(result.text).to.equal('{"a":"1","b":"${missing}"}')
    expect(result.unresolved).to.deep.equal(['missing'])
  })

  it('treats an empty variable value as undefined', () => {
    const result = resolvePayloadVariables('${blank}', { variables: { blank: '   ' } })

    expect(result.text).to.equal('${blank}')
    expect(result.unresolved).to.deep.equal(['blank'])
  })

  it('expands a variable whose value references other placeholders', () => {
    const variables = { device: 'PLC-${line}-${count:1000}', line: 'A' }
    const result = resolvePayloadVariables('${device}', { variables })

    expect(result.text).to.equal('PLC-A-1000')
    expect(readPayloadCounter('device')).to.equal(undefined)
    expect(readPayloadCounter('count')).to.equal(1001)
  })

  it('reports a reference cycle instead of expanding it forever', () => {
    const result = resolvePayloadVariables('${a}', { variables: { a: '${b}', b: '${a}' } })

    expect(result.text).to.equal('${a}')
    expect(result.unresolved).to.deep.equal(['a'])
  })

  it('reports a self reference', () => {
    const result = resolvePayloadVariables('${self}', { variables: { self: 'x-${self}' } })

    expect(result.unresolved).to.deep.equal(['self'])
  })

  it('does not persist a counter when the caller only probes the text', () => {
    const probe = resolvePayloadVariables('${count:5}', { commitCounters: false })
    expect(probe.text).to.equal('5')
    expect(readPayloadCounter('count')).to.equal(undefined)

    expect(resolvePayloadVariables('${count:5}').text).to.equal('5')
    expect(readPayloadCounter('count')).to.equal(6)
  })

  it('increments a counter only once per message even when a variable uses it', () => {
    const variables = { seq: '${count:7}' }
    const result = resolvePayloadVariables('{"a":${seq},"b":${seq},"name":"${seq}"}', { variables })

    expect(result.text).to.equal('{"a":7,"b":7,"name":"7"}')
    expect(readPayloadCounter('count')).to.equal(8)
  })
})

describe('payloadVariables probe', () => {
  beforeEach(() => {
    resetPayloadCounters()
  })

  after(() => {
    resetPayloadCounters()
  })

  it('collects the unresolved names of a topic and a payload', () => {
    const variables = { sn: 'SN0400' }
    const names = collectUnresolvedVariables(variables, [
      '${prefix}/${sn}/post',
      '{"sn":"${sn}","member":"${memberId}","more":"${missing}"}',
    ])

    expect(names).to.deep.equal(['prefix', 'memberId', 'missing'])
  })

  it('does not advance a counter while probing', () => {
    expect(collectUnresolvedVariables({}, ['{"seq":${count:1}}'])).to.deep.equal([])
    expect(readPayloadCounter('count')).to.equal(undefined)
  })

  it('ignores the empty texts of a message without a payload', () => {
    expect(collectUnresolvedVariables({}, [undefined, null, ''])).to.deep.equal([])
  })
})

describe('payloadVariables resolver of one message', () => {
  beforeEach(() => {
    resetPayloadCounters()
  })

  after(() => {
    resetPayloadCounters()
  })

  it('advances a counter used in the topic and in the payload only once', () => {
    const resolver = createPayloadVariableResolver({ variables: { sn: 'SN0400' } })

    expect(resolver.resolve('app/${sn}/${count:9}/post')).to.equal('app/SN0400/9/post')
    expect(resolver.resolve('{"sn":"${sn}","seq":${count:9}}')).to.equal('{"sn":"SN0400","seq":9}')
    expect(resolver.unresolved).to.deep.equal([])
    resolver.commit()
    expect(readPayloadCounter('count')).to.equal(10)
  })

  it('draws one random value per message', () => {
    const rand = (): number => 0.5
    const resolver = createPayloadVariableResolver({ rand })

    expect(resolver.resolve('${rssi:-30..-60}/${rssi:-30..-60}')).to.equal('-45/-45')
    resolver.commit()
  })

  it('persists a counter on commit only', () => {
    const resolver = createPayloadVariableResolver()
    expect(resolver.resolve('${count:1}')).to.equal('1')
    expect(readPayloadCounter('count')).to.equal(undefined)

    resolver.commit()
    expect(readPayloadCounter('count')).to.equal(2)
  })

  it('collects the unresolved names of every text it resolved', () => {
    const resolver = createPayloadVariableResolver({ variables: { sn: '1' }, commitCounters: false })

    expect(resolver.resolve('${sn}/${prefix}/post')).to.equal('1/${prefix}/post')
    expect(resolver.resolve('{"a":"${missing}"}')).to.equal('{"a":"${missing}"}')
    expect(resolver.unresolved).to.deep.equal(['prefix', 'missing'])
  })

  it('keeps the commit of a probe resolver harmless', () => {
    const resolver = createPayloadVariableResolver({ commitCounters: false })
    resolver.resolve('${count:1}')
    resolver.commit()
    expect(readPayloadCounter('count')).to.equal(undefined)
  })
})
