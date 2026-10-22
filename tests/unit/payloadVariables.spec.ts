import { expect } from 'chai'
import { deleteGlobalVariable, saveGlobalVariable } from '@/utils/configProfiles'
import applyPayloadVariables, {
  collectUnresolvedVariables,
  connectionFieldVariables,
  connectionVariableMap,
  createPayloadVariableResolver,
  mergeVariables,
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

describe('payloadVariables scopes of a message', () => {
  beforeEach(() => {
    resetPayloadCounters()
  })

  after(() => {
    resetPayloadCounters()
  })

  it('lets the client variables win over the global ones', () => {
    const variables = mergeVariables({ productType: 'SN0106' }, { productType: 'GLOBAL', sn: 'AF0201' })
    expect(variables).to.deep.equal({ productType: 'SN0106', sn: 'AF0201' })

    const resolver = createPayloadVariableResolver({ variables })
    expect(resolver.resolve('app/${productType}/${sn}/device/post')).to.equal('app/SN0106/AF0201/device/post')
    expect(resolver.unresolved).to.deep.equal([])
  })

  it('falls back to the global variable when the client value is blank', () => {
    expect(mergeVariables({ sn: '   ' }, { sn: 'GLOBAL' })).to.deep.equal({ sn: 'GLOBAL' })
    expect(mergeVariables({ sn: '' }, { sn: 'GLOBAL' })).to.deep.equal({ sn: 'GLOBAL' })
  })

  it('falls back to the inline config when nothing defines the variable', () => {
    const variables = mergeVariables({ rssi: '' }, {})
    expect(createPayloadVariableResolver({ variables, rand: () => 0.5 }).resolve('${rssi:-30..-60}')).to.equal('-45')
  })

  it('ignores scopes and entries that cannot be used', () => {
    const variables = mergeVariables(null, undefined, {}, { '': 'nameless', line: '  ', note: 'kept' })
    expect(variables).to.deep.equal({ note: 'kept' })
    expect(mergeVariables({ note: 'kept' }, { note: 'ignored' })).to.deep.equal({ note: 'kept' })
  })
})

describe('payloadVariables connection fields', () => {
  const connection = {
    clientId: 'sn0106',
    username: 'yibin',
    name: 'sn0106 设备',
    host: 'broker.emqx.io',
    port: 1883,
  }

  it('exposes the fields of the connection as variables', () => {
    expect(connectionFieldVariables(connection)).to.deep.equal({
      clientId: 'sn0106',
      username: 'yibin',
      name: 'sn0106 设备',
      host: 'broker.emqx.io',
      port: '1883',
    })
  })

  it('builds a topic and a payload from the connection', () => {
    const variables = mergeVariables(undefined, {}, connectionFieldVariables(connection))
    const resolver = createPayloadVariableResolver({ variables })

    expect(resolver.resolve('app/${clientId}/device/system/post')).to.equal('app/sn0106/device/system/post')
    expect(resolver.resolve('{"clientId":"${clientId}","user":"${username}"}')).to.equal(
      '{"clientId":"sn0106","user":"yibin"}',
    )
    expect(resolver.unresolved).to.deep.equal([])
  })

  it('never exposes the password', () => {
    const fields = connectionFieldVariables({ ...connection, password: 'secret' } as never)
    expect(fields).to.not.have.property('password')
    expect(Object.keys(fields)).to.deep.equal(['clientId', 'username', 'name', 'host', 'port'])
  })

  it('leaves a field that the connection does not fill undefined', () => {
    expect(connectionFieldVariables({ clientId: 'sn0106', username: '' })).to.deep.equal({ clientId: 'sn0106' })
    expect(connectionFieldVariables(undefined)).to.deep.equal({})
    expect(connectionFieldVariables({})).to.deep.equal({})
  })

  it('lets an explicit variable win over a connection field', () => {
    expect(mergeVariables({ clientId: 'custom' }, {}, connectionFieldVariables(connection)).clientId).to.equal('custom')
    expect(mergeVariables(undefined, { clientId: 'global' }, connectionFieldVariables(connection)).clientId).to.equal(
      'global',
    )
  })
})

/**
 * The scopes of one connection: the client variables win over the global variables of the preset
 * manager, which win over the fields of the connection itself.
 */
describe('payloadVariables connection scopes', () => {
  let globalIds: string[] = []

  const addGlobal = (name: string, value: string): void => {
    const saved = saveGlobalVariable({ name, value })
    globalIds.push(saved.id)
  }

  afterEach(() => {
    globalIds.forEach((id) => deleteGlobalVariable(id))
    globalIds = []
  })

  const connection = {
    variables: { sn: 'CLIENT', clientId: 'client-override' },
    clientId: 'sn0106',
    username: 'yibin',
    name: 'sn0106 设备',
    host: 'broker.emqx.io',
    port: 1883,
  }

  it('merges the client variables, the global variables and the connection fields, closest first', () => {
    addGlobal('sn', 'GLOBAL')
    addGlobal('prefix', 'app')

    expect(connectionVariableMap(connection)).to.deep.equal({
      sn: 'CLIENT',
      clientId: 'client-override',
      prefix: 'app',
      username: 'yibin',
      name: 'sn0106 设备',
      host: 'broker.emqx.io',
      port: '1883',
    })
  })

  it('lets an empty client value fall through to the global variable', () => {
    addGlobal('sn', 'GLOBAL')

    expect(connectionVariableMap({ ...connection, variables: { sn: '  ' } }).sn).to.equal('GLOBAL')
  })

  it('lets an empty global value fall through to the connection field', () => {
    addGlobal('username', '  ')

    expect(connectionVariableMap(connection).username).to.equal('yibin')
  })

  it('exposes the field values of the connection itself', () => {
    expect(
      connectionVariableMap({
        clientId: 'sn0106',
        username: 'yibin',
        name: 'sn0106 设备',
        host: 'broker.emqx.io',
        port: 1883,
      }),
    ).to.deep.equal({
      clientId: 'sn0106',
      username: 'yibin',
      name: 'sn0106 设备',
      host: 'broker.emqx.io',
      port: '1883',
    })
  })

  it('returns only the global variables for a missing connection', () => {
    addGlobal('prefix', 'app')

    expect(connectionVariableMap(undefined)).to.deep.equal({ prefix: 'app' })
    expect(connectionVariableMap(null)).to.deep.equal({ prefix: 'app' })
  })

  it('resolves a topic and a payload from the merged scopes', () => {
    addGlobal('prefix', 'app')
    addGlobal('sn', 'GLOBAL')

    const resolver = createPayloadVariableResolver({ variables: connectionVariableMap(connection) })
    expect(resolver.resolve('${prefix}/${sn}/device/heart/post')).to.equal('app/CLIENT/device/heart/post')
    expect(resolver.resolve('{"clientId":"${clientId}","port":${port}}')).to.equal(
      '{"clientId":"client-override","port":1883}',
    )
  })
})

/**
 * Simple arithmetic inside a placeholder: "the current time, 34 seconds ago" is the common case, but
 * the same engine covers counters, user variables and the fields of a received message.
 */
describe('payload variables: arithmetic', () => {
  const now = new Date('2026-10-21T08:00:00.000Z')
  const ts = now.getTime()

  it('shifts the current time by an offset', () => {
    expect(resolvePayloadVariables('{"ts":${ts-34000}}', { now }).text).to.equal(`{"ts":${ts - 34000}}`)
    expect(resolvePayloadVariables('${timestamp+5000}', { now }).text).to.equal(String(ts + 5000))
    expect(resolvePayloadVariables('${timestampSec-30}', { now }).text).to.equal(String(Math.floor(ts / 1000) - 30))
  })

  it('respects precedence, parentheses and unary minus', () => {
    const variables = { base: '100' }
    expect(resolvePayloadVariables('${base + 2 * 3}', { now, variables }).text).to.equal('106')
    expect(resolvePayloadVariables('${(base + 2) * 3}', { now, variables }).text).to.equal('306')
    expect(resolvePayloadVariables('${-base + 10}', { now, variables }).text).to.equal('-90')
    expect(resolvePayloadVariables('${base / 4}', { now, variables }).text).to.equal('25')
    expect(resolvePayloadVariables('${base % 7}', { now, variables }).text).to.equal('2')
  })

  it('keeps the JSON type of a quoted result', () => {
    expect(resolvePayloadVariables('{"ts":"${ts-1}"}', { now }).text).to.equal(`{"ts":${ts - 1}}`)
  })

  it('resolves the received message fields of an automatic reply', () => {
    const message = { ts: 1792486795034, data: { count: 3 } }
    expect(resolvePayloadVariables('{"ts":${msg.ts - 34000}}', { now, message }).text).to.equal('{"ts":1792486761034}')
    expect(resolvePayloadVariables('${msg.data.count * 2}', { now, message }).text).to.equal('6')
  })

  it('reports what it cannot do instead of publishing NaN', () => {
    const unknownName = resolvePayloadVariables('${nope * 2}', { now })
    expect(unknownName.text).to.equal('${nope * 2}')
    expect(unknownName.unresolved).to.deep.equal(['nope'])

    const text = resolvePayloadVariables('${base * 2}', { now, variables: { base: 'abc' } })
    expect(text.text).to.equal('${base * 2}')
    expect(text.unresolved).to.deep.equal(['base'])

    const divideByZero = resolvePayloadVariables('${ts / 0}', { now })
    expect(divideByZero.text).to.equal('${ts / 0}')
    expect(divideByZero.unresolved).to.deep.equal(['ts / 0'])
  })

  it('reports a hyphenated token as arithmetic it cannot do, and keeps the text', () => {
    // `${sensor-1}` reads as `sensor - 1`; `sensor` is not a variable, so the text stays and the name
    // is reported (the publish dialog then lets the user send it verbatim if that was the intent).
    const hyphen = resolvePayloadVariables('${sensor-1}', { now })
    expect(hyphen.text).to.equal('${sensor-1}')
    expect(hyphen.unresolved).to.deep.equal(['sensor'])
  })

  it('keeps the inline configs working', () => {
    expect(resolvePayloadVariables('${rssi:-30..-60}', { now, rand: () => 0 }).text).to.equal('-60')
  })
})

/**
 * The variables a received message answers: `${msg.<path>}` and `${topic}`. They come from the
 * message provider of the one provider chain, not from a pre-pass over the template, so they also
 * work inside a user variable value.
 */
describe('payload variables of a received message', () => {
  const message = {
    msgId: '1553953167238107136',
    ts: 1792486795034,
    'sensor-1': 'ok',
    data: { list: [{ id: 21 }], nested: { flag: true } },
    tag: { a: 1 },
  }

  it('resolves a field of the message and the received topic', () => {
    const result = resolvePayloadVariables('{"id":"${msg.msgId}","topic":"${topic}"}', {
      message,
      topic: 'app/A1/AF0201/device/system/post',
    })

    expect(result.text).to.equal('{"id":"1553953167238107136","topic":"app/A1/AF0201/device/system/post"}')
    expect(result.unresolved).to.deep.equal([])
  })

  it('reads a nested field and an array element', () => {
    expect(resolvePayloadVariables('${msg.data.list[0].id}', { message }).text).to.equal('21')
    expect(resolvePayloadVariables('${msg.data.nested.flag}', { message }).text).to.equal('true')
  })

  it('renders a missing field as an empty string instead of an unresolved variable', () => {
    const result = resolvePayloadVariables('{"missing":"${msg.nope}","nested":"${msg.data.nope}"}', { message })

    expect(result.text).to.equal('{"missing":"","nested":""}')
    expect(result.unresolved).to.deep.equal([])
  })

  it('keeps a quoted numeric field a JSON string, like the old reply pre-pass', () => {
    expect(resolvePayloadVariables('{"ts":"${msg.ts}"}', { message }).text).to.equal('{"ts":"1792486795034"}')
    expect(resolvePayloadVariables('{"ts":${msg.ts}}', { message }).text).to.equal('{"ts":1792486795034}')
  })

  it('renders an object or array field as JSON', () => {
    expect(resolvePayloadVariables('${msg.tag}', { message }).text).to.equal('{"a":1}')
    expect(resolvePayloadVariables('${msg.data.list}', { message }).text).to.equal('[{"id":21}]')
    expect(resolvePayloadVariables('${msg}', { message }).text).to.equal(JSON.stringify(message))
  })

  it('keeps a hyphenated field name a field path', () => {
    expect(resolvePayloadVariables('${msg.sensor-1}', { message }).text).to.equal('ok')
    expect(resolvePayloadVariables('{"v":"${msg.sensor-1}"}', { message }).text).to.equal('{"v":"ok"}')
  })

  it('evaluates arithmetic on a message path even without spaces, and reports a missing one', () => {
    expect(resolvePayloadVariables('${msg.data.list[0].id*2}', { message }).text).to.equal('42')

    // A path that only looks like an expression is evaluated as one; a miss is reported instead of
    // silently rendering an empty string (the old pre-pass could not tell the two apart).
    const missing = resolvePayloadVariables('${msg.nope*2}', { message })
    expect(missing.text).to.equal('${msg.nope*2}')
    expect(missing.unresolved).to.deep.equal(['msg.nope'])
  })

  it('resolves a message field used inside a user variable value', () => {
    const result = resolvePayloadVariables('{"ack":"${ack}"}', {
      message,
      variables: { ack: 'id-${msg.msgId}' },
    })

    expect(result.text).to.equal('{"ack":"id-1553953167238107136"}')
    expect(result.unresolved).to.deep.equal([])
  })

  it('keeps an inline config on the msg/topic name working as the old inline form', () => {
    // `${msg:1}` is a counter named `msg`, not a reference to the received message.
    expect(resolvePayloadVariables('${msg:5}', { message }).text).to.equal('5')
    expect(resolvePayloadVariables('${topic:7}', { topic: 'a/b' }).text).to.equal('7')
    resetPayloadCounters()
  })

  it('leaves ${topic} unresolved when the context has no topic', () => {
    const result = resolvePayloadVariables('${topic}', { message })

    expect(result.text).to.equal('${topic}')
    expect(result.unresolved).to.deep.equal(['topic'])
  })
})
