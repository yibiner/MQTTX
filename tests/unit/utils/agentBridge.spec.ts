import { expect } from 'chai'
import http from 'http'
import {
  agentBridgeClientConfig,
  agentConnectionMismatch,
  appendAgentMessage,
  clampWaitMs,
  describeConnection,
  filterAgentMessages,
  matchAgentMessage,
  mergeAgentMessages,
  messageFromAgent,
  selectAgentMessages,
  toAgentMessage,
  AgentDisplayedMessage,
} from '@/utils/agentBridge'
import { AgentMessageFeed } from '@/utils/agentMessageFeed'
import {
  AGENT_BRIDGE_INSTRUCTIONS,
  handleMcpMessage,
  parseListArguments,
  parsePublishArguments,
  parseSequenceArguments,
  parseWaitArguments,
} from '@/main/agentBridge/protocol'
import type { AgentBridgeTools } from '@/main/agentBridge/protocol'
import { startAgentBridgeServer, AgentBridgeServer } from '@/main/agentBridge/http'

const TOKEN = 'local-test-token'
const message = (id: string, payload: string, out = false, meta?: string): MessageModel =>
  ({
    id,
    out,
    payload,
    topic: 'device/water',
    qos: 0,
    retain: false,
    createAt: '2026-10-24 16:00:00',
    meta,
  } as MessageModel)

const displayed = (id: string, payload: string): AgentDisplayedMessage => ({
  id,
  direction: 'in',
  topic: 'device/water',
  payload,
  qos: 0,
  retain: false,
  createAt: '2026-10-24 16:00:00',
})

/** Every MCP tool of the bridge, so a test only stubs what it asserts on. */
const toolsStub = (overrides: Partial<AgentBridgeTools> = {}): AgentBridgeTools => ({
  getConnection: async () => ({}),
  publish: async () => ({}),
  listMessages: async () => ({ messages: [], cursorReset: false }),
  waitForMessage: async () => ({ matched: false, waitedMs: 0 }),
  startSequence: async () => ({}),
  stopSequence: async () => ({}),
  ...overrides,
})

interface HttpResult {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

const send = (
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers: http.OutgoingHttpHeaders = {},
): Promise<HttpResult> =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body)
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    if (payload) {
      req.write(payload)
    }
    req.end()
  })

describe('agent bridge', () => {
  it('describes the open connection without its credentials', () => {
    const snapshot = describeConnection({
      id: 'conn-1',
      name: 'washer',
      clientId: 'washer-1',
      protocol: 'mqtt',
      host: '127.0.0.1',
      port: 1883,
      path: '/mqtt',
      connected: true,
      subscriptions: [{ topic: 'device/+/cmd', qos: 1, disabled: false }],
      messageSequences: [{ name: '水量循环', enabled: true, trigger: 'connect' }],
      password: 'secret',
      username: 'user',
    } as Parameters<typeof describeConnection>[0])
    expect(snapshot).to.deep.equal({
      connectionId: 'conn-1',
      name: 'washer',
      clientId: 'washer-1',
      protocol: 'mqtt',
      host: '127.0.0.1',
      port: 1883,
      path: '/mqtt',
      connected: true,
      subscriptions: [{ topic: 'device/+/cmd', qos: 1, disabled: false }],
      sequences: [{ id: '', name: '水量循环', enabled: true, trigger: 'connect', running: false, steps: 0 }],
      variables: [],
      autoReplies: [],
    })
    expect(snapshot).to.not.have.property('password')
    expect(snapshot).to.not.have.property('username')
  })

  it('reports variable values, running sequences and the rules the app answers itself', () => {
    const snapshot = describeConnection({
      id: 'conn-1',
      name: 'washer',
      clientId: 'washer-1',
      port: 1883,
      connected: true,
      messageSequences: [
        { id: 'seq-1', name: '水量循环', enabled: true, trigger: 'manual', steps: [{}, {}, {}] },
        { id: 'seq-2', name: 'OTA', enabled: false, trigger: 'message', steps: [{}] },
      ],
      runningSequenceIds: ['seq-1'],
      variables: [
        { name: 'water', kind: 'sequence', scope: 'connection', value: '1980' },
        { name: 'startAt', kind: 'runStart', scope: 'connection', value: null },
      ],
      autoReplies: [{ name: 'ack', enabled: true, matchTopic: 'device/cmd' }],
    })
    expect(snapshot.sequences).to.deep.equal([
      { id: 'seq-1', name: '水量循环', enabled: true, trigger: 'manual', running: true, steps: 3 },
      { id: 'seq-2', name: 'OTA', enabled: false, trigger: 'message', running: false, steps: 1 },
    ])
    expect(snapshot.variables).to.deep.equal([
      { name: 'water', kind: 'sequence', scope: 'connection', value: '1980' },
      { name: 'startAt', kind: 'runStart', scope: 'connection', value: null },
    ])
    expect(snapshot.autoReplies).to.deep.equal([{ name: 'ack', enabled: true, matchTopic: 'device/cmd' }])
  })

  it('refuses a call that names another connection', () => {
    expect(agentConnectionMismatch(undefined, { id: 'conn-1', name: 'washer' })).to.equal(null)
    expect(agentConnectionMismatch('conn-1', { id: 'conn-1', name: 'washer' })).to.equal(null)
    const refused = agentConnectionMismatch('conn-1', { id: 'conn-2', name: 'dryer' })
    expect(refused).to.contain('dryer')
    expect(refused).to.contain('conn-2')
  })

  it('merges stored messages with what the view filtered out', () => {
    const stored = [displayed('m1', 'a'), displayed('m2', 'b')]
    const live = [displayed('m2', 'b'), { ...displayed('m3', 'c'), source: 'agent' as const }]
    expect(mergeAgentMessages(stored, live).map((item) => item.id)).to.deep.equal(['m1', 'm2', 'm3'])
    expect(filterAgentMessages(mergeAgentMessages(stored, live), { topic: 'device/+' })).to.have.length(3)
    expect(filterAgentMessages(mergeAgentMessages(stored, live), { topic: 'other/#' })).to.have.length(0)
    expect(matchAgentMessage(displayed('m4', 'x'), { contains: 'x' })).to.equal(true)
    expect(matchAgentMessage(displayed('m4', 'x'), { direction: 'out' })).to.equal(false)

    let log: AgentDisplayedMessage[] = []
    for (let index = 0; index < 205; index += 1) {
      log = appendAgentMessage(log, displayed(`m${index}`, 'x'))
    }
    expect(log).to.have.length(200)
    expect(log[199].id).to.equal('m204')
    expect(clampWaitMs(999999)).to.equal(60000)
    expect(clampWaitMs(undefined)).to.equal(10000)
  })

  describe('message feed', () => {
    it('answers a wait with the next matching arrival, not with what arrived before', async () => {
      const feed = new AgentMessageFeed()
      feed.record(displayed('m1', 'old'))
      const pending = feed.wait({ topic: 'device/#', afterId: 'm1', timeoutMs: 500 })
      feed.record({ ...displayed('m2', 'wrong-topic'), topic: 'other/topic' })
      feed.record({ ...displayed('m3', '{"water":1980}'), topic: 'device/water/state' })
      const result = await pending
      expect(result.matched).to.equal(true)
      expect(result.message?.id).to.equal('m3')
      expect(feed.waiting).to.equal(0)
    })

    it('answers at once when the message arrived between the publish and the wait', async () => {
      const feed = new AgentMessageFeed()
      feed.record(displayed('m1', 'start'))
      feed.record(displayed('m2', 'ack'))
      const result = await feed.wait({ contains: 'ack', afterId: 'm1', timeoutMs: 5000 })
      expect(result.matched).to.equal(true)
      expect(result.waitedMs).to.equal(0)
      expect(result.message?.id).to.equal('m2')
    })

    it('times out with a hint and keeps the filter', async () => {
      const feed = new AgentMessageFeed()
      const result = await feed.wait({ topic: 'device/+/ack', timeoutMs: 20 })
      expect(result.matched).to.equal(false)
      expect(result.waitedMs).to.be.at.least(20)
      expect(result.hint).to.contain('device/+/ack')
      expect(feed.waiting).to.equal(0)
    })

    it('settles waiters when the page goes away and forgets the log when it clears', async () => {
      const feed = new AgentMessageFeed()
      const pending = feed.wait({ timeoutMs: 30000 })
      expect(feed.waiting).to.equal(1)
      feed.settleAll('The connection page was closed.')
      const result = await pending
      expect(result.matched).to.equal(false)
      expect(result.hint).to.contain('closed')
      feed.record(displayed('m1', 'x'))
      feed.clear()
      expect(feed.messages).to.have.length(0)
    })
  })

  it('marks an agent publish and pages the visible messages', () => {
    const agent = toAgentMessage(message('m2', '{"cmd":"OTA"}', true, JSON.stringify({ agent: true })))
    expect(messageFromAgent({ meta: JSON.stringify({ agent: true }) })).to.equal(true)
    expect(agent.source).to.equal('agent')
    expect(agent.direction).to.equal('out')
    expect(agent.payload).to.equal('{"cmd":"OTA"}')

    const rows = [
      displayed('m1', 'a'),
      { ...displayed('m2', 'b'), direction: 'out' as const, source: 'agent' as const },
      displayed('m3', 'c'),
    ]
    expect(selectAgentMessages(rows, { limit: 2 }).messages.map((item) => item.id)).to.deep.equal(['m2', 'm3'])
    const after = selectAgentMessages(rows, { afterId: 'm1' })
    expect(after.cursorReset).to.equal(false)
    expect(after.messages.map((item) => item.id)).to.deep.equal(['m2', 'm3'])
    const reset = selectAgentMessages(rows, { afterId: 'gone' })
    expect(reset.cursorReset).to.equal(true)
    expect(reset.messages.map((item) => item.id)).to.deep.equal(['m1', 'm2', 'm3'])
  })

  it('tells the agent to use the open connection instead of keeping device state', async () => {
    let published: unknown
    const response = await handleMcpMessage(
      { jsonrpc: '2.0', id: 7, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
      {
        serverVersion: '1.13.1',
        tools: toolsStub({
          publish: async (input) => {
            published = input
            return input
          },
        }),
      },
    )
    const result = response?.result as { instructions: string; protocolVersion: string }
    expect(result.protocolVersion).to.equal('2025-03-26')
    expect(result.instructions).to.equal(AGENT_BRIDGE_INSTRUCTIONS)
    expect(result.instructions).to.contain('message list')
    expect(result.instructions).to.contain('do not recreate')
    expect(result.instructions).to.contain('connectionId')

    const refused = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: { name: 'publish', arguments: { topic: '', payload: 'x' } },
      },
      {
        serverVersion: '1.13.1',
        tools: toolsStub({
          publish: async (input) => {
            published = input
            return input
          },
        }),
      },
    )
    const tool = refused?.result as { isError?: boolean; content: Array<{ text: string }> }
    expect(tool.isError).to.equal(true)
    expect(tool.content[0].text).to.equal('topic is required')
    expect(published).to.equal(undefined)

    expect(
      await handleMcpMessage(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { serverVersion: '1.13.1', tools: toolsStub() },
      ),
    ).to.equal(null)
  })

  it('parses the arguments of the new tools', () => {
    expect(parsePublishArguments({ topic: ' a/b ', payload: '', connectionId: ' conn-1 ' })).to.deep.equal({
      topic: 'a/b',
      payload: '',
      qos: 0,
      retain: false,
      connectionId: 'conn-1',
    })
    expect(parseListArguments({ limit: 5, topic: 'device/+/state', direction: 'in', contains: 'ota' })).to.deep.equal({
      limit: 5,
      topic: 'device/+/state',
      direction: 'in',
      contains: 'ota',
    })
    expect(parseListArguments({ connectionId: 'conn-1' })).to.deep.equal({ connectionId: 'conn-1' })
    expect(parseWaitArguments({ timeoutMs: 1500, afterId: 'm1', connectionId: 'conn-1' })).to.deep.equal({
      timeoutMs: 1500,
      afterId: 'm1',
      connectionId: 'conn-1',
    })
    expect(() => parseWaitArguments({ timeoutMs: 0 })).to.throw('timeoutMs')
    expect(() => parseWaitArguments({ timeoutMs: 60001 })).to.throw('timeoutMs')
    expect(() => parseListArguments({ direction: 'sideways' })).to.throw('direction')
    expect(parseSequenceArguments({ sequence: ' 水量循环 ' }, 'start_sequence')).to.deep.equal({
      sequence: '水量循环',
    })
    expect(() => parseSequenceArguments({}, 'start_sequence')).to.throw('sequence is required')
  })

  it('calls the new tools through the protocol and reports a wait timeout as a result', async () => {
    const seen: string[] = []
    const tools = toolsStub({
      waitForMessage: async (input) => {
        seen.push(`wait:${input.topic}:${input.timeoutMs}`)
        return { matched: false, waitedMs: 20, hint: 'no matching message' }
      },
      startSequence: async (input) => {
        seen.push(`start:${input.sequence}`)
        return { sequenceId: 'seq-1', name: '水量循环', running: true, steps: 3 }
      },
      stopSequence: async (input) => {
        seen.push(`stop:${input.sequence}`)
        return { sequenceId: 'seq-1', name: '水量循环', running: false }
      },
    })
    const wait = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'wait_for_message', arguments: { topic: 'device/+/ack', timeoutMs: 20 } },
      },
      { serverVersion: '1.13.1', tools },
    )
    const waited = wait?.result as { isError?: boolean; content: Array<{ text: string }> }
    expect(waited.isError).to.not.equal(true)
    expect(JSON.parse(waited.content[0].text)).to.deep.equal({
      matched: false,
      waitedMs: 20,
      hint: 'no matching message',
    })

    const started = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'start_sequence', arguments: { sequence: '水量循环' } },
      },
      { serverVersion: '1.13.1', tools },
    )
    expect(JSON.parse((started?.result as { content: Array<{ text: string }> }).content[0].text)).to.include({
      sequenceId: 'seq-1',
      running: true,
    })

    await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'stop_sequence', arguments: { sequence: '水量循环' } },
      },
      { serverVersion: '1.13.1', tools },
    )
    expect(seen).to.deep.equal(['wait:device/+/ack:20', 'start:水量循环', 'stop:水量循环'])

    const listed = await handleMcpMessage(
      { jsonrpc: '2.0', id: 12, method: 'tools/list' },
      { serverVersion: '1.13.1', tools },
    )
    const names = (listed?.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name)
    expect(names).to.deep.equal([
      'get_connection',
      'publish',
      'list_messages',
      'wait_for_message',
      'start_sequence',
      'stop_sequence',
    ])
  })

  describe('local HTTP endpoint', () => {
    let bridge: AgentBridgeServer
    const calls: string[] = []

    before(async () => {
      bridge = await startAgentBridgeServer({
        token: TOKEN,
        ports: [0],
        context: {
          serverVersion: '1.13.1',
          tools: toolsStub({
            getConnection: async () => {
              calls.push('get_connection')
              return { name: 'washer', connected: true }
            },
            publish: async (input) => {
              calls.push('publish')
              return { direction: 'out', topic: input.topic, payload: input.payload, source: 'agent' }
            },
          }),
        },
      })
    })

    after(async () => {
      await bridge.close()
    })

    beforeEach(() => {
      calls.length = 0
    })

    it('refuses a missing token, a foreign origin and a foreign host', async () => {
      const unauthorized = await send(
        bridge.port,
        'POST',
        '/mcp',
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        {
          Authorization: 'Bearer wrong',
        },
      )
      expect(unauthorized.status).to.equal(401)

      const foreign = await send(
        bridge.port,
        'POST',
        '/mcp',
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        {
          Origin: 'https://evil.test',
        },
      )
      expect(foreign.status).to.equal(403)

      const rebinding = await send(
        bridge.port,
        'POST',
        '/mcp',
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        {
          Host: 'evil.test',
        },
      )
      expect(rebinding.status).to.equal(403)
      expect(calls).to.deep.equal([])
    })

    it('publishes through the tool and returns the text the list would show', async () => {
      const payload = '{"cmd":"OTA","note":"进度 20%"}'
      const response = await send(bridge.port, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'publish', arguments: { topic: 'device/ota/cmd', payload, qos: 1, retain: false } },
      })
      expect(response.status).to.equal(200)
      expect(response.headers['mcp-session-id']).to.be.a('string')
      const body = JSON.parse(response.body)
      const shown = JSON.parse(body.result.content[0].text)
      expect(shown).to.deep.equal({
        direction: 'out',
        topic: 'device/ota/cmd',
        payload,
        source: 'agent',
      })
      expect(calls).to.deep.equal(['publish'])

      const config = JSON.parse(agentBridgeClientConfig(bridge.port, TOKEN))
      expect(config.mcpServers['mqttx-plus'].url).to.equal(`http://127.0.0.1:${bridge.port}/mcp`)
      expect(config.mcpServers['mqttx-plus'].headers.Authorization).to.equal(`Bearer ${TOKEN}`)
    })

    it('accepts the same call over the SSE transport', async () => {
      const stream = await new Promise<{ sessionId: string; next: () => Promise<string>; close: () => void }>(
        (resolve, reject) => {
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port: bridge.port,
              path: '/sse',
              method: 'GET',
              headers: { Authorization: `Bearer ${TOKEN}` },
            },
            (res) => {
              let buffer = ''
              const waiters: Array<(chunk: string) => void> = []
              res.on('data', (chunk) => {
                buffer += chunk.toString()
                waiters.splice(0).forEach((waiter) => waiter(buffer))
              })
              const next = () =>
                new Promise<string>((done) => {
                  if (buffer.includes('event: message')) {
                    done(buffer)
                    return
                  }
                  waiters.push(done)
                })
              const match = () => /sessionId=([0-9a-f-]+)/.exec(buffer)
              const ready = () => {
                const found = match()
                if (!found) {
                  waiters.push(() => ready())
                  return
                }
                resolve({
                  sessionId: found[1],
                  next,
                  close: () => req.destroy(),
                })
              }
              if (match()) {
                ready()
              } else {
                res.once('data', ready)
              }
            },
          )
          req.on('error', reject)
          req.end()
        },
      )

      const posted = await send(bridge.port, 'POST', `/message?sessionId=${stream.sessionId}`, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_connection', arguments: {} },
      })
      expect(posted.status).to.equal(202)
      const raw = await stream.next()
      stream.close()
      const dataLine = raw.split('\n').find((line) => line.startsWith('data: {'))
      const rpc = JSON.parse((dataLine || '').slice('data: '.length))
      expect(JSON.parse(rpc.result.content[0].text)).to.deep.equal({ name: 'washer', connected: true })
      expect(calls).to.deep.equal(['get_connection'])
    })
  })
})
