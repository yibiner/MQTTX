import { expect } from 'chai'
import { planAutoReplies } from '@/utils/autoReply'
import { deleteGlobalVariable, saveGlobalVariable } from '@/utils/configProfiles'
import { APP_STARTED_AT, globalStateKey } from '@/utils/variables'
import {
  applyAutoReplyVariableActions,
  applyVariableResetTrigger,
  connectionVariableDefinitions,
  createPayloadVariableResolver,
  formatVariableValue,
  globalVariableDefinitions,
  markManualDisconnect,
  normalizeVariableDefinition,
  normalizeVariableMap,
  onConnectionClosed,
  onConnectionEstablished,
  onConnectionVariablesChanged,
  peekDefinitionValue,
  readConnectionSession,
  readPayloadCounter,
  readVariableState,
  resetAllVariableStates,
  resetLifecycleState,
  resetPayloadCounters,
  resetVariable,
  resolvePayloadVariables,
  setVariableValue,
  startConnectionSession,
  writePayloadCounter,
} from '@/utils/payloadVariables'
import type { ResolvedVariableDefinition } from '@/utils/payloadVariables'

/**
 * The stateful variable kinds, their runtime state and their lifecycle.
 *
 * The tests drive the app-facing API only (`resolvePayloadVariables`, the lifecycle actions and the
 * state readers), because that is what the publish path, the timed messages and the automatic
 * replies use. Every test starts from empty stores: the state is process-wide, so leaking one test's
 * counter into the next would hide exactly the bugs these tests exist for.
 */

const connectionDefinition = (
  name: string,
  stored: StoredVariable,
  connectionId = 'connection-a',
): ResolvedVariableDefinition => normalizeVariableDefinition(name, stored, { scope: 'connection', connectionId })

const connectionDefinitions = (
  variables: { [name: string]: StoredVariable },
  connectionId = 'connection-a',
): { [name: string]: ResolvedVariableDefinition } => normalizeVariableMap(variables, { connectionId })

/** The parts of a connection the variable scope needs: an id and its client variables. */
const connectionRecord = (
  id: string,
  variables: { [name: string]: StoredVariable },
): { id: string; variables: { [name: string]: StoredVariable } } => ({ id, variables })

const globalDefinition = (name: string, stored: StoredVariable, globalId = 'global-a'): ResolvedVariableDefinition =>
  normalizeVariableDefinition(name, stored, { scope: 'global', globalId })

/** Resolves one text with the given definitions, i.e. the publish path of one message. */
const resolve = (
  text: string,
  definitions: { [name: string]: ResolvedVariableDefinition },
  options: { connectionId?: string; commitCounters?: boolean } = {},
): string => resolvePayloadVariables(text, { definitions, ...options }).text

describe('stateful variables: sequence', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  it('counts down from the initial value with a negative step', () => {
    const definitions = connectionDefinitions({ weight: { kind: 'sequence', initial: 200, step: -20 } })

    expect(resolve('${weight}', definitions)).to.equal('200')
    expect(resolve('${weight}', definitions)).to.equal('180')
    expect(resolve('${weight}', definitions)).to.equal('160')
    // The stored value is the next one to send.
    expect(peekDefinitionValue(definitions.weight)).to.equal(140)
  })

  it('clamps at the minimum with onBound clamp (the default)', () => {
    const definitions = connectionDefinitions({
      weight: { kind: 'sequence', initial: 200, step: -60, min: 0 },
    })

    const values = Array.from({ length: 6 }, () => resolve('${weight}', definitions))
    expect(values).to.deep.equal(['200', '140', '80', '20', '0', '0'])
  })

  it('wraps around the range with onBound wrap', () => {
    const definitions = connectionDefinitions({
      channel: { kind: 'sequence', initial: 3, step: 1, min: 1, max: 3, onBound: 'wrap' },
    })

    const values = Array.from({ length: 4 }, () => resolve('${channel}', definitions))
    expect(values).to.deep.equal(['3', '1', '2', '3'])
  })

  it('restarts from the initial value with onBound reset', () => {
    const definitions = connectionDefinitions({
      attempt: { kind: 'sequence', initial: 5, step: 2, min: 0, max: 5, onBound: 'reset' },
    })

    expect([resolve('${attempt}', definitions), resolve('${attempt}', definitions)]).to.deep.equal(['5', '5'])
  })

  it('supports a decimal step', () => {
    const definitions = connectionDefinitions({
      temperature: { kind: 'sequence', initial: 1.5, step: 0.1 },
    })

    expect(resolve('${temperature}', definitions)).to.equal('1.5')
    // The next value is staged as a number; formatting is a separate test below.
    expect(peekDefinitionValue(definitions.temperature)).to.equal(1.6)
  })

  it('resets to the initial value through the manual reset action', () => {
    const definition = connectionDefinition('weight', { kind: 'sequence', initial: 200, step: -20 })
    const definitions = { weight: definition }

    expect(resolve('${weight}', definitions)).to.equal('200')
    expect(resolve('${weight}', definitions)).to.equal('180')
    expect(resetVariable(definition)).to.equal(true)
    expect(resolve('${weight}', definitions)).to.equal('200')
  })

  it('reports a reset of a stateless definition as a no-op', () => {
    const constant = connectionDefinition('line', 'A')
    expect(constant.stateKey).to.equal(undefined)
    expect(resetVariable(constant)).to.equal(false)
    expect(resetVariable(undefined)).to.equal(false)
  })

  it('accepts a manually set value and continues from it', () => {
    const definition = connectionDefinition('weight', { kind: 'sequence', initial: 200, step: 1 })
    const definitions = { weight: definition }

    expect(setVariableValue(definition, 42)).to.equal(true)
    expect(resolve('${weight}', definitions)).to.equal('42')
    expect(resolve('${weight}', definitions)).to.equal('43')
    expect(setVariableValue(undefined, 1)).to.equal(false)
  })

  it('keeps the same value for every occurrence of one message but advances once', () => {
    const definitions = connectionDefinitions({ weight: { kind: 'sequence', initial: 200, step: -20 } })
    const resolver = createPayloadVariableResolver({ definitions })

    expect(resolver.resolve('${weight}')).to.equal('200')
    expect(resolver.resolve('{"weight":${weight}}')).to.equal('{"weight":200}')
    resolver.commit()
    expect(resolve('${weight}', definitions)).to.equal('180')
  })

  it('does not advance on a preview (commitCounters: false)', () => {
    const definitions = connectionDefinitions({ weight: { kind: 'sequence', initial: 200, step: -20 } })

    expect(resolve('${weight}', definitions, { commitCounters: false })).to.equal('200')
    expect(readVariableState(definitions.weight.stateKey as string)).to.equal(undefined)
    expect(resolve('${weight}', definitions)).to.equal('200')
  })
})

describe('stateful variables: scopes', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  it('gives two connections independent state for the same client variable name', () => {
    const first = connectionDefinitions({ weight: { kind: 'sequence', initial: 1, step: 1 } }, 'connection-a')
    const second = connectionDefinitions({ weight: { kind: 'sequence', initial: 100, step: 1 } }, 'connection-b')

    expect(first.weight.stateKey).to.equal('c:connection-a:weight')
    expect(second.weight.stateKey).to.equal('c:connection-b:weight')

    expect(resolve('${weight}', first)).to.equal('1')
    expect(resolve('${weight}', first)).to.equal('2')
    // The second device counts on its own, unaffected by the first one.
    expect(resolve('${weight}', second)).to.equal('100')
    expect(resolve('${weight}', first)).to.equal('3')
  })

  it('shares one value between connections for a global definition', () => {
    const fromFirstConnection = { weight: globalDefinition('weight', { kind: 'sequence', initial: 5, step: 1 }) }
    const fromSecondConnection = { weight: globalDefinition('weight', { kind: 'sequence', initial: 5, step: 1 }) }

    expect(globalStateKey('global-a')).to.equal('g:global-a')
    expect(fromFirstConnection.weight.stateKey).to.equal('g:global-a')
    expect(fromSecondConnection.weight.stateKey).to.equal('g:global-a')

    expect(resolve('${weight}', fromFirstConnection)).to.equal('5')
    // The shared state is advanced by the first connection, so the second one sees 6.
    expect(resolve('${weight}', fromSecondConnection)).to.equal('6')
  })

  it('resets a shared global value once through a reset trigger', () => {
    const first = globalDefinition('weight', {
      kind: 'sequence',
      initial: 5,
      step: 1,
      resetOn: ['manual'],
    })
    const second = globalDefinition('weight', {
      kind: 'sequence',
      initial: 5,
      step: 1,
      resetOn: ['manual'],
    })

    expect(resolve('${weight}', { weight: first })).to.equal('5')
    expect(resolve('${weight}', { weight: second })).to.equal('6')
    expect(applyVariableResetTrigger('manual', [first])).to.deep.equal(['weight'])
    expect(resolve('${weight}', { weight: second })).to.equal('5')
  })

  it('ignores a trigger that the definition does not listen to', () => {
    const definition = connectionDefinition('weight', { kind: 'sequence', initial: 5, step: 1, resetOn: ['connect'] })

    expect(resolve('${weight}', { weight: definition })).to.equal('5')
    expect(resolve('${weight}', { weight: definition })).to.equal('6')
    expect(applyVariableResetTrigger('manual', [definition])).to.deep.equal([])
    expect(resolve('${weight}', { weight: definition })).to.equal('7')
  })

  it('sets a variable value through the definition of the same state key', () => {
    const definition = globalDefinition('weight', { kind: 'sequence', initial: 5, step: 1 })
    setVariableValue(definition, 77)

    expect(peekDefinitionValue(globalDefinition('weight', { kind: 'sequence', initial: 5, step: 1 }))).to.equal(77)
  })
})

describe('stateful variables: provider integration', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  it('resolves a stateful variable and advances it for the next message', () => {
    const definitions = connectionDefinitions({ weight: { kind: 'sequence', initial: 200, step: -20 } })

    const first = resolvePayloadVariables('{"weight":${weight}}', { definitions, connectionId: 'connection-a' })
    expect(first.text).to.equal('{"weight":200}')
    expect(first.unresolved).to.deep.equal([])

    const second = resolvePayloadVariables('{"weight":${weight}}', { definitions, connectionId: 'connection-a' })
    expect(second.text).to.equal('{"weight":180}')
  })

  it('does not advance a stateful variable on a preview', () => {
    const definitions = connectionDefinitions({ weight: { kind: 'sequence', initial: 200, step: -20 } })

    const preview = createPayloadVariableResolver({ definitions, commitCounters: false })
    expect(preview.resolve('${weight}')).to.equal('200')
    preview.commit()

    expect(peekDefinitionValue(definitions.weight)).to.equal(200)
    expect(resolve('${weight}', definitions)).to.equal('200')
  })

  it('advances a variable once when the topic and the payload share one resolver', () => {
    const definitions = connectionDefinitions({ weight: { kind: 'sequence', initial: 200, step: -20 } })
    const resolver = createPayloadVariableResolver({ definitions, connectionId: 'connection-a' })

    expect(resolver.resolve('device/${weight}/post')).to.equal('device/200/post')
    expect(resolver.resolve('{"weight":${weight}}')).to.equal('{"weight":200}')
    expect(resolver.unresolved).to.deep.equal([])
    resolver.commit()

    expect(resolve('${weight}', definitions)).to.equal('180')
  })

  it('resolves a constant variable of the merged definitions like before', () => {
    const definitions = connectionDefinitions({ line: 'A1', device: 'SN-${line}' })

    expect(resolve('app/${device}/post', definitions)).to.equal('app/SN-A1/post')
  })

  it('treats an empty client constant as not defined, like the legacy merge did', () => {
    expect(connectionVariableDefinitions({ id: 'empty-connection', variables: { weight: '' } })).to.deep.equal({})
  })

  it('expands a placeholder inside the value of a constant definition', () => {
    const definitions = {
      line: connectionDefinition('line', 'A1'),
      device: connectionDefinition('device', { kind: 'constant', value: 'PLC-${line}' }),
    }

    expect(resolve('${device}/heart', definitions)).to.equal('PLC-A1/heart')
  })
})

describe('stateful variables: random kinds', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  it('produces a reproducible value stream for a seeded random variable', () => {
    const definitions = connectionDefinitions({ rssi: { kind: 'random', min: -60, max: -30, seed: 42 } })

    const firstRun = [resolve('${rssi}', definitions), resolve('${rssi}', definitions), resolve('${rssi}', definitions)]
    firstRun.forEach((value) => {
      const number = Number(value)
      expect(Number.isInteger(number)).to.equal(true)
      expect(number).to.be.at.least(-60)
      expect(number).to.be.at.most(-30)
    })

    // A reset restarts the deterministic stream from its first draw.
    resetAllVariableStates()
    const secondRun = [
      resolve('${rssi}', definitions),
      resolve('${rssi}', definitions),
      resolve('${rssi}', definitions),
    ]
    expect(secondRun).to.deep.equal(firstRun)
  })

  it('keeps a random walk inside its bounds', () => {
    const definitions = connectionDefinitions({
      weight: { kind: 'randomWalk', initial: 5, min: 0, max: 10, range: 100, seed: 7 },
    })

    const values = Array.from({ length: 30 }, () => Number(resolve('${weight}', definitions)))
    values.forEach((value) => {
      expect(value).to.be.at.least(0)
      expect(value).to.be.at.most(10)
    })
  })

  it('moves a random walk by at most its range', () => {
    const definition = connectionDefinition('weight', {
      kind: 'randomWalk',
      initial: 0,
      min: -100,
      max: 100,
      range: 1,
      seed: 3,
    })
    const definitions = { weight: definition }

    let previous = Number(resolve('${weight}', definitions))
    for (let index = 0; index < 20; index += 1) {
      const current = Number(resolve('${weight}', definitions))
      expect(Math.abs(current - previous)).to.be.at.most(1)
      previous = current
    }
  })

  it('honours a zero weight in a weighted choice', () => {
    const onlySecond = connectionDefinitions({
      pick: {
        kind: 'choice',
        seed: 11,
        options: [
          { value: 'never', weight: 0 },
          { value: 'always', weight: 1 },
        ],
      },
    })
    const onlyFirst = connectionDefinitions({
      pick: {
        kind: 'choice',
        seed: 11,
        options: [
          { value: 'always', weight: 1 },
          { value: 'never', weight: 0 },
        ],
      },
    })

    for (let index = 0; index < 5; index += 1) {
      expect(resolve('${pick}', onlySecond)).to.equal('always')
      expect(resolve('${pick}', onlyFirst)).to.equal('always')
    }
  })
})

describe('stateful variables: session clock', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  it('exposes the session start, the app start and the message number', () => {
    startConnectionSession('session-connection', 1000)

    const result = resolvePayloadVariables('${connectedAt}|${sessionSentCount}|${appStartedAt}', {
      connectionId: 'session-connection',
    })

    expect(result.text).to.equal(`1000|1|${APP_STARTED_AT}`)
    expect(result.unresolved).to.deep.equal([])
    // The message counter was persisted by the commit.
    expect(readConnectionSession('session-connection')?.sentCount).to.equal(1)
  })

  it('increments the session message counter per message, not per placeholder', () => {
    startConnectionSession('session-connection', 1000)

    expect(
      resolvePayloadVariables('${sessionSentCount}/${sessionSentCount}', { connectionId: 'session-connection' }).text,
    ).to.equal('1/1')
    expect(resolvePayloadVariables('${sessionSentCount}', { connectionId: 'session-connection' }).text).to.equal('2')
  })

  it('has no session variables without a connection', () => {
    const result = resolvePayloadVariables('${connectedAt}|${sessionSentCount}')
    expect(result.text).to.equal('${connectedAt}|${sessionSentCount}')
    expect(result.unresolved).to.deep.equal(['connectedAt', 'sessionSentCount'])
  })

  it('generates a new session variable for every connection session', () => {
    const record = connectionRecord('session-connection', { deviceId: { kind: 'session' } })
    const definitions = (): { [name: string]: ResolvedVariableDefinition } => connectionVariableDefinitions(record)

    onConnectionEstablished(record)
    const first = resolve('${deviceId}', definitions())
    expect(first).to.match(/^[0-9a-f-]{36}$/)
    // The value is stable while the session lasts.
    expect(resolve('${deviceId}', definitions())).to.equal(first)

    // An automatic reconnect starts a new session, so the session value is regenerated.
    onConnectionEstablished(record)
    expect(resolve('${deviceId}', definitions())).to.not.equal(first)
  })

  it('keeps a connect-reset variable across an automatic reconnect when resetOnReconnect is false', () => {
    const record = connectionRecord('reconnect-connection', {
      sent: { kind: 'sequence', initial: 1, step: 1, resetOn: ['connect'], resetOnReconnect: false },
    })
    const definitions = (): { [name: string]: ResolvedVariableDefinition } => connectionVariableDefinitions(record)

    onConnectionEstablished(record)
    setVariableValue(definitions().sent, 42)

    // A reconnect (the second connect of the same connection) does not reset it.
    const result = onConnectionEstablished(record)
    expect(result.reconnect).to.equal(true)
    expect(peekDefinitionValue(definitions().sent)).to.equal(42)

    // A manual disconnect makes the next connect a fresh one, so the variable resets.
    markManualDisconnect(record.id)
    const reconnectAfterManual = onConnectionEstablished(record)
    expect(reconnectAfterManual.reconnect).to.equal(false)
    expect(peekDefinitionValue(definitions().sent)).to.equal(1)
  })

  it('applies an app-start reset only on the first use after the app started', () => {
    const record = connectionRecord('app-start-connection', {
      booted: { kind: 'sequence', initial: 1, step: 1, resetOn: ['appStart'] },
    })
    const definitions = (): { [name: string]: ResolvedVariableDefinition } => connectionVariableDefinitions(record)

    onConnectionEstablished(record)
    setVariableValue(definitions().booted, 9)

    // The app-start reset already happened, so a later connect keeps the current value.
    onConnectionEstablished(record)
    expect(peekDefinitionValue(definitions().booted)).to.equal(9)
  })

  it('applies a disconnect reset when the connection goes away', () => {
    const record = connectionRecord('disconnect-connection', {
      weight: { kind: 'sequence', initial: 1, step: 1, resetOn: ['disconnect'] },
    })
    const definitions = (): { [name: string]: ResolvedVariableDefinition } => connectionVariableDefinitions(record)

    onConnectionEstablished(record)
    setVariableValue(definitions().weight, 7)
    expect(peekDefinitionValue(definitions().weight)).to.equal(7)

    expect(onConnectionClosed(record)).to.deep.equal(['weight'])
    expect(peekDefinitionValue(definitions().weight)).to.equal(1)
  })

  it('drops the values of a connection when its variables are edited', () => {
    const record = connectionRecord('edited-connection', {
      weight: { kind: 'sequence', initial: 1, step: 1 },
    })
    const definitions = (): { [name: string]: ResolvedVariableDefinition } => connectionVariableDefinitions(record)

    onConnectionEstablished(record)
    setVariableValue(definitions().weight, 42)
    onConnectionVariablesChanged(record.id)
    expect(peekDefinitionValue(definitions().weight)).to.equal(1)
  })
})

describe('stateful variables: formatting', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
  })

  it('zero-pads and rounds a value', () => {
    expect(formatVariableValue(123, { pad: 6 })).to.equal('000123')
    expect(formatVariableValue(123, undefined)).to.equal(123)
    expect(formatVariableValue(-42, { pad: 5 })).to.equal('-0042')
    expect(formatVariableValue(2.5, { precision: 2 })).to.equal('2.50')
    expect(formatVariableValue(2, { pad: 6, precision: 2 })).to.equal('002.00')
  })

  it('applies the formatting of a sequence definition', () => {
    const definitions = connectionDefinitions({
      sn: { kind: 'sequence', initial: 123, step: 1, format: { pad: 6 } },
    })

    expect(resolve('${sn}', definitions)).to.equal('000123')
    expect(resolve('${sn}', definitions)).to.equal('000124')
  })

  it('keeps two decimal places in the rendered payload', () => {
    const definitions = connectionDefinitions({
      weight: { kind: 'sequence', initial: 2.5, step: 0.25, format: { precision: 2 } },
    })

    expect(resolve('{"weight":${weight}}', definitions)).to.equal('{"weight":2.50}')
    expect(resolve('{"weight":${weight}}', definitions)).to.equal('{"weight":2.75}')
  })
})

describe('stateful variables: captured and automatic replies', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  const replyRecord = () =>
    connectionRecord('reply-connection', {
      seq: { kind: 'sequence', initial: 10, step: 1 },
      cap: { kind: 'captured', value: 'default' },
    })

  const fixedRule = (overrides: Partial<AutoReplyRuleModel> = {}): AutoReplyRuleModel => ({
    id: 'rule-1',
    name: 'reply',
    enabled: true,
    matchTopic: 'in/#',
    matchCondition: '',
    reply: {
      topic: 'out/${seq}',
      mode: 'fixed',
      payload: '{"n":${seq},"cap":"${cap}"}',
      qos: 0,
      retain: false,
      delayMs: 0,
    },
    ...overrides,
  })

  it('resolves the default value of a captured variable', () => {
    const record = replyRecord()
    const definitions = connectionVariableDefinitions(record)

    expect(resolve('${cap}', definitions)).to.equal('default')
    expect(peekDefinitionValue(definitions.cap)).to.equal('default')
  })

  it('sets and resets a captured value through the automatic-reply actions', () => {
    const record = replyRecord()
    const definitions = connectionVariableDefinitions(record)

    applyAutoReplyVariableActions(record, { setVariables: [{ name: 'cap', value: '42' }] })
    expect(String(peekDefinitionValue(definitions.cap))).to.equal('42')
    expect(resolve('${cap}', definitions)).to.equal('42')

    applyAutoReplyVariableActions(record, { resetVariables: ['cap'] })
    expect(peekDefinitionValue(definitions.cap)).to.equal('default')

    // A constant or unknown name has no runtime state, so the action is ignored.
    applyAutoReplyVariableActions(record, { setVariables: [{ name: 'missing', value: 'x' }] })
    expect(peekDefinitionValue(definitions.cap)).to.equal('default')
  })

  it('exposes the resolved actions of a reply without executing them', () => {
    const record = replyRecord()
    const definitions = connectionVariableDefinitions(record)
    const rule = fixedRule({
      actions: {
        resetVariables: ['cap'],
        setVariables: [{ name: 'cap', value: 'id-${msg.msgId}' }],
      },
    })

    const [reply] = planAutoReplies([rule], {
      topic: 'in/device',
      payload: '{"msgId":"42"}',
      definitions,
    })

    expect(reply.error).to.equal(undefined)
    expect(reply.actions).to.deep.equal({
      resetVariables: ['cap'],
      setVariables: [{ name: 'cap', value: 'id-42' }],
    })
    // Planning does not apply the actions: the engine does that after a match.
    expect(peekDefinitionValue(definitions.cap)).to.equal('default')

    applyAutoReplyVariableActions(record, reply.actions)
    expect(resolve('${cap}', definitions)).to.equal('id-42')
  })

  it('advances a stateful variable once per reply, also when the topic and the payload use it', () => {
    const record = replyRecord()
    const definitions = connectionVariableDefinitions(record)

    const [first] = planAutoReplies([fixedRule()], { topic: 'in/device', payload: '{}', definitions })
    expect(first.error).to.equal(undefined)
    expect(first.topic).to.equal('out/10')
    expect(first.payload).to.equal('{"n":10,"cap":"default"}')
    expect(peekDefinitionValue(definitions.seq)).to.equal(11)

    const [second] = planAutoReplies([fixedRule()], { topic: 'in/device', payload: '{}', definitions })
    expect(second.topic).to.equal('out/11')
  })

  it('does not advance a stateful variable when the reply is only previewed', () => {
    const record = replyRecord()
    const definitions = connectionVariableDefinitions(record)

    const [reply] = planAutoReplies([fixedRule()], {
      topic: 'in/device',
      payload: '{}',
      definitions,
      commitCounters: false,
    })

    expect(reply.topic).to.equal('out/10')
    expect(peekDefinitionValue(definitions.seq)).to.equal(10)
  })

  it('advances a legacy ${count} once per reply', () => {
    const rule = fixedRule({
      reply: {
        topic: 'out/${count:1}',
        mode: 'fixed',
        payload: '{"n":${count:1}}',
        qos: 0,
        retain: false,
        delayMs: 0,
      },
    })

    const [first] = planAutoReplies([rule], { topic: 'in/device', payload: '{}' })
    expect(first.topic).to.equal('out/1')
    expect(first.payload).to.equal('{"n":1}')
    expect(readPayloadCounter('count')).to.equal(2)

    const [second] = planAutoReplies([rule], { topic: 'in/device', payload: '{}' })
    expect(second.topic).to.equal('out/2')
  })

  it('does not consume a counter of a reply that cannot be built', () => {
    writePayloadCounter('count', 5)
    const broken = fixedRule({
      reply: {
        topic: 'out/${count:1}/${nope}',
        mode: 'fixed',
        payload: '{}',
        qos: 0,
        retain: false,
        delayMs: 0,
      },
    })

    const [reply] = planAutoReplies([broken], { topic: 'in/device', payload: '{}' })
    expect(reply.error).to.contain('unresolved variables')
    expect(readPayloadCounter('count')).to.equal(5)
  })
})

describe('variable reset triggers: app start and automatic reconnect', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  after(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  const resolveValue = (
    name: string,
    definitions: { [name: string]: ResolvedVariableDefinition },
    connectionId?: string,
  ): string => resolvePayloadVariables('${' + name + '}', { definitions, connectionId }).text

  it('applies appStart once per connection and once for a shared global variable', () => {
    const initial = { kind: 'sequence' as const, initial: 10, step: 1, resetOn: ['appStart' as const] }
    const definitionsA = { v: connectionDefinition('v', initial, 'connection-a') }
    const definitionsB = { v: connectionDefinition('v', initial, 'connection-b') }
    const savedGlobal = saveGlobalVariable({
      name: 'shared',
      value: '100',
      definition: { kind: 'sequence', initial: 100, step: 1, resetOn: ['appStart'] },
    })
    const global = normalizeVariableDefinition(
      'shared',
      { kind: 'sequence', initial: 100, step: 1, resetOn: ['appStart'] },
      { scope: 'global', globalId: savedGlobal.id },
    )

    try {
      expect(resolveValue('v', definitionsA, 'connection-a')).to.equal('10')
      expect(resolveValue('v', definitionsB, 'connection-b')).to.equal('10')
      expect(resolveValue('shared', { shared: global })).to.equal('100')

      onConnectionEstablished(connectionRecord('connection-a', { v: initial }))
      expect(resolveValue('v', definitionsA, 'connection-a')).to.equal('10')
      // The shared global variable was reset with the first connection (state 100 -> 101).
      expect(resolveValue('shared', { shared: global })).to.equal('100')
      // B has not been used since the app started yet, so its value continues (state 11 -> 12).
      expect(resolveValue('v', definitionsB, 'connection-b')).to.equal('11')

      onConnectionEstablished(connectionRecord('connection-b', { v: initial }))
      expect(resolveValue('v', definitionsB, 'connection-b')).to.equal('10')
      // The global variable is shared: its app-start reset does not run again for the second connection.
      expect(resolveValue('shared', { shared: global })).to.equal('101')
    } finally {
      deleteGlobalVariable(savedGlobal.id)
    }
  })

  it('honours resetOnReconnect:false until the user disconnects manually', () => {
    const stored = { kind: 'sequence' as const, initial: 5, step: 1, resetOn: ['connect' as const] }
    const reconnectStored = { ...stored, resetOnReconnect: false }
    const definitions = { r: connectionDefinition('r', reconnectStored, 'connection-r') }
    const record = connectionRecord('connection-r', { r: reconnectStored })

    onConnectionEstablished(record)
    expect(resolveValue('r', definitions, 'connection-r')).to.equal('5')

    // An automatic reconnect keeps the value...
    onConnectionEstablished(record)
    expect(resolveValue('r', definitions, 'connection-r')).to.equal('6')

    // ...but a manual disconnect makes the next connect a fresh one.
    markManualDisconnect('connection-r')
    onConnectionEstablished(record)
    expect(resolveValue('r', definitions, 'connection-r')).to.equal('5')
  })
})

describe('stateful variable regressions reported by the review', () => {
  beforeEach(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  after(() => {
    resetAllVariableStates()
    resetPayloadCounters()
    resetLifecycleState()
  })

  const resolveValue = (
    name: string,
    definitions: { [name: string]: ResolvedVariableDefinition },
    connectionId?: string,
  ): string => resolvePayloadVariables('${' + name + '}', { definitions, connectionId }).text

  it('keeps a global session template and a global captured default value', () => {
    const session = saveGlobalVariable({
      name: 'dev',
      value: '',
      definition: { kind: 'session', generator: 'template', value: 'A-${uuid}' },
    })
    const captured = saveGlobalVariable({
      name: 'cap',
      value: '',
      definition: { kind: 'captured', value: 'default' },
    })
    try {
      const definitions = globalVariableDefinitions()
      const device = resolveValue('dev', definitions)
      expect(device).to.match(/^A-/)
      expect(device).to.not.equal(device.replace(/^A-/, ''))
      expect(resolveValue('cap', definitions)).to.equal('default')
    } finally {
      deleteGlobalVariable(session.id)
      deleteGlobalVariable(captured.id)
    }
  })

  it('advances the draw index of a seeded random walk instead of repeating one step', () => {
    const definition = connectionDefinition(
      'walk',
      { kind: 'randomWalk', initial: 0, range: 2, seed: 7, min: -100, max: 100 },
      'connection-walk',
    )
    const values = Array.from({ length: 6 }, () => resolveValue('walk', { walk: definition }, 'connection-walk'))
    expect(new Set(values).size).to.be.greaterThan(2)
  })

  it('keeps a decimal step free of float noise', () => {
    const definition = connectionDefinition('temp', { kind: 'sequence', initial: 1.5, step: 0.1 }, 'connection-temp')
    const values = Array.from({ length: 5 }, () => resolveValue('temp', { temp: definition }, 'connection-temp'))
    expect(values).to.deep.equal(['1.5', '1.6', '1.7', '1.8', '1.9'])
  })

  it('wraps a decimal sequence inside [min, max]', () => {
    const definition = connectionDefinition(
      'ratio',
      { kind: 'sequence', initial: 0, step: 0.4, min: 0, max: 1, onBound: 'wrap' },
      'connection-ratio',
    )
    const values = Array.from({ length: 6 }, () => resolveValue('ratio', { ratio: definition }, 'connection-ratio'))
    expect(values.map(Number).every((value) => value >= 0 && value <= 1)).to.equal(true)
    expect(values.slice(0, 4)).to.deep.equal(['0', '0.4', '0.8', '0.2'])
  })
})
