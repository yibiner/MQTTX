import { expect } from 'chai'
import { createAutoReplyRunner, AutoReplyMessage, MAX_REPLIES_PER_SECOND } from '@/utils/autoReplyRunner'

const createConnection = (rules: Partial<AutoReplyRuleModel>[]): ConnectionModel =>
  ({
    id: 'conn-autoreply',
    clientId: 'dev-1',
    name: 'dev',
    host: '127.0.0.1',
    port: 8083,
    protocol: 'ws',
    mqttVersion: '3.1.1',
    subscriptions: [],
    variables: {},
    autoReplies: rules.map((rule, index) => ({
      id: `rule-${index}`,
      name: `rule ${index}`,
      enabled: true,
      matchTopic: 'app/dev/cmd',
      matchCondition: '',
      ...rule,
      // Merged, not replaced: a test that only sets a delay keeps the rest of the reply.
      reply: {
        topic: 'app/dev/ack',
        mode: 'fixed' as const,
        payload: '{"ok":true}',
        qos: 0 as QoS,
        retain: false,
        delayMs: 0,
        ...(rule.reply ?? {}),
      },
    })) as AutoReplyRuleModel[],
  } as unknown as ConnectionModel)

const setup = (rules: Partial<AutoReplyRuleModel>[], clock = { now: 1000 }) => {
  const published: AutoReplyMessage[] = []
  const errors: Array<{ ruleId: string; error: string }> = []
  const runner = createAutoReplyRunner({
    connection: createConnection(rules),
    publish: (message) => {
      published.push(message)
    },
    onRuleError: (ruleId, error) => errors.push({ ruleId, error }),
    now: () => clock.now,
  })
  return { runner, published, errors, clock }
}

describe('automatic replies (web build)', () => {
  it('answers a message that matches the topic filter', () => {
    const { runner, published } = setup([{ matchTopic: 'app/+/cmd' }])

    runner.handleIncoming('app/dev/cmd', '{"cmd":"reboot"}')

    expect(published).to.have.length(1)
    expect(published[0].topic).to.equal('app/dev/ack')
    expect(published[0].payload).to.equal('{"ok":true}')
  })

  it('stays quiet for a message that does not match', () => {
    const { runner, published } = setup([{ matchTopic: 'app/+/cmd' }])

    runner.handleIncoming('other/dev/cmd', '{}')

    expect(published).to.have.length(0)
  })

  it('does not answer when the rule is disabled', () => {
    const { runner, published } = setup([{ enabled: false }])

    runner.handleIncoming('app/dev/cmd', '{}')

    expect(published).to.have.length(0)
  })

  it('answers a redelivered packet once, and still answers a new packet on the same topic', () => {
    const { runner, published, clock } = setup([{}])

    runner.handleIncoming('app/dev/cmd', '{"n":1}', 7)
    clock.now += 1000
    runner.handleIncoming('app/dev/cmd', '{"n":2}', 7)

    expect(published).to.have.length(1)

    // A different packet is a different message, even on the same topic.
    runner.handleIncoming('app/dev/cmd', '{"n":3}', 8)
    expect(published).to.have.length(2)

    // After the window the same packet is answered again.
    clock.now += 61000
    runner.handleIncoming('app/dev/cmd', '{"n":1}', 7)
    expect(published).to.have.length(3)
  })

  it('answers every QoS 0 message, which has no packet id to dedupe', () => {
    const { runner, published } = setup([{}])

    runner.handleIncoming('app/dev/cmd', '{"n":1}')
    runner.handleIncoming('app/dev/cmd', '{"n":2}')

    expect(published).to.have.length(2)
  })

  it('ignores its own reply coming back from the broker', () => {
    const { runner, published, clock } = setup([{ matchTopic: 'app/+/ack' }])

    // The engine answered on app/dev/ack; that publication is echoed back.
    runner.handleIncoming('app/dev/ack', '{"ok":true}')
    const afterFirst = published.length
    clock.now += 1000
    runner.handleIncoming('app/dev/ack', '{"ok":true}')

    expect(published.length).to.equal(afterFirst)

    // A different payload on the reply topic is the device, not the echo.
    runner.handleIncoming('app/dev/ack', '{"ok":false}')
    expect(published.length).to.equal(afterFirst + 1)
  })

  it('publishes a delayed reply only after its delay', async () => {
    const { runner, published } = setup([{ reply: { delayMs: 60 } as $TSFixed }])

    runner.handleIncoming('app/dev/cmd', '{}')
    expect(published).to.have.length(0)
    expect(runner.pendingCount()).to.equal(1)

    await new Promise((resolve) => setTimeout(resolve, 140))
    expect(published).to.have.length(1)
    expect(runner.pendingCount()).to.equal(0)
  })

  it('caps the replies per second', () => {
    const { runner, published } = setup([{ matchTopic: 'app/+/cmd' }])

    for (let index = 0; index < MAX_REPLIES_PER_SECOND + 5; index += 1) {
      runner.handleIncoming(`app/dev${index}/cmd`, '{}')
    }

    expect(published).to.have.length(MAX_REPLIES_PER_SECOND)
  })

  it('does not remember a reply the rate limit dropped', () => {
    const { runner, published, clock } = setup([{ matchTopic: 'app/+/cmd' }])

    for (let index = 0; index < MAX_REPLIES_PER_SECOND; index += 1) {
      runner.handleIncoming(`app/dev${index}/cmd`, '{}', index + 1)
    }
    runner.handleIncoming('app/later/cmd', '{}', 99)
    expect(published).to.have.length(MAX_REPLIES_PER_SECOND)

    clock.now += 1000
    runner.handleIncoming('app/later/cmd', '{}', 99)
    expect(published).to.have.length(MAX_REPLIES_PER_SECOND + 1)
  })

  it('reports a rule that cannot be built instead of throwing', () => {
    const { runner, errors, published } = setup([{ matchCondition: '===' }])

    runner.handleIncoming('app/dev/cmd', '{}')

    expect(published).to.have.length(0)
    expect(errors).to.have.length(1)
  })

  it('cancels a delayed reply when disposed', async () => {
    const { runner, published } = setup([{ reply: { delayMs: 80 } as $TSFixed }])

    runner.handleIncoming('app/dev/cmd', '{}')
    runner.dispose()
    await new Promise((resolve) => setTimeout(resolve, 140))

    expect(published).to.have.length(0)
  })
})
