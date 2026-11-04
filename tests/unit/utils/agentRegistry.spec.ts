import { expect } from 'chai'
import {
  AGENT_CANNOT_CONNECT,
  agentFeedFor,
  connectedAgentConnections,
  forgetAgentConnection,
  recordAgentMessages,
  rememberAgentConnection,
  resetAgentRegistryForTests,
  resolveAgentConnection,
  AgentRegistryClient,
} from '@/utils/agentRegistry'

function client(connected: boolean): AgentRegistryClient {
  return {
    connected,
    publish: () => undefined,
  }
}

describe('agent connection registry', () => {
  afterEach(() => {
    resetAgentRegistryForTests()
  })

  it('uses the only connected connection when no id is given', () => {
    rememberAgentConnection('a', 'washer', client(true))
    rememberAgentConnection('b', 'dryer', client(false))
    expect(resolveAgentConnection()).to.deep.equal({ id: 'a', name: 'washer' })
    expect(connectedAgentConnections().map((item) => item.id)).to.deep.equal(['a'])
  })

  it('requires an id when several connections are connected and never connects one', () => {
    rememberAgentConnection('a', 'washer', client(true))
    rememberAgentConnection('b', 'dryer', client(true))
    expect(() => resolveAgentConnection()).to.throw(/connectionId is required/)
    expect(() => resolveAgentConnection()).to.throw(AGENT_CANNOT_CONNECT)
    expect(resolveAgentConnection('b')).to.deep.equal({ id: 'b', name: 'dryer' })
  })

  it('refuses an id that is not connected', () => {
    rememberAgentConnection('a', 'washer', client(false))
    expect(() => resolveAgentConnection('a')).to.throw(/No connected connection has id a/)
    expect(() => resolveAgentConnection('missing')).to.throw(AGENT_CANNOT_CONNECT)
    expect(() => resolveAgentConnection()).to.throw(/No connection is connected/)
  })

  it('keeps each connection feed separate across a reconnect of the same id', async () => {
    const first = client(true)
    rememberAgentConnection('a', 'washer', first)
    rememberAgentConnection('b', 'dryer', client(true))
    recordAgentMessages('a', [
      {
        id: 'm1',
        direction: 'in',
        topic: 'device/state',
        payload: 'ack',
        qos: 0,
        retain: false,
        createAt: '2026-11-04 10:00:00',
      },
    ])
    const replaced = client(true)
    rememberAgentConnection('a', 'washer', replaced)
    const feedA = agentFeedFor('a')
    const feedB = agentFeedFor('b')
    expect(feedA?.messages.map((message) => message.id)).to.deep.equal(['m1'])
    expect(feedB?.messages).to.deep.equal([])
    const pending = feedB?.wait({ timeoutMs: 30 })
    const result = await pending
    expect(result?.matched).to.equal(false)
    forgetAgentConnection('b')
    expect(agentFeedFor('b')).to.equal(undefined)
    expect(resolveAgentConnection('a').id).to.equal('a')
  })
})
