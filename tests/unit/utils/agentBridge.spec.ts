import { expect } from 'chai'
import http from 'http'
import {
  agentBridgeClientConfig,
  describeConnection,
  messageFromAgent,
  selectAgentMessages,
  toAgentMessage,
  AgentDisplayedMessage,
} from '@/utils/agentBridge'
import { AGENT_BRIDGE_INSTRUCTIONS, handleMcpMessage } from '@/main/agentBridge/protocol'
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
      sequences: [{ name: '水量循环', enabled: true, trigger: 'connect' }],
    })
    expect(snapshot).to.not.have.property('password')
    expect(snapshot).to.not.have.property('username')
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
        tools: {
          getConnection: async () => ({}),
          publish: async (input) => {
            published = input
            return input
          },
          listMessages: async () => ({ messages: [] }),
        },
      },
    )
    const result = response?.result as { instructions: string; protocolVersion: string }
    expect(result.protocolVersion).to.equal('2025-03-26')
    expect(result.instructions).to.equal(AGENT_BRIDGE_INSTRUCTIONS)
    expect(result.instructions).to.contain('message list')
    expect(result.instructions).to.contain('do not recreate')

    const refused = await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: { name: 'publish', arguments: { topic: '', payload: 'x' } },
      },
      {
        serverVersion: '1.13.1',
        tools: {
          getConnection: async () => ({}),
          publish: async (input) => {
            published = input
            return input
          },
          listMessages: async () => ({ messages: [] }),
        },
      },
    )
    const tool = refused?.result as { isError?: boolean; content: Array<{ text: string }> }
    expect(tool.isError).to.equal(true)
    expect(tool.content[0].text).to.equal('topic is required')
    expect(published).to.equal(undefined)

    expect(
      await handleMcpMessage(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        {
          serverVersion: '1.13.1',
          tools: { getConnection: async () => ({}), publish: async () => ({}), listMessages: async () => ({}) },
        },
      ),
    ).to.equal(null)
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
          tools: {
            getConnection: async () => {
              calls.push('get_connection')
              return { name: 'washer', connected: true }
            },
            publish: async (input) => {
              calls.push('publish')
              return { direction: 'out', topic: input.topic, payload: input.payload, source: 'agent' }
            },
            listMessages: async () => ({ messages: [], cursorReset: false }),
          },
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
