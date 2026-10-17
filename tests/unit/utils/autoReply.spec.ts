import { expect } from 'chai'
import { planAutoReplies, renderReplyTemplate } from '@/utils/autoReply'

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
