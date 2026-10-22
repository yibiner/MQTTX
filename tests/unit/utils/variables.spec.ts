import { expect } from 'chai'
import {
  createPayloadVariableResolver,
  getReservedVariableNames,
  getVariableGuide,
  getVariableProviders,
  isBuiltinPayloadVariable,
  isReservedVariableName,
  readPayloadCounter,
  registerVariableProvider,
  resetPayloadCounters,
  resolvePayloadVariables,
  validateVariableName,
} from '@/utils/payloadVariables'
import type { VariableProvider } from '@/utils/payloadVariables'

const now = new Date('2026-10-21T08:00:00.000Z')
const ts = now.getTime()

/** One provider per test: the tests only care about the value `resolve` answers for a name. */
const createProvider = (overrides: Partial<VariableProvider> = {}): VariableProvider => ({
  id: 'test-provider',
  resolve: () => undefined,
  ...overrides,
})

describe('variables: arithmetic inside a placeholder', () => {
  it('trims the whitespace around an expression', () => {
    expect(resolvePayloadVariables('${ ts - 34000 }', { now }).text).to.equal(String(ts - 34000))
    expect(resolvePayloadVariables('{"ts":${ ts - 34000 }}', { now }).text).to.equal(`{"ts":${ts - 34000}}`)
  })

  it('respects precedence, parentheses, unary signs and the modulo operator', () => {
    const variables = { base: '100' }

    expect(resolvePayloadVariables('${base + 2 * 3}', { variables }).text).to.equal('106')
    expect(resolvePayloadVariables('${(base + 2) * 3}', { variables }).text).to.equal('306')
    expect(resolvePayloadVariables('${-base + 10}', { variables }).text).to.equal('-90')
    expect(resolvePayloadVariables('${base / 4}', { variables }).text).to.equal('25')
    expect(resolvePayloadVariables('${base % 7}', { variables }).text).to.equal('2')
  })

  it('reports a division or a modulo by zero instead of rendering Infinity or NaN', () => {
    const variables = { base: '100' }

    const divided = resolvePayloadVariables('${base / 0}', { variables })
    expect(divided.text).to.equal('${base / 0}')
    expect(divided.unresolved).to.deep.equal(['base / 0'])

    const modulo = resolvePayloadVariables('${base % 0}', { variables })
    expect(modulo.text).to.equal('${base % 0}')
    expect(modulo.unresolved).to.deep.equal(['base % 0'])
  })

  it('reads an array element of the received message inside an expression', () => {
    const message = { list: [{ id: 21 }, { id: 9 }] }

    expect(resolvePayloadVariables('${msg.list[0].id * 2}', { message }).text).to.equal('42')
    expect(resolvePayloadVariables('${msg.list[1].id + 1}', { message }).text).to.equal('10')
  })

  it('reports the non-numeric operand that made the expression fail', () => {
    const variable = resolvePayloadVariables('${base * 2}', { variables: { base: 'abc' } })
    expect(variable.text).to.equal('${base * 2}')
    expect(variable.unresolved).to.deep.equal(['base'])

    const field = resolvePayloadVariables('${msg.label * 2}', { message: { label: 'n/a' } })
    expect(field.text).to.equal('${msg.label * 2}')
    expect(field.unresolved).to.deep.equal(['msg.label'])
  })

  it('reports an identifier that no provider can resolve', () => {
    const result = resolvePayloadVariables('${nope + 1}')
    expect(result.text).to.equal('${nope + 1}')
    expect(result.unresolved).to.deep.equal(['nope'])
  })
})

describe('variables: provider registry', () => {
  const cleanups: Array<() => void> = []

  const register = (provider: VariableProvider, options?: { reserved?: boolean }): (() => void) => {
    const unregister = registerVariableProvider(provider, options)
    cleanups.push(unregister)
    return unregister
  }

  beforeEach(() => {
    resetPayloadCounters()
  })

  afterEach(() => {
    let cleanup = cleanups.pop()
    while (cleanup) {
      cleanup()
      cleanup = cleanups.pop()
    }
    resetPayloadCounters()
  })

  it('keeps the chain order: built-in, message, session, definitions, user variables', () => {
    expect(
      getVariableProviders()
        .map((provider) => provider.id)
        .slice(0, 5),
    ).to.deep.equal(['builtin', 'message', 'session', 'definitions', 'user'])
  })

  it('registers a provider and returns the function that removes it again', () => {
    const provider = createProvider({
      id: 'test-environment',
      guide: [{ name: '${env.HOME}', group: 'context' }],
      resolve: (request) => (request.name === 'env.HOME' ? '/home/device' : undefined),
    })
    const unregister = registerVariableProvider(provider)

    try {
      expect(getVariableProviders().some((registered) => registered.id === 'test-environment')).to.equal(true)
      expect(resolvePayloadVariables('${env.HOME}').text).to.equal('/home/device')
    } finally {
      unregister()
    }

    expect(getVariableProviders().some((registered) => registered.id === 'test-environment')).to.equal(false)
    const removed = resolvePayloadVariables('${env.HOME}')
    expect(removed.text).to.equal('${env.HOME}')
    expect(removed.unresolved).to.deep.equal(['env.HOME'])
  })

  it('adds the guide entries of a registered provider to the variable guide', () => {
    const provider = createProvider({
      id: 'test-guide',
      guide: [{ name: '${env.NAME}', group: 'context' }],
    })
    const unregister = registerVariableProvider(provider)

    try {
      const guide = getVariableGuide()
      expect(guide.some((entry) => entry.name === '${env.NAME}')).to.equal(true)
      const groups = Array.from(new Set(guide.map((entry) => entry.group)))
      expect(groups).to.have.members(['builtin', 'context', 'connection', 'inline'])
    } finally {
      unregister()
    }

    expect(getVariableGuide().some((entry) => entry.name === '${env.NAME}')).to.equal(false)
  })

  it('refuses to register a provider id twice', () => {
    register(createProvider({ id: 'test-duplicate' }))
    expect(() => registerVariableProvider(createProvider({ id: 'test-duplicate' }))).to.throw(/already registered/)
  })

  it('validates a user-defined variable name', () => {
    expect(validateVariableName('line')).to.equal(undefined)
    expect(validateVariableName('device_1')).to.equal(undefined)
    expect(validateVariableName('line', ['line'])).to.equal('duplicate')
    expect(validateVariableName(' timestamp ')).to.equal('reserved')
    expect(validateVariableName('bad-name')).to.equal('invalid')
    expect(validateVariableName('')).to.equal('invalid')
  })

  it('reports the names of a reserved provider as reserved', () => {
    expect(isReservedVariableName('timestamp')).to.equal(true)
    expect(isBuiltinPayloadVariable('uuid')).to.equal(true)
    expect(getReservedVariableNames()).to.include.members(['timestamp', 'ts', 'uuid'])

    const unregister = registerVariableProvider(
      createProvider({ id: 'test-reserved-names', reserved: true, names: ['deviceId'] }),
    )
    try {
      expect(isReservedVariableName('deviceId')).to.equal(true)
      expect(validateVariableName('deviceId')).to.equal('reserved')
    } finally {
      unregister()
    }
    expect(validateVariableName('deviceId')).to.equal(undefined)
  })

  it('does not reserve the names of a normal provider, so a user variable can win', () => {
    register(createProvider({ id: 'test-normal-names', names: ['ext'] }))
    expect(validateVariableName('ext')).to.equal(undefined)
  })

  it('asks a normal provider after the user variables and a reserved one before them', () => {
    register(
      createProvider({
        id: 'test-normal',
        resolve: (request) => (request.name === 'ext' ? 'extension' : undefined),
      }),
    )
    register(
      createProvider({
        id: 'test-reserved',
        reserved: true,
        resolve: (request) => (request.name === 'reservedId' ? 'reserved' : undefined),
      }),
    )

    expect(resolvePayloadVariables('${ext}', { variables: { ext: 'user' } }).text).to.equal('user')
    expect(resolvePayloadVariables('${ext}').text).to.equal('extension')
    expect(resolvePayloadVariables('${reservedId}', { variables: { reservedId: 'user' } }).text).to.equal('reserved')
  })

  it('asks the message and topic context before the user variables', () => {
    const result = resolvePayloadVariables('${msg.field}/${topic}', {
      variables: { 'msg.field': 'user-field', topic: 'user-topic' },
      message: { field: 'message-field' },
      topic: 'received/topic',
    })

    expect(result.text).to.equal('message-field/received/topic')
    expect(result.unresolved).to.deep.equal([])
  })

  it('asks the user variables before the inline forms', () => {
    const result = resolvePayloadVariables('${count:1}', { variables: { count: '7' } })

    expect(result.text).to.equal('7')
    // The user variable answered, so the counter of the inline form never ran.
    expect(readPayloadCounter('count')).to.equal(undefined)
  })

  it('does not let a provider or a user variable shadow a built-in', () => {
    const unregister = registerVariableProvider(
      createProvider({
        id: 'test-shadow-builtin',
        reserved: true,
        resolve: (request) => (request.name === 'timestamp' ? 'shadow' : undefined),
      }),
    )

    try {
      const result = resolvePayloadVariables('${timestamp}', { variables: { timestamp: 'user-shadow' }, now })
      expect(result.text).to.equal(String(ts))
      expect(result.unresolved).to.deep.equal([])
    } finally {
      unregister()
    }
  })

  it('supports providers of one resolver only, between the user variables and the inline forms', () => {
    const provider = createProvider({
      id: 'test-resolver-only',
      resolve: (request) => {
        if (request.name === 'onlyHere') {
          return 'here'
        }
        return request.name === 'count' ? 'provider-count' : undefined
      },
    })

    const withUserVariables = createPayloadVariableResolver({
      variables: { onlyHere: 'user', count: 'user-count' },
      providers: [provider],
      commitCounters: false,
    })
    expect(withUserVariables.resolve('${onlyHere}/${count:5}')).to.equal('user/user-count')
    expect(readPayloadCounter('count')).to.equal(undefined)

    const providerOnly = createPayloadVariableResolver({ providers: [provider], commitCounters: false })
    expect(providerOnly.resolve('${onlyHere}/${count:5}')).to.equal('here/provider-count')
    // The provider answered `count`, so the inline counter never ran.
    expect(readPayloadCounter('count')).to.equal(undefined)

    // The provider was not registered: the next resolver does not see it.
    expect(resolvePayloadVariables('${onlyHere}').unresolved).to.deep.equal(['onlyHere'])
  })
})

describe('variables: resolution details', () => {
  beforeEach(() => {
    resetPayloadCounters()
  })

  afterEach(() => {
    resetPayloadCounters()
  })

  it('trims the name inside the braces', () => {
    expect(resolvePayloadVariables('${ ts }', { now }).text).to.equal(String(ts))
    expect(resolvePayloadVariables('{"ts":"${ ts }"}', { now }).text).to.equal(`{"ts":${ts}}`)
  })

  it('reports an unresolved name once even when it occurs many times', () => {
    const result = resolvePayloadVariables('${missing}/${missing}?a=${other}&b=${other}')
    expect(result.unresolved).to.deep.equal(['missing', 'other'])

    const resolver = createPayloadVariableResolver()
    resolver.resolve('${missing}')
    resolver.resolve('{"again":"${missing}"}')
    expect(resolver.unresolved).to.deep.equal(['missing'])
  })

  it('keeps one uuid per message and draws a new one for the next message', () => {
    const first = resolvePayloadVariables('${uuid}|${uuid}')
    const [left, right] = first.text.split('|')
    expect(left).to.equal(right)
    expect(left).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(resolvePayloadVariables('${uuid}').text).to.not.equal(left)

    const resolver = createPayloadVariableResolver()
    const topic = resolver.resolve('${uuid}')
    expect(resolver.resolve('{"id":"${uuid}"}')).to.equal(`{"id":"${topic}"}`)
  })
})

describe('variables: references that run through an expression', () => {
  it('reports a cycle instead of overflowing the stack', () => {
    const result = resolvePayloadVariables('${a}', { variables: { a: '${b + 1}', b: '${a + 1}' } })

    expect(result.unresolved).to.include('a')
    expect(result.text).to.not.contain('NaN')
  })

  it('reports a self reference that reads its own value in an expression', () => {
    const result = resolvePayloadVariables('${a}', { variables: { a: '${a + 1}' } })

    expect(result.text).to.equal('${a + 1}')
    expect(result.unresolved).to.deep.equal(['a'])
  })
})

describe('variables: names a provider declares', () => {
  it('lets a declared prefix own an operator-containing name, unlike an undeclared one', () => {
    const unregister = registerVariableProvider({
      id: 'test-declared-prefix',
      prefixes: ['env'],
      resolve: (request) => (request.name === 'env.MY-VAR' ? 'value' : undefined),
    })
    try {
      expect(resolvePayloadVariables('${env.MY-VAR}').text).to.equal('value')
      // Without a provider that declares the name, a user variable cannot claim it either: the
      // token is arithmetic and not defined, so it stays and is reported.
      const undeclared = resolvePayloadVariables('${env-OTHER}', { variables: { 'env-OTHER': 'nope' } })
      expect(undeclared.text).to.equal('${env-OTHER}')
      expect(undeclared.unresolved).to.deep.equal(['env'])
    } finally {
      unregister()
    }
  })
})

describe('variables: hostile / oversized expressions', () => {
  it('reports a deeply nested expression instead of overflowing the stack', () => {
    const text = '${' + '('.repeat(5000) + '1' + ')'.repeat(5000) + '}'
    let result: { text: string; unresolved: string[] } | undefined
    expect(() => {
      result = resolvePayloadVariables(text) as { text: string; unresolved: string[] }
    }).to.not.throw()
    expect(result?.unresolved.length).to.be.greaterThan(0)
    expect(result?.text).to.equal(text)
  })

  it('reports an oversized token chain as unresolved instead of parsing it', () => {
    const text = '${' + Array.from({ length: 500 }, (_, index) => `a${index}`).join(' + ') + '}'
    expect(() => resolvePayloadVariables(text)).to.not.throw()
    expect(resolvePayloadVariables(text).unresolved.length).to.be.greaterThan(0)
  })
})
