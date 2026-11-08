import { expect } from 'chai'
import { applyConnectSubscriptions } from '@/utils/connectSubscriptions'

/** Records what the module asks the client to do, without opening a connection. */
const createFakeClient = () => {
  const calls: Array<{ kind: 'map' | 'single'; topics: { [topic: string]: QoS } | string; options?: $TSFixed }> = []
  return {
    calls,
    subscribe: (topic: $TSFixed, opts?: $TSFixed) => {
      if (typeof topic === 'object' && !Array.isArray(topic)) {
        calls.push({ kind: 'map', topics: topic, options: opts })
      } else {
        calls.push({ kind: 'single', topics: topic, options: opts })
      }
      return undefined
    },
  }
}

const createConnection = (overrides: Partial<ConnectionModel> = {}): ConnectionModel =>
  ({
    id: 'conn-subscribe',
    clientId: 'dev-1',
    name: 'conn',
    host: '127.0.0.1',
    port: 8083,
    protocol: 'ws',
    mqttVersion: '3.1.1',
    subscriptions: [],
    variables: {},
    ...overrides,
  } as ConnectionModel)

describe('connect subscriptions (web build)', () => {
  it('does nothing when the connection has no subscriptions configured', async () => {
    const client = createFakeClient()
    const result = await applyConnectSubscriptions({
      client: client as $TSFixed,
      connection: createConnection(),
      restoreManual: false,
    })

    expect(client.calls).to.have.length(0)
    expect(result.subscribed).to.deep.equal([])
    expect(result.unresolved).to.deep.equal([])
  })

  it('sends a merged group as one packet and a non-merged group topic by topic', async () => {
    const client = createFakeClient()
    const connection = createConnection({
      autoSubscriptions: [
        {
          id: 'g1',
          enabled: true,
          delayMs: 0,
          merge: true,
          topics: [
            { topic: 'app/dev/cmd', qos: 0 },
            { topic: 'app/dev/ota', qos: 1 },
          ],
        },
        {
          id: 'g2',
          enabled: true,
          delayMs: 0,
          merge: false,
          topics: [{ topic: 'app/dev/log', qos: 0 }],
        },
      ] as AutoSubscribeGroupModel[],
    })

    await applyConnectSubscriptions({ client: client as $TSFixed, connection, restoreManual: false })

    const merged = client.calls.filter((call) => call.kind === 'map')
    expect(merged).to.have.length(1)
    expect(Object.keys(merged[0].topics as { [topic: string]: QoS })).to.have.members([
      'app/dev/cmd',
      'app/dev/ota',
    ])

    const singles = client.calls.filter((call) => call.kind === 'single')
    expect(singles).to.have.length(1)
    expect(singles[0].topics).to.equal('app/dev/log')
  })

  it('waits for the group delay before subscribing', async () => {
    const client = createFakeClient()
    const connection = createConnection({
      autoSubscriptions: [
        {
          id: 'g1',
          enabled: true,
          delayMs: 120,
          merge: false,
          topics: [{ topic: 'app/dev/late', qos: 0 }],
        },
      ] as AutoSubscribeGroupModel[],
    })

    const started = Date.now()
    const done = applyConnectSubscriptions({ client: client as $TSFixed, connection, restoreManual: false })

    expect(client.calls).to.have.length(0)
    await done
    expect(Date.now() - started).to.be.greaterThan(99)
    expect(client.calls).to.have.length(1)
  })

  it('skips a topic whose placeholder cannot be resolved and reports the name', async () => {
    const client = createFakeClient()
    const reported: string[][] = []
    const connection = createConnection({
      autoSubscriptions: [
        {
          id: 'g1',
          enabled: true,
          delayMs: 0,
          merge: false,
          topics: [{ topic: 'app/${nope}/cmd', qos: 0 }],
        },
      ] as AutoSubscribeGroupModel[],
    })

    const result = await applyConnectSubscriptions({
      client: client as $TSFixed,
      connection,
      restoreManual: false,
      onUnresolved: (names) => reported.push(names),
    })

    expect(client.calls).to.have.length(0)
    expect(result.unresolved).to.include('nope')
    expect(reported).to.have.length(1)
  })

  it('marks the created rows as automatic so the panel can badge them', async () => {
    const client = createFakeClient()
    const connection = createConnection({
      autoSubscriptions: [
        {
          id: 'g1',
          enabled: true,
          delayMs: 0,
          merge: false,
          topics: [{ topic: 'app/dev/heart', qos: 0 }],
        },
      ] as AutoSubscribeGroupModel[],
    })

    await applyConnectSubscriptions({ client: client as $TSFixed, connection, restoreManual: false })

    const row = connection.subscriptions.find((item) => item.topic === 'app/dev/heart')
    expect(row).to.not.equal(undefined)
    expect(row?.autoSubscribed).to.equal(true)
    expect(row?.qos).to.equal(0)
  })

  it('does not subscribe a delayed group after cancel', async () => {
    const client = createFakeClient()
    const connection = createConnection({
      autoSubscriptions: [
        {
          id: 'g1',
          enabled: true,
          delayMs: 200,
          merge: false,
          topics: [{ topic: 'app/dev/late', qos: 0 }],
        },
      ] as AutoSubscribeGroupModel[],
    })

    const run = applyConnectSubscriptions({ client: client as $TSFixed, connection, restoreManual: false })
    run.cancel()
    await run
    await new Promise((resolve) => setTimeout(resolve, 240))

    expect(client.calls).to.have.length(0)
  })
})
