import { expect } from 'chai'
import { planConnectReports, runConnectReports, ConnectReportMessage } from '@/utils/connectReportRunner'

const createConnection = (reports: Partial<ConnectReportModel>[] | null): ConnectionModel =>
  ({
    id: 'conn-report',
    clientId: 'dev-1',
    name: 'conn',
    host: '127.0.0.1',
    port: 8083,
    protocol: 'ws',
    mqttVersion: '3.1.1',
    subscriptions: [],
    variables: {},
    connectReports: (reports ?? []).map((report, index) => ({
      id: `r${index}`,
      delay: 0,
      topic: '',
      payload: '',
      qos: 0,
      retain: false,
      enabled: true,
      ...report,
    })) as ConnectReportModel[],
  } as unknown as ConnectionModel)

describe('connect reports (web build)', () => {
  describe('planning', () => {
    it('keeps enabled rows with a topic and drops the rest', () => {
      const plan = planConnectReports(
        createConnection([
          { topic: 'app/dev/online', payload: '{"state":"online"}' },
          { topic: 'app/dev/disabled', enabled: false },
          { topic: '   ' },
          { topic: 'app/dev/negative', delay: -1 },
        ]),
      )

      expect(plan.messages.map((message) => message.topic)).to.deep.equal(['app/dev/online'])
      expect(plan.unresolved).to.deep.equal([])
    })

    it('resolves variables in topic and payload', () => {
      const connection = createConnection([
        { topic: 'app/${productType}/${clientId}/online', payload: '{"id":"${clientId}"}' },
      ])
      connection.variables = { productType: 'gateway' }

      const plan = planConnectReports(connection)

      expect(plan.messages).to.have.length(1)
      expect(plan.messages[0].topic).to.equal('app/gateway/dev-1/online')
      expect(plan.messages[0].payload).to.equal('{"id":"dev-1"}')
    })

    it('drops a row whose topic cannot be resolved and reports the placeholder', () => {
      const plan = planConnectReports(createConnection([{ topic: 'app/${unknown}/online' }]))

      expect(plan.messages).to.have.length(0)
      expect(plan.unresolved).to.include('unknown')
    })

    it('converts the delay from seconds to milliseconds', () => {
      const plan = planConnectReports(createConnection([{ topic: 'app/dev/ota', delay: 2.5 }]))

      expect(plan.messages[0].delayMs).to.equal(2500)
    })

    it('clamps a delay setTimeout would otherwise fire immediately', () => {
      const plan = planConnectReports(createConnection([{ topic: 'app/dev/late', delay: 100000000 }]))

      expect(plan.messages[0].delayMs).to.equal(2147483647)
    })
  })

  describe('running', () => {
    it('publishes an immediate report right away', () => {
      const published: ConnectReportMessage[] = []
      runConnectReports({
        connection: createConnection([{ topic: 'app/dev/online' }]),
        publish: (message) => published.push(message),
      })

      expect(published).to.have.length(1)
      expect(published[0].topic).to.equal('app/dev/online')
    })

    it('waits for the delay before publishing', async () => {
      const published: ConnectReportMessage[] = []
      const started = Date.now()
      const run = runConnectReports({
        connection: createConnection([{ topic: 'app/dev/late', delay: 0.12 }]),
        publish: (message) => published.push(message),
      })

      expect(published).to.have.length(0)
      expect(run.timers).to.have.length(1)
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(published).to.have.length(1)
      expect(Date.now() - started).to.be.greaterThan(99)
    })

    it('cancel stops the reports that have not been sent yet', async () => {
      const published: ConnectReportMessage[] = []
      const run = runConnectReports({
        connection: createConnection([{ topic: 'app/dev/late', delay: 0.05 }]),
        publish: (message) => published.push(message),
      })

      run.cancel()
      await new Promise((resolve) => setTimeout(resolve, 120))
      expect(published).to.have.length(0)
    })

    it('sends several rows in order, each after its own delay', async () => {
      const published: ConnectReportMessage[] = []
      runConnectReports({
        connection: createConnection([
          { topic: 'app/dev/online', delay: 0 },
          { topic: 'app/dev/ota', delay: 0.05 },
        ]),
        publish: (message) => published.push(message),
      })

      expect(published.map((message) => message.topic)).to.deep.equal(['app/dev/online'])
      await new Promise((resolve) => setTimeout(resolve, 120))
      expect(published.map((message) => message.topic)).to.deep.equal(['app/dev/online', 'app/dev/ota'])
    })
  })
})
