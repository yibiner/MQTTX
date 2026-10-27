import { expect } from 'chai'
import { EventEmitter } from 'events'
import type { MqttClient } from 'mqtt'
import { publishedPayloadType } from '@/utils/historyRecordUtils'
import {
  attachMessageSequences,
  onMessageSequencePublished,
  registerMessageSequences,
  resetMessageSequenceState,
  runningMessageSequenceIds,
  startMessageSequence,
  stopMessageSequence,
} from '@/utils/messageSequenceEngine'
import { createOtaSequence, createWaterCycleSequence } from '@/utils/messageSequenceExamples'
import {
  clearConnectionVariableValues,
  connectionVariableDefinitions,
  peekDefinitionValue,
} from '@/utils/payloadVariables'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The engine only needs `connected`, `publish()` and the event surface. */
const createClient = (published: Array<{ topic: string; payload: string }>) => {
  const client = Object.assign(new EventEmitter(), {
    connected: true,
    publish: (topic: string, payload: string, _options: unknown, callback?: (error?: Error) => void) => {
      published.push({ topic, payload })
      callback?.()
    },
  })
  return client as unknown as MqttClient & EventEmitter
}

const step = (
  id: string,
  delayMs: number,
  payload: string,
  extra: Partial<MessageSequenceStepModel> = {},
): MessageSequenceStepModel => ({
  id,
  delayMs,
  topic: extra.topic ?? 'device/report',
  payload,
  qos: 0,
  retain: false,
  ...extra,
})

const sequence = (overrides: Partial<MessageSequenceModel> = {}): MessageSequenceModel => ({
  id: 'seq',
  name: 'seq',
  enabled: true,
  trigger: 'manual',
  matchTopic: '',
  matchCondition: '',
  loop: false,
  steps: [step('s0', 0, 'hello')],
  ...overrides,
})

const connection = (id: string, water: string | undefined, item: MessageSequenceModel): ConnectionModel =>
  ({
    id,
    clientId: 'dev-1',
    ...(water === undefined ? {} : { variables: { water: { kind: 'captured', value: water, resetOn: [] } } }),
    messageSequences: [item],
  } as ConnectionModel)

describe('publishedPayloadType', () => {
  it('marks a JSON object or array as JSON and leaves other text plaintext', () => {
    expect(publishedPayloadType('{"a":1}')).to.equal('JSON')
    expect(publishedPayloadType('  [1, 2] ')).to.equal('JSON')
    expect(publishedPayloadType('plain')).to.equal('Plaintext')
    expect(publishedPayloadType('{bad')).to.equal('Plaintext')
    expect(publishedPayloadType('')).to.equal('Plaintext')
  })
})

describe('message sequence examples', () => {
  it('builds the water cycle: current level, then -20, -20, -30, until water is below 500', () => {
    const water = createWaterCycleSequence()
    expect(water.trigger).to.equal('connect')
    expect(water.loop).to.equal(true)
    expect(water.stopWhen).to.deep.equal({ variable: 'water', op: 'lt', value: 500 })
    expect(water.steps.map((item) => item.delayMs)).to.deep.equal([0, 60000, 300000, 300000])
    expect(water.steps[0].actions).to.equal(undefined)
    expect(water.steps[1].payload).to.contain('${water - 20}')
    expect(water.steps[1].actions?.setVariables?.[0]).to.deep.equal({ name: 'water', value: '${water - 20}' })
    expect(water.steps[2].actions?.setVariables?.[0].value).to.equal('${water - 20}')
    expect(water.steps[3].payload).to.contain('${water - 30}')
    expect(water.steps[3].actions?.setVariables?.[0].value).to.equal('${water - 30}')
  })

  it('builds the OTA progress from the command: ack at 1s, 0% at 10s, then 20s steps', () => {
    const ota = createOtaSequence()
    expect(ota.trigger).to.equal('message')
    expect(ota.matchTopic).to.equal('device/ota/cmd')
    expect(ota.matchCondition).to.equal("cmd == 'OTA'")
    expect(ota.loop).to.equal(false)
    // 1s ack + 9s = 10s to the first progress, then 20s between the later percents, then success and version.
    expect(ota.steps.map((item) => item.delayMs)).to.deep.equal([1000, 9000, 20000, 20000, 20000, 20000, 1000, 0])
    expect(ota.steps.map((item) => item.payload)).to.deep.equal([
      '{"cmd":"OTA","ack":0}',
      '{"progress":0}',
      '{"progress":20}',
      '{"progress":40}',
      '{"progress":90}',
      '{"progress":100}',
      '{"result":"success"}',
      '{"version":"1.2.3"}',
    ])
  })
})

describe('messageSequenceEngine', () => {
  const ids: string[] = []

  const attach = (id: string, record: ConnectionModel, published: Array<{ topic: string; payload: string }>) => {
    ids.push(id)
    const client = createClient(published)
    registerMessageSequences(id, record)
    attachMessageSequences(client, id)
    return client
  }

  afterEach(() => {
    resetMessageSequenceState()
    ids.splice(0).forEach((id) => clearConnectionVariableValues(id))
  })

  it('sends the first step immediately when its delay is 0', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection('conn-now', undefined, sequence())
    attach('conn-now', record, published)
    expect(startMessageSequence('conn-now', 'seq')).to.equal(true)
    await wait(30)
    expect(published).to.deep.equal([{ topic: 'device/report', payload: 'hello' }])
  })

  it('resolves a step before assigning, so the next step reads the new water level', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-water',
      '2000',
      sequence({
        loop: true,
        // One round ends at 1930, which is already below this, so a second round must not start.
        stopWhen: { variable: 'water', op: 'lt', value: 1990 },
        steps: [
          step('s0', 0, '${water}'),
          step('s1', 0, '${water - 20}', { actions: { setVariables: [{ name: 'water', value: '${water - 20}' }] } }),
          step('s2', 0, '${water - 20}', { actions: { setVariables: [{ name: 'water', value: '${water - 20}' }] } }),
          step('s3', 0, '${water - 30}', { actions: { setVariables: [{ name: 'water', value: '${water - 30}' }] } }),
        ],
      }),
    )
    attach('conn-water', record, published)
    startMessageSequence('conn-water', 'seq')
    await wait(40)
    expect(published.map((item) => item.payload)).to.deep.equal(['2000', '1980', '1960', '1930'])
    await wait(30)
    expect(published).to.have.lengthOf(4)
    const water = connectionVariableDefinitions(record).water
    expect(String(peekDefinitionValue(water))).to.equal('1930')
    expect(runningMessageSequenceIds('conn-water')).to.deep.equal([])
  })

  it('runs the first round even when the stop condition is already true, then does not loop', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-below',
      '40',
      sequence({
        loop: true,
        stopWhen: { variable: 'water', op: 'lt', value: 50 },
        steps: [step('s0', 0, '${water}', { actions: { setVariables: [{ name: 'water', value: '${water - 10}' }] } })],
      }),
    )
    attach('conn-below', record, published)
    startMessageSequence('conn-below', 'seq')
    await wait(30)
    expect(published.map((item) => item.payload)).to.deep.equal(['40'])
    await wait(20)
    expect(published).to.have.lengthOf(1)
  })

  it('loops while the stop condition is still false', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-loop',
      '100',
      sequence({
        loop: true,
        stopWhen: { variable: 'water', op: 'lt', value: 50 },
        steps: [step('s0', 0, '${water}', { actions: { setVariables: [{ name: 'water', value: '${water - 40}' }] } })],
      }),
    )
    attach('conn-loop', record, published)
    startMessageSequence('conn-loop', 'seq')
    await wait(40)
    // 100 then 60 are sent. After 60 the stored value is 20, so the next round does not start.
    expect(published.map((item) => item.payload)).to.deep.equal(['100', '60'])
    expect(runningMessageSequenceIds('conn-loop')).to.deep.equal([])
  })

  it('does not publish a step whose assignment names a variable that cannot be written', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-missing',
      undefined,
      sequence({
        steps: [step('s0', 0, '${water}', { actions: { setVariables: [{ name: 'water', value: '${water}' }] } })],
      }),
    )
    attach('conn-missing', record, published)
    startMessageSequence('conn-missing', 'seq')
    await wait(30)
    expect(published).to.deep.equal([])
    expect(runningMessageSequenceIds('conn-missing')).to.deep.equal([])
  })

  it('cancels the previous run when the same sequence starts again', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection('conn-retrigger', undefined, sequence({ steps: [step('s0', 40, 'only-once')] }))
    attach('conn-retrigger', record, published)
    startMessageSequence('conn-retrigger', 'seq')
    startMessageSequence('conn-retrigger', 'seq')
    await wait(70)
    expect(published.map((item) => item.payload)).to.deep.equal(['only-once'])
  })

  it('drops a waiting step when the connection closes and does not send it after reconnect', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-close',
      undefined,
      sequence({
        trigger: 'connect',
        steps: [step('s0', 0, 'first'), step('s1', 40, 'second')],
      }),
    )
    const client = attach('conn-close', record, published)
    client.emit('connect')
    await wait(20)
    expect(published.map((item) => item.payload)).to.deep.equal(['first'])
    client.emit('close')
    await wait(60)
    expect(published.map((item) => item.payload)).to.deep.equal(['first'])
    client.emit('connect')
    await wait(20)
    // The new connect starts at the first step. The cancelled "second" is not sent.
    expect(published.map((item) => item.payload)).to.deep.equal(['first', 'first'])
  })

  it('keeps receiving other messages and still accepts a manual publish while a step is waiting', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-open',
      undefined,
      sequence({
        trigger: 'message',
        matchTopic: 'device/ota/cmd',
        matchCondition: "cmd == 'OTA'",
        steps: [step('s0', 30, 'ack', { topic: 'device/ota/ack' })],
      }),
    )
    const client = attach('conn-open', record, published)
    const received: string[] = []
    client.on('message', (topic: string) => received.push(topic))

    client.emit('message', 'device/other', Buffer.from('{"cmd":"PING"}'))
    client.emit('message', 'device/ota/cmd', Buffer.from('{"cmd":"OTA"}'))
    client.emit('message', 'device/other', Buffer.from('{"cmd":"PING"}'))
    client.publish('hand/topic', 'by-hand', {}, () => undefined)
    await wait(50)

    expect(received).to.deep.equal(['device/other', 'device/ota/cmd', 'device/other'])
    expect(published).to.deep.equal([
      { topic: 'hand/topic', payload: 'by-hand' },
      { topic: 'device/ota/ack', payload: 'ack' },
    ])
  })

  it('reads the triggering message at each later step, not a message that arrived in between', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-msg',
      undefined,
      sequence({
        trigger: 'message',
        matchTopic: 'device/ota/cmd',
        matchCondition: "cmd == 'OTA'",
        steps: [step('s0', 0, '${msg.cmd}'), step('s1', 20, '${msg.cmd}')],
      }),
    )
    const client = attach('conn-msg', record, published)
    client.emit('message', 'device/ota/cmd', Buffer.from('{"cmd":"OTA"}'))
    await wait(10)
    client.emit('message', 'device/other', Buffer.from('{"cmd":"OTHER"}'))
    await wait(40)
    expect(published.map((item) => item.payload)).to.deep.equal(['OTA', 'OTA'])
  })

  it('cancels an unfinished OTA when a second command matches the same sequence', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-ota',
      undefined,
      sequence({
        trigger: 'message',
        matchTopic: 'device/ota/cmd',
        matchCondition: "cmd == 'OTA'",
        steps: [step('s0', 30, 'ack'), step('s1', 30, 'progress')],
      }),
    )
    const client = attach('conn-ota', record, published)
    client.emit('message', 'device/ota/cmd', Buffer.from('{"cmd":"OTA"}'))
    await wait(10)
    client.emit('message', 'device/ota/cmd', Buffer.from('{"cmd":"OTA"}'))
    await wait(80)
    expect(published.map((item) => item.payload)).to.deep.equal(['ack', 'progress'])
  })

  it('ignores an echo of a step the sequence itself just published', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-echo',
      undefined,
      sequence({
        trigger: 'message',
        matchTopic: 'device/ota/cmd',
        matchCondition: '',
        steps: [step('s0', 0, '{"cmd":"OTA"}', { topic: 'device/ota/cmd' })],
      }),
    )
    const client = attach('conn-echo', record, published)
    client.emit('message', 'device/ota/cmd', Buffer.from('{"cmd":"OTA"}'))
    await wait(20)
    client.emit('message', 'device/ota/cmd', Buffer.from('{"cmd":"OTA"}'))
    await wait(20)
    expect(published).to.have.lengthOf(1)
  })

  it('lets a sibling sequence see a payload this connection just published', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const publisher = sequence({
      id: 'publisher',
      trigger: 'manual',
      steps: [step('s0', 0, 'ping', { topic: 'device/report' })],
    })
    const listener = sequence({
      id: 'listener',
      trigger: 'message',
      matchTopic: 'device/report',
      steps: [step('s0', 0, 'seen', { topic: 'device/other' })],
    })
    const record = {
      id: 'conn-pair',
      clientId: 'dev-1',
      messageSequences: [publisher, listener],
    } as ConnectionModel
    const client = attach('conn-pair', record, published)
    startMessageSequence('conn-pair', 'publisher')
    await wait(20)
    client.emit('message', 'device/report', Buffer.from('ping'))
    await wait(20)
    expect(published.map((item) => item.payload)).to.deep.equal(['ping', 'seen'])
  })

  it('lets another connection see a payload this one just published', async () => {
    const publishedA: Array<{ topic: string; payload: string }> = []
    const publishedB: Array<{ topic: string; payload: string }> = []
    attach(
      'conn-a',
      connection(
        'conn-a',
        undefined,
        sequence({
          id: 'seq-a',
          trigger: 'manual',
          steps: [step('s0', 0, 'ping', { topic: 'device/report' })],
        }),
      ),
      publishedA,
    )
    const clientB = attach(
      'conn-b',
      connection(
        'conn-b',
        undefined,
        sequence({
          id: 'seq-b',
          trigger: 'message',
          matchTopic: 'device/report',
          steps: [step('s0', 0, 'seen', { topic: 'device/other' })],
        }),
      ),
      publishedB,
    )
    startMessageSequence('conn-a', 'seq-a')
    await wait(20)
    clientB.emit('message', 'device/report', Buffer.from('ping'))
    await wait(20)
    expect(publishedA.map((item) => item.payload)).to.deep.equal(['ping'])
    expect(publishedB.map((item) => item.payload)).to.deep.equal(['seen'])
  })

  it('rearms a waiting step when its delay is edited, and leaves it when the delay is unchanged', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const item = sequence({ steps: [step('s0', 400, 'late')] })
    const record = connection('conn-delay', undefined, item)
    attach('conn-delay', record, published)
    startMessageSequence('conn-delay', 'seq')
    await wait(30)
    registerMessageSequences('conn-delay', record)
    await wait(40)
    expect(published).to.deep.equal([])
    item.steps[0].delayMs = 0
    registerMessageSequences('conn-delay', record)
    await wait(40)
    expect(published.map((entry) => entry.payload)).to.deep.equal(['late'])
  })

  it('records a step the broker accepted even when the run is cancelled during the publish', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = connection(
      'conn-cut',
      '2000',
      sequence({
        steps: [
          step('s0', 0, 'first', { actions: { setVariables: [{ name: 'water', value: '1' }] } }),
          step('s1', 0, 'second'),
        ],
      }),
    )
    const client = Object.assign(new EventEmitter(), {
      connected: true,
      publish: (topic: string, payload: string, _options: unknown, callback?: (error?: Error) => void) => {
        published.push({ topic, payload })
        stopMessageSequence('conn-cut', 'seq')
        callback?.()
      },
    })
    ids.push('conn-cut')
    registerMessageSequences('conn-cut', record)
    attachMessageSequences(client as unknown as MqttClient, 'conn-cut')
    const seen: MessageModel[] = []
    const unsubscribe = onMessageSequencePublished((connectionId, message) => {
      if (connectionId === 'conn-cut') {
        seen.push(message)
      }
    })
    startMessageSequence('conn-cut', 'seq')
    await wait(30)
    unsubscribe()
    expect(published.map((item) => item.payload)).to.deep.equal(['first'])
    expect(seen.map((item) => item.payload)).to.deep.equal(['first'])
    expect(runningMessageSequenceIds('conn-cut')).to.deep.equal([])
    const water = connectionVariableDefinitions(record).water
    expect(String(peekDefinitionValue(water))).to.equal('2000')
  })

  it('cancels a waiting step when the sequence is disabled', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const item = sequence({ steps: [step('s0', 40, 'late')] })
    const record = connection('conn-off', undefined, item)
    attach('conn-off', record, published)
    startMessageSequence('conn-off', 'seq')
    item.enabled = false
    registerMessageSequences('conn-off', record)
    await wait(60)
    expect(published).to.deep.equal([])
  })

  it('writes the sequence start time when the run begins and keeps it for every step', async () => {
    const published: Array<{ topic: string; payload: string }> = []
    const record = {
      id: 'conn-start',
      clientId: 'dev-1',
      variables: {
        startAt: { kind: 'runStart' },
        water: { kind: 'captured', value: '2000', resetOn: [] },
      },
      messageSequences: [sequence({ steps: [step('s0', 0, '${startAt}'), step('s1', 0, '${startAt}')] })],
    } as unknown as ConnectionModel
    attach('conn-start', record, published)
    const before = Date.now()
    expect(startMessageSequence('conn-start', 'seq')).to.equal(true)
    const stamped = peekDefinitionValue(connectionVariableDefinitions(record).startAt)
    expect(stamped).to.be.a('number')
    expect(Number(stamped)).to.be.at.least(before)
    expect(Number(stamped)).to.be.at.most(Date.now())
    expect(published).to.deep.equal([])
    expect(String(peekDefinitionValue(connectionVariableDefinitions(record).water))).to.equal('2000')
    await wait(40)
    expect(published.map((item) => item.payload)).to.deep.equal([String(stamped), String(stamped)])
  })
})
