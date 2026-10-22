import { expect } from 'chai'
import { planAutoReplies, renderReplyTemplate } from '@/utils/autoReply'
import {
  normalizeVariableMap,
  readConnectionSession,
  resetAllVariableStates,
  startConnectionSession,
} from '@/utils/payloadVariables'

/** The rule of the WIFI re-connect scenario: answer a command with the same message plus a code. */
const createRule = (overrides: Partial<AutoReplyRuleModel> = {}): AutoReplyRuleModel => ({
  id: 'rule-1',
  name: 'WIFI重连应答',
  enabled: true,
  matchTopic: 'app/+/+/device/system/post',
  matchCondition: "cmd == 'WIFI_RECONNECT_SERVICE'",
  reply: {
    topic: 'app/${productType}/+/device/system/reply',
    mode: 'echo',
    payload: '{"code":0,"msg":null}',
    qos: 1,
    retain: false,
    delayMs: 0,
  },
  ...overrides,
})

const createContext = (payload: string, variables: { [name: string]: string } = { productType: 'A1' }) => ({
  topic: 'app/A1/AF0201/device/system/post',
  payload,
  variables,
})

describe('autoReply utility', () => {
  it('answers a matching command with the received message plus the configured fields', () => {
    const message = { cmd: 'WIFI_RECONNECT_SERVICE', ts: 1654766480047, msgId: '1553953167238107136' }
    const replies = planAutoReplies([createRule()], createContext(JSON.stringify(message)))

    expect(replies).to.have.lengthOf(1)
    expect(replies[0].topic).to.equal('app/A1/+/device/system/reply')
    expect(JSON.parse(replies[0].payload)).to.deep.equal({
      cmd: 'WIFI_RECONNECT_SERVICE',
      ts: 1654766480047,
      msgId: '1553953167238107136',
      code: 0,
      msg: null,
    })
    expect(replies[0].qos).to.equal(1)
  })

  it('ignores messages whose condition does not hold', () => {
    const other = { cmd: 'WIFI_OTHER', msgId: '1' }
    expect(planAutoReplies([createRule()], createContext(JSON.stringify(other)))).to.have.lengthOf(0)
  })

  it('ignores messages of another topic and disabled rules', () => {
    const message = JSON.stringify({ cmd: 'WIFI_RECONNECT_SERVICE' })
    const otherTopic = { ...createContext(message), topic: 'app/A1/AF0201/device/other/post' }
    expect(planAutoReplies([createRule()], otherTopic)).to.have.lengthOf(0)
    expect(planAutoReplies([createRule({ enabled: false })], createContext(message))).to.have.lengthOf(0)
  })

  it('matches every message when no condition is configured', () => {
    const replies = planAutoReplies([createRule({ matchCondition: '' })], createContext('{"a":1}'))
    expect(replies).to.have.lengthOf(1)
    expect(JSON.parse(replies[0].payload)).to.deep.equal({ a: 1, code: 0, msg: null })
  })

  it('reports a broken condition instead of answering', () => {
    const replies = planAutoReplies([createRule({ matchCondition: 'cmd ==' })], createContext('{"cmd":"x"}'))
    expect(replies).to.have.lengthOf(1)
    expect(replies[0].topic).to.equal('')
    expect(replies[0].error).to.be.a('string')
  })

  it('builds a fixed reply with the fields of the received message and the connection variables', () => {
    const rule = createRule({
      matchTopic: 'app/+/+/device/system/post',
      matchCondition: "cmd == 'PING'",
      reply: {
        topic: 'app/${productType}/${clientId}/device/system/reply',
        mode: 'fixed',
        payload: '{"req":"${msg.msgId}","device":"${productType}","pong":true}',
        qos: 0,
        retain: false,
        delayMs: 1500,
      },
    })
    const replies = planAutoReplies([rule], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"cmd":"PING","msgId":"42"}',
      variables: { productType: 'A1', clientId: 'AF0201' },
    })

    expect(replies).to.have.lengthOf(1)
    expect(replies[0].topic).to.equal('app/A1/AF0201/device/system/reply')
    expect(JSON.parse(replies[0].payload)).to.deep.equal({ req: '42', device: 'A1', pong: true })
    expect(replies[0].delayMs).to.equal(1500)
  })

  it('only skips the rules that match the message', () => {
    const other = createRule({
      id: 'rule-2',
      matchTopic: 'app/+/+/device/other/#',
      matchCondition: '',
      reply: { ...createRule().reply, topic: 'x/y/z' },
    })
    const replies = planAutoReplies([createRule(), other], createContext('{"cmd":"WIFI_RECONNECT_SERVICE"}'))
    expect(replies.map((reply) => reply.ruleId)).to.deep.equal(['rule-1'])
  })

  it('renders message fields, the topic and payload variables', () => {
    const rendered = renderReplyTemplate('${topic} -> ${msg.data.list[0].id} / ${clientId} / ${msg.missing}', {
      topic: 'a/b',
      msg: { data: { list: [{ id: 'first' }] } },
      variables: { clientId: 'c1' },
    })
    expect(rendered).to.equal('a/b -> first / c1 / ')
  })
})

/**
 * The NTP scenario: the device message carries a 20 digit `msgId`, and the reply echoes it with
 * `${msg.msgId}`. The digits have to survive the round trip.
 */
describe('auto reply match topic with variables', () => {
  it('resolves a client/global variable of the filter from the definitions', () => {
    const rule = createRule({
      matchTopic: 'app/${productType}/+/device/system/post',
      matchCondition: '',
    })
    const replies = planAutoReplies([rule], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"cmd":"X"}',
      definitions: normalizeVariableMap({ productType: 'A1' }),
      connectionId: 'connection-filter',
    })

    expect(replies).to.have.lengthOf(1)
    expect(replies[0].error).to.equal(undefined)
    expect(replies[0].topic).to.equal('app/A1/+/device/system/reply')
  })
})

describe('auto reply with a big integer field', () => {
  const received = '{"cmd":"NTP_SYNC","ts":1792486795034,"msgId":16541683218561123115,"timezone":8}'
  const rule = (overrides: Partial<AutoReplyRuleModel> = {}): AutoReplyRuleModel => ({
    id: 'ntp-rule',
    name: 'NTP 应答',
    enabled: true,
    matchTopic: 'app/+/+/device/ntp/sub',
    matchCondition: '',
    reply: {
      topic: 'app/${productType}/${clientId}/device/ntp/post',
      mode: 'fixed',
      payload: '{"cmd":"NTP","ts":${msg.ts},"msgId":${msg.msgId},"code":0}',
      qos: 0,
      retain: false,
      delayMs: 0,
    },
    ...overrides,
  })

  it('renders the exact digits when the template injects them unquoted', () => {
    const [reply] = planAutoReplies([rule()], {
      topic: 'app/ACME900/AF020120F9CA37EX/device/ntp/sub',
      payload: received,
      variables: { productType: 'ACME900', clientId: 'AF020120F9CA37EX' },
    })
    expect(reply.error).to.equal(undefined)
    expect(reply.payload).to.contain('"msgId":16541683218561123115')
    expect(reply.payload).to.not.contain('16541683218561122000')
  })

  it('keeps the digits when the template quotes the field', () => {
    const quoted = rule({
      reply: {
        topic: 'app/device/ntp/post',
        mode: 'fixed',
        payload: '{"msgId":"${msg.msgId}"}',
        qos: 0,
        retain: false,
        delayMs: 0,
      },
    })
    const [reply] = planAutoReplies([quoted], { topic: 'app/+/+/device/ntp/sub', payload: received })
    expect(reply.payload).to.equal('{"msgId":"16541683218561123115"}')
  })

  it('echoes a big integer as the exact digits too', () => {
    const echoed = rule({
      reply: {
        topic: 'app/device/ntp/post',
        mode: 'echo',
        payload: '{"code":0}',
        qos: 0,
        retain: false,
        delayMs: 0,
      },
    })
    const [reply] = planAutoReplies([echoed], { topic: 'app/+/+/device/ntp/sub', payload: received })
    expect(reply.error).to.equal(undefined)
    expect(reply.payload).to.contain('"msgId":"16541683218561123115"')
    expect(reply.payload).to.contain('"code":0')
  })
})

describe('planAutoReplies payload parsing', () => {
  const rule = (id: string, condition: string): AutoReplyRuleModel => ({
    id,
    name: id,
    enabled: true,
    matchTopic: 'app/+/+/device/system/post',
    matchCondition: condition,
    reply: {
      topic: 'app/device/system/reply',
      mode: 'fixed',
      payload: '{"code":0}',
      qos: 0,
      retain: false,
      delayMs: 0,
    },
  })

  it('matches every rule against the payload parsed once, not once per rule', () => {
    // A caller that parsed the message hands the value over; every rule has to see that value even
    // though `payload` alone would parse to something else.
    const replies = planAutoReplies([rule('a', 'code == `0`')], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"code":9}',
      parsed: { value: { code: 0 } },
    })
    expect(replies).to.have.lengthOf(1)
    expect(replies[0].error).to.equal(undefined)
  })

  it('still parses for itself when a single rule is matched on its own', () => {
    // `matchesAutoReplyRule` is exported: without `parsed` it must keep working as before.
    const replies = planAutoReplies([rule('a', 'code == `0`')], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"code":0}',
    })
    expect(replies).to.have.lengthOf(1)
  })

  it('skips a rule whose payload is not JSON', () => {
    const replies = planAutoReplies([rule('a', 'code == `0`')], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{oops}',
    })
    expect(replies).to.have.lengthOf(0)
  })
})

describe('auto reply templates with arithmetic', () => {
  const rule = (topic: string, payload: string): AutoReplyRuleModel => ({
    id: 'arithmetic-rule',
    name: 'arithmetic',
    enabled: true,
    matchTopic: 'app/+/+/device/ntp/sub',
    matchCondition: '',
    reply: { topic, mode: 'fixed', payload, qos: 0, retain: false, delayMs: 0 },
  })
  const received = '{"cmd":"NTP_SYNC","ts":1792486795034,"timezone":8}'

  it('answers with a received timestamp shifted by the configured offset', () => {
    const [reply] = planAutoReplies([rule('app/device/ntp/post', '{"ts":${msg.ts - 34000}}')], {
      topic: 'app/ACME900/AF01/device/ntp/sub',
      payload: received,
    })
    expect(reply.error).to.equal(undefined)
    expect(reply.payload).to.equal('{"ts":1792486761034}')
  })

  it('can combine the received timezone and a received timestamp', () => {
    const [reply] = planAutoReplies([rule('app/device/ntp/post', '{"h":${msg.timezone * 3600}}')], {
      topic: 'app/ACME900/AF01/device/ntp/sub',
      payload: received,
    })
    expect(reply.payload).to.equal('{"h":28800}')
  })

  it('still prints a received field without arithmetic, and keeps a hyphenated key intact', () => {
    const [plain] = planAutoReplies([rule('app/device/ntp/post', '{"ts":${msg.ts}}')], {
      topic: 'app/ACME900/AF01/device/ntp/sub',
      payload: received,
    })
    expect(plain.payload).to.equal('{"ts":1792486795034}')

    const [hyphen] = planAutoReplies([rule('app/device/ntp/post', '{"v":"${msg.sensor-1}"}')], {
      topic: 'app/ACME900/AF01/device/ntp/sub',
      payload: '{"sensor-1":"ok"}',
    })
    expect(hyphen.payload).to.equal('{"v":"ok"}')
  })
})

/**
 * A reply template that still contains a placeholder is meaningless: there is no user to ask, so the
 * rule is skipped and the reason is reported instead of publishing `${nope}` literally.
 */
describe('auto reply templates with an unresolved variable', () => {
  const rule = (topic: string, payload: string): AutoReplyRuleModel => ({
    id: 'unresolved-rule',
    name: 'unresolved',
    enabled: true,
    matchTopic: 'app/+/+/device/system/post',
    matchCondition: '',
    reply: { topic, mode: 'fixed', payload, qos: 0, retain: false, delayMs: 0 },
  })

  it('skips a rule whose reply still contains an unknown variable', () => {
    const replies = planAutoReplies([rule('app/${nope}/reply', '{"value":"${nope}"}')], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"cmd":"PING"}',
    })

    expect(replies).to.have.lengthOf(1)
    expect(replies[0].topic).to.equal('')
    expect(replies[0].payload).to.equal('')
    expect(replies[0].error).to.be.a('string')
    expect(replies[0].error).to.contain('unresolved variables')
    expect(replies[0].error).to.contain('nope')
  })

  it('reports an unknown variable that only appears in the reply payload', () => {
    const replies = planAutoReplies([rule('app/device/system/reply', '{"value":"${nope}"}')], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"cmd":"PING"}',
    })

    expect(replies).to.have.lengthOf(1)
    expect(replies[0].topic).to.equal('')
    expect(replies[0].payload).to.equal('')
    expect(replies[0].error).to.contain('unresolved variables')
  })

  it('skips only the rule with the unknown variable, not the other rules of the message', () => {
    const broken: AutoReplyRuleModel = {
      ...rule('app/device/system/reply', '{"value":"${nope}"}'),
      id: 'broken-rule',
    }
    const good = createRule({ matchCondition: '' })

    const replies = planAutoReplies([broken, good], createContext('{"cmd":"WIFI_RECONNECT_SERVICE"}'))

    expect(replies).to.have.lengthOf(2)
    expect(replies[0].error).to.contain('unresolved variables')
    expect(replies[0].topic).to.equal('')
    expect(replies[1].error).to.equal(undefined)
    expect(replies[1].topic).to.equal('app/A1/+/device/system/reply')
  })
})

describe('auto reply match topic templates', () => {
  it('reports an unresolved variable in the match topic instead of silently never matching', () => {
    const rule = createRule({ matchTopic: 'app/${nope}/#', matchCondition: '' })
    const replies = planAutoReplies([rule], createContext('{"cmd":"x"}'))

    expect(replies).to.have.lengthOf(1)
    expect(replies[0].error).to.contain('unresolved variables in match topic')
    expect(replies[0].topic).to.equal('')
  })
})

describe('auto reply to a payload that is not JSON', () => {
  it('renders a message field as empty instead of failing the rule', () => {
    const rule = createRule({
      matchCondition: '',
      reply: {
        topic: 'out/x',
        mode: 'fixed',
        payload: '{"v":"${msg.x}","t":"${topic}"}',
        qos: 0,
        retain: false,
        delayMs: 0,
      },
    })
    const [reply] = planAutoReplies([rule], createContext('PING'))

    expect(reply.error).to.equal(undefined)
    expect(reply.payload).to.equal('{"v":"","t":"app/A1/AF0201/device/system/post"}')
  })
})

/**
 * The new capability of the one-pass resolver: a user variable value may reference a field of the
 * received message, because the message provider is part of the same chain.
 */
describe('auto reply templates read the message through a user variable', () => {
  const fixedRule = createRule({
    matchCondition: '',
    reply: {
      topic: 'app/${productType}/device/system/reply',
      mode: 'fixed',
      payload: '{"ack":"${ack}","topic":"${topic}"}',
      qos: 0,
      retain: false,
      delayMs: 0,
    },
  })

  it('resolves a message field and the topic inside a user variable', () => {
    const [reply] = planAutoReplies([fixedRule], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"msgId":"42"}',
      variables: { productType: 'A1', ack: 'id-${msg.msgId}' },
    })

    expect(reply.error).to.equal(undefined)
    expect(reply.payload).to.equal('{"ack":"id-42","topic":"app/A1/AF0201/device/system/post"}')
  })

  it('resolves a message field inside a user variable of an echo reply', () => {
    const echoRule = createRule({
      matchCondition: '',
      reply: {
        topic: 'app/${productType}/device/system/reply',
        mode: 'echo',
        payload: '{"ack":"${ack}"}',
        qos: 0,
        retain: false,
        delayMs: 0,
      },
    })
    const [reply] = planAutoReplies([echoRule], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"cmd":"PING","msgId":"42"}',
      variables: { productType: 'A1', ack: 'id-${msg.msgId}' },
    })

    expect(reply.error).to.equal(undefined)
    expect(JSON.parse(reply.payload)).to.deep.equal({ cmd: 'PING', msgId: '42', ack: 'id-42' })
  })
})

describe('auto reply static templates', () => {
  beforeEach(() => {
    resetAllVariableStates()
  })

  after(() => {
    resetAllVariableStates()
  })

  it('advances the session message counter although no resolver is built', () => {
    startConnectionSession('conn-static', 1000)
    const rule = createRule({
      matchCondition: '',
      reply: { topic: 'out/static', mode: 'fixed', payload: '{"ok":true}', qos: 0, retain: false, delayMs: 0 },
    })
    const replies = planAutoReplies([rule], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"cmd":"X"}',
      connectionId: 'conn-static',
    })

    expect(replies).to.have.lengthOf(1)
    expect(replies[0].error).to.equal(undefined)
    expect(readConnectionSession('conn-static')?.sentCount).to.equal(1)
  })

  it('does not advance it for a preview', () => {
    startConnectionSession('conn-static-preview', 1000)
    const rule = createRule({
      matchCondition: '',
      reply: { topic: 'out/static', mode: 'fixed', payload: '{"ok":true}', qos: 0, retain: false, delayMs: 0 },
    })
    planAutoReplies([rule], {
      topic: 'app/A1/AF0201/device/system/post',
      payload: '{"cmd":"X"}',
      connectionId: 'conn-static-preview',
      commitCounters: false,
    })
    expect(readConnectionSession('conn-static-preview')?.sentCount).to.equal(0)
  })
})
