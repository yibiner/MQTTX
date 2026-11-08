import { expect } from 'chai'
import {
  createTimedReportRunner,
  TimedReportPublish,
  MAX_TIMED_REPORTS_PER_CONNECTION,
} from '@/utils/timedReportRunner'

const createConnection = (reports: Partial<TimedReportModel>[]): ConnectionModel =>
  ({
    id: 'conn-timed',
    clientId: 'dev-1',
    name: 'dev',
    host: '127.0.0.1',
    port: 8083,
    protocol: 'ws',
    mqttVersion: '3.1.1',
    subscriptions: [],
    variables: {},
    timedReports: reports.map((report, index) => ({
      id: `report-${index}`,
      interval: 1,
      topic: 'app/dev/heart',
      payload: '{}',
      qos: 0 as QoS,
      retain: false,
      enabled: true,
      ...report,
    })) as TimedReportModel[],
  } as unknown as ConnectionModel)

const setup = (reports: Partial<TimedReportModel>[]) => {
  const published: TimedReportPublish[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  const runner = createTimedReportRunner({
    connection: createConnection(reports),
    publish: (message) => {
      published.push(message)
    },
    onSkipped: (reportId, reason) => skipped.push({ id: reportId, reason }),
  })
  return { runner, published, skipped }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('timed messages (web build)', () => {
  afterEach(() => {
    // Nothing leaks between tests: every runner is disposed in its own test.
  })

  it('starts the enabled rows and skips the disabled one', () => {
    const { runner } = setup([{ topic: 'app/dev/on' }, { topic: 'app/dev/off', enabled: false }])

    const running = runner.startFromConnection()

    expect(running).to.deep.equal(['report-0'])
    runner.dispose()
  })

  it('does not start a row whose interval is below one second or whose topic is empty', () => {
    const { runner } = setup([{ interval: 0.5 }, { topic: '   ' }])

    // `pendingTimedReports` (shared with the desktop build) already drops those rows before the
    // runner sees them, so they are not started and nothing is reported as skipped. The editor is
    // what keeps such a row out of reach: it clamps the interval to at least one second.
    const running = runner.startFromConnection()

    expect(running).to.deep.equal([])
    runner.dispose()
  })

  it('publishes on every interval', async () => {
    const { runner, published } = setup([{ interval: 1 }])

    runner.startFromConnection()
    await wait(1250)
    runner.dispose()

    expect(published.length).to.be.greaterThan(0)
    expect(published[0].topic).to.equal('app/dev/heart')
  })

  it('resolves the variables of a row on every tick', async () => {
    const connection = createConnection([{ interval: 1, topic: 'app/dev/${clientId}/heart' }])
    const seen: string[] = []
    const runner = createTimedReportRunner({
      connection,
      publish: (message) => {
        seen.push(message.topic)
      },
    })

    runner.startFromConnection()
    await wait(1250)
    runner.dispose()

    expect(seen).to.have.length.greaterThan(0)
    expect(seen[0]).to.equal('app/dev/dev-1/heart')
  })

  it('does not start the same row twice', () => {
    const { runner } = setup([{ interval: 5 }])

    runner.startFromConnection()
    const again = runner.startFromConnection()

    expect(again).to.deep.equal(['report-0'])
    runner.dispose()
  })

  it('refuses more than the allowed number of concurrent rows', () => {
    const reports = Array.from({ length: MAX_TIMED_REPORTS_PER_CONNECTION + 2 }, (_, index) => ({
      topic: `app/dev/heart${index}`,
      interval: 5,
    }))
    const { runner, skipped } = setup(reports)

    const running = runner.startFromConnection()

    expect(running).to.have.length(MAX_TIMED_REPORTS_PER_CONNECTION)
    expect(skipped.length).to.equal(2)
    runner.dispose()
  })

  it('stops publishing after stop', async () => {
    const { runner, published } = setup([{ interval: 1 }])

    runner.startFromConnection()
    runner.stop('report-0')
    await wait(1250)

    expect(published).to.have.length(0)
    expect(runner.runningIds()).to.deep.equal([])
    runner.dispose()
  })

  it('stops everything on dispose', async () => {
    const { runner, published } = setup([{ interval: 1 }, { topic: 'app/dev/other', interval: 1 }])

    runner.startFromConnection()
    expect(runner.stopAll()).to.equal(2)
    await wait(1250)

    expect(published).to.have.length(0)
    runner.dispose()
  })
})
