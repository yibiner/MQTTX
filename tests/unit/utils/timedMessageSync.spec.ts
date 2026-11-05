import { expect } from 'chai'
import {
  listTimedMessages,
  startTimedMessage,
  stopAllTimedMessages,
  stopManualTimedMessages,
  syncSavedTimedReports,
} from '@/utils/timedMessageManager'

const message = (topic: string): MessageModel => ({
  createAt: '2026-01-01 00:00:00',
  out: true,
  topic,
  payload: '{}',
  qos: 0,
  retain: false,
})

const report = (id: string, topic: string, interval = 30): TimedReportModel => ({
  id,
  interval,
  topic,
  payload: '{}',
  qos: 0,
  enabled: true,
})

describe('saved timed report sync', () => {
  const connectionId = 'conn-sync'

  afterEach(() => {
    stopAllTimedMessages(connectionId)
  })

  it('replaces a changed report, drops a removed one, and leaves a manual send running', () => {
    startTimedMessage(connectionId, 30, message('manual/post'), 'JSON')
    syncSavedTimedReports(connectionId, [report('heart', 'heart/post', 30)])
    expect(
      listTimedMessages(connectionId)
        .map((item) => item.topic)
        .sort(),
    ).to.deep.equal(['heart/post', 'manual/post'])

    syncSavedTimedReports(connectionId, [report('heart', 'heart/post', 10)])
    const heart = listTimedMessages(connectionId).find((item) => item.topic === 'heart/post')
    expect(heart?.interval).to.equal(10)
    expect(listTimedMessages(connectionId).filter((item) => item.topic === 'heart/post')).to.have.length(1)

    syncSavedTimedReports(connectionId, [])
    expect(listTimedMessages(connectionId).map((item) => item.topic)).to.deep.equal(['manual/post'])
  })

  it('stops a manual send and leaves the saved report running', () => {
    startTimedMessage(connectionId, 30, message('manual/post'), 'JSON')
    syncSavedTimedReports(connectionId, [report('heart', 'heart/post')])
    expect(stopManualTimedMessages(connectionId)).to.equal(1)
    expect(listTimedMessages(connectionId).map((item) => item.topic)).to.deep.equal(['heart/post'])
  })
})
