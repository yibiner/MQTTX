import { expect } from 'chai'
import { createMessageSequenceRunner, SequencePublish, MAX_STEPS_PER_SECOND } from '@/utils/messageSequenceRunner'

const step = (overrides: Partial<MessageSequenceStepModel> = {}): MessageSequenceStepModel => ({
  id: `step-${Math.random().toString(16).slice(2)}`,
  delayMs: 0,
  topic: 'app/dev/step',
  payload: '{}',
  qos: 0 as QoS,
  retain: false,
  ...overrides,
})

const createConnect = (overrides: Partial<ConnectionModel> = {}): ConnectionModel =>
  ({
    id: 'conn-sequence',
    clientId: 'dev-1',
    name: 'dev',
    host: '127.0.0.1',
    port: 8083,
    protocol: 'ws',
    mqttVersion: '3.1.1',
    subscriptions: [],
    variables: {},
    ...overrides,
  } as unknown as ConnectionModel)

const sequence = (overrides: Partial<MessageSequenceModel> = {}): MessageSequenceModel =>
  ({
    id: 'seq-1',
    name: 'boot',
    enabled: true,
    trigger: 'manual',
    matchTopic: '',
    matchCondition: '',
    loop: false,
    stopWhen: null,
    steps: [step({ topic: 'app/dev/one' }), step({ topic: 'app/dev/two' })],
    ...overrides,
  } as MessageSequenceModel)

const setup = (connection: ConnectionModel) => {
  const published: SequencePublish[] = []
  const stopped: Array<{ id: string; reason: string }> = []
  const runner = createMessageSequenceRunner({
    connection,
    publish: (message) => {
      published.push(message)
    },
    onStopped: (id, reason) => stopped.push({ id, reason }),
  })
  return { runner, published, stopped }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('message sequences (web build)', () => {
  it('sends the steps in order', async () => {
    const { runner, published } = setup(createConnect({ messageSequences: [sequence()] }))

    runner.start('seq-1')
    await wait(60)

    expect(published.map((message) => message.topic)).to.deep.equal(['app/dev/one', 'app/dev/two'])
    expect(runner.runningIds()).to.deep.equal([])
  })

  it('waits for the delay of each step', async () => {
    const { runner, published } = setup(
      createConnect({
        messageSequences: [
          sequence({
            steps: [step({ topic: 'app/dev/first', delayMs: 60 }), step({ topic: 'app/dev/second', delayMs: 0 })],
          }),
        ],
      }),
    )

    runner.start('seq-1')
    expect(published).to.have.length(1)
    await wait(140)
    expect(published.map((message) => message.topic)).to.deep.equal(['app/dev/first', 'app/dev/second'])
  })

  it('resolves the variables of a step', () => {
    const connection = createConnect({
      variables: { productType: 'gateway' },
      messageSequences: [
        sequence({ steps: [step({ topic: 'app/${productType}/${clientId}/boot', payload: '{"d":"${clientId}"}' })] }),
      ],
    })
    const { runner, published } = setup(connection)

    runner.start('seq-1')

    expect(published[0].topic).to.equal('app/gateway/dev-1/boot')
    expect(published[0].payload).to.equal('{"d":"dev-1"}')
  })

  it('does not start a disabled sequence', () => {
    const { runner, published } = setup(createConnect({ messageSequences: [sequence({ enabled: false })] }))

    expect(runner.start('seq-1')).to.equal(false)
    expect(published).to.have.length(0)
  })

  it('stops when a step has no topic and says why', () => {
    const { runner, published, stopped } = setup(
      createConnect({ messageSequences: [sequence({ steps: [step({ topic: '   ' })] })] }),
    )

    runner.start('seq-1')

    expect(published).to.have.length(0)
    expect(stopped).to.have.length(1)
    expect(stopped[0].reason).to.contain('no topic')
  })

  it('starts the connect-triggered sequences only', () => {
    const { runner, published } = setup(
      createConnect({
        messageSequences: [
          sequence({ id: 'seq-connect', trigger: 'connect', steps: [step({ topic: 'app/dev/on-connect' })] }),
          sequence({ id: 'seq-manual', trigger: 'manual', steps: [step({ topic: 'app/dev/manual' })] }),
        ],
      }),
    )

    runner.startOnConnect()

    expect(published.map((message) => message.topic)).to.deep.equal(['app/dev/on-connect'])
  })

  it('stops a running sequence on request', async () => {
    const { runner, published } = setup(
      createConnect({
        messageSequences: [sequence({ steps: [step({ topic: 'app/dev/one', delayMs: 60 }), step({ topic: 'app/dev/two' })] })],
      }),
    )

    runner.start('seq-1')
    runner.stop('seq-1')
    await wait(140)

    expect(published.map((message) => message.topic)).to.deep.equal(['app/dev/one'])
    expect(runner.runningIds()).to.deep.equal([])
  })

  it('counts the runs it stopped', async () => {
    const { runner } = setup(
      createConnect({
        messageSequences: [sequence({ steps: [step({ topic: 'app/dev/slow', delayMs: 100 })] })],
      }),
    )

    runner.start('seq-1')
    expect(runner.stopAll()).to.equal(1)
    expect(runner.runningIds()).to.deep.equal([])
    await wait(140)
  })

  describe('message trigger', () => {
    it('starts a sequence whose topic filter and condition match', () => {
      const { runner, published } = setup(
        createConnect({
          messageSequences: [
            sequence({
              trigger: 'message',
              matchTopic: 'app/+/cmd',
              matchCondition: 'cmd == `reboot`',
              steps: [step({ topic: 'app/dev/rebooting' })],
            }),
          ],
        }),
      )

      runner.handleIncoming('app/dev/cmd', '{"cmd":"reboot"}')

      expect(published.map((message) => message.topic)).to.deep.equal(['app/dev/rebooting'])
    })

    it('does not start when the condition does not match', () => {
      const { runner, published } = setup(
        createConnect({
          messageSequences: [
            sequence({
              trigger: 'message',
              matchTopic: 'app/+/cmd',
              matchCondition: 'cmd == `reboot`',
              steps: [step({ topic: 'app/dev/rebooting' })],
            }),
          ],
        }),
      )

      runner.handleIncoming('app/dev/cmd', '{"cmd":"stay"}')

      expect(published).to.have.length(0)
    })

    it('is not retriggered by the echo of its own publish', async () => {
      const { runner, published } = setup(
        createConnect({
          messageSequences: [
            sequence({
              trigger: 'message',
              matchTopic: 'app/dev/tick',
              steps: [step({ topic: 'app/dev/tick', payload: '1' })],
            }),
          ],
        }),
      )

      runner.handleIncoming('app/dev/tick', 'incoming')
      const afterFirst = published.length
      // The broker echoes what the sequence just sent, with the payload it sent.
      runner.handleIncoming('app/dev/tick', published[published.length - 1].payload)
      await wait(20)

      expect(published.length).to.equal(afterFirst)
    })
  })

  it('stops a delay-0 loop that spins', async () => {
    const { runner, stopped } = setup(
      createConnect({
        messageSequences: [
          sequence({ loop: true, steps: [step({ topic: 'app/dev/spin', delayMs: 0 })] }),
        ],
      }),
    )

    runner.start('seq-1')
    await wait(50)

    expect(stopped.some((item) => item.reason.includes(String(MAX_STEPS_PER_SECOND)))).to.equal(true)
    expect(runner.runningIds()).to.deep.equal([])
  })

  it('writes a step assignment before the next step reads it', async () => {
    const connection = createConnect({
      variables: { water: { kind: 'captured', value: '2000' } as VariableDefinitionConfig },
      messageSequences: [
        sequence({
          steps: [
            step({
              topic: 'app/dev/water',
              payload: '{"remaining":${water}}',
              actions: { setVariables: [{ name: 'water', value: '${water - 20}' }] },
            }),
            step({ topic: 'app/dev/water', payload: '{"remaining":${water}}' }),
          ],
        }),
      ],
    })
    const { runner, published } = setup(connection)

    runner.start('seq-1')
    await wait(40)

    expect(published.map((message) => message.payload)).to.deep.equal([
      '{"remaining":2000}',
      '{"remaining":1980}',
    ])
    runner.dispose()
  })

  it('keeps a 64-bit id from the message that started the sequence', () => {
    const { runner, published } = setup(
      createConnect({
        messageSequences: [
          sequence({
            trigger: 'message',
            matchTopic: 'app/+/cmd',
            steps: [step({ topic: 'app/dev/ack', payload: '{"id":"${msg.msgId}"}' })],
          }),
        ],
      }),
    )

    runner.handleIncoming('app/dev/cmd', '{"msgId":16541683218561123115}')

    expect(published[0].payload).to.equal('{"id":"16541683218561123115"}')
  })

  it('stops a loop when the stop condition is met', async () => {
    const connection = createConnect({
      variables: { counter: { kind: 'sequence', initial: 1, step: 1 } as VariableDefinitionConfig },
      messageSequences: [
        sequence({
          loop: true,
          stopWhen: { variable: 'counter', op: 'gte', value: 1 } as MessageSequenceStopWhen,
          steps: [step({ topic: 'app/dev/${counter}', delayMs: 0 })],
        }),
      ],
    })
    const { runner, published } = setup(connection)

    runner.start('seq-1')
    await wait(60)

    // The counter starts at 1, so the first round already satisfies `>= 1`: one round, then stop.
    expect(published).to.have.length(1)
    expect(runner.runningIds()).to.deep.equal([])
  })
})
