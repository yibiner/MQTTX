/**
 * Local MCP endpoint for Cursor and Claude Code.
 *
 * Listens on 127.0.0.1 only. Streamable HTTP is POST /mcp. Clients that still speak the older SSE
 * transport use GET /sse and POST /message. Both call the same tool handler. The bearer token is
 * the only credential; it never travels in the URL.
 */
import { createHash, randomUUID, timingSafeEqual } from 'crypto'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { handleMcpMessage, JsonRpcResponse, McpContext } from './protocol'

const MAX_BODY_BYTES = 1024 * 1024

export interface AgentBridgeServer {
  port: number
  close: () => Promise<void>
}

export async function startAgentBridgeServer(options: {
  token: string
  ports: number[]
  context: McpContext
}): Promise<AgentBridgeServer> {
  let lastError: Error | undefined
  for (const port of options.ports) {
    try {
      return await listenOnce(port, options.token, options.context)
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      lastError = err
      if (err.code !== 'EADDRINUSE' || port === 0) {
        throw err
      }
    }
  }
  throw lastError || new Error('No local port is available for the agent bridge')
}

function listenOnce(port: number, token: string, context: McpContext): Promise<AgentBridgeServer> {
  const sessions = new Map<string, ServerResponse>()
  const sessionId = randomUUID()
  const server = createServer((req, res) => {
    handleRequest(req, res, { token, sessionId, sessions, context }).catch((error) => {
      if (!res.headersSent) {
        writeJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    })
  })
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.removeListener('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      const address = server.address()
      const boundPort = address && typeof address === 'object' ? address.port : port
      resolve({
        port: boundPort,
        close: () => closeServer(server, sessions),
      })
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  state: {
    token: string
    sessionId: string
    sessions: Map<string, ServerResponse>
    context: McpContext
  },
): Promise<void> {
  if (!isLoopback(req.socket.remoteAddress)) {
    writeJson(res, 403, { error: 'Only local clients can use this bridge' })
    return
  }
  if (!hostAllowed(headerValue(req.headers.host), req.socket.localPort)) {
    writeJson(res, 403, { error: 'Host is not allowed' })
    return
  }
  if (!originAllowed(headerValue(req.headers.origin))) {
    writeJson(res, 403, { error: 'Origin is not allowed' })
    return
  }
  if (!tokensMatch(bearerToken(req), state.token)) {
    writeJson(res, 401, { error: 'Unauthorized' })
    return
  }

  const url = new URL(req.url || '/', 'http://127.0.0.1')
  const method = req.method || 'GET'

  if (url.pathname === '/sse' && method === 'GET') {
    openSse(req, res, state.sessions)
    return
  }
  if (url.pathname === '/message' && method === 'POST') {
    await postSseMessage(req, res, url, state)
    return
  }
  if (url.pathname === '/mcp' && method === 'POST') {
    await postStreamable(req, res, state)
    return
  }
  if (url.pathname === '/mcp' && method === 'GET') {
    writeJson(res, 405, { error: 'This bridge answers tools on POST /mcp' })
    return
  }
  if (url.pathname === '/mcp' && method === 'DELETE') {
    res.writeHead(200).end()
    return
  }
  writeJson(res, 404, { error: 'Not found' })
}

function openSse(req: IncomingMessage, res: ServerResponse, sessions: Map<string, ServerResponse>): void {
  const id = randomUUID()
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write(`event: endpoint\ndata: /message?sessionId=${id}\n\n`)
  sessions.set(id, res)
  const keepalive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n')
    }
  }, 15000)
  keepalive.unref()
  const finish = () => {
    clearInterval(keepalive)
    sessions.delete(id)
  }
  req.on('close', finish)
  res.on('close', finish)
}

async function postSseMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  state: { sessions: Map<string, ServerResponse>; context: McpContext },
): Promise<void> {
  const id = url.searchParams.get('sessionId') || ''
  const stream = state.sessions.get(id)
  if (!stream || stream.writableEnded) {
    writeJson(res, 404, { error: 'SSE session not found' })
    return
  }
  const response = await readAndHandle(req, state.context)
  if (response) {
    stream.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`)
  }
  res.writeHead(202).end()
}

async function postStreamable(
  req: IncomingMessage,
  res: ServerResponse,
  state: { sessionId: string; context: McpContext },
): Promise<void> {
  const requestedSession = headerValue(req.headers['mcp-session-id'])
  if (requestedSession && requestedSession !== state.sessionId) {
    writeJson(res, 404, { error: 'Session not found' })
    return
  }
  const response = await readAndHandle(req, state.context)
  if (!response) {
    res.writeHead(202).end()
    return
  }
  writeJson(res, 200, response, { 'Mcp-Session-Id': state.sessionId })
}

async function readAndHandle(
  req: IncomingMessage,
  context: McpContext,
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  const raw = await readBody(req)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }
  }
  if (Array.isArray(parsed)) {
    const responses: JsonRpcResponse[] = []
    for (const item of parsed) {
      const response = await handleMcpMessage(item, context)
      if (response) {
        responses.push(response)
      }
    }
    return responses.length ? responses : null
  }
  return handleMcpMessage(parsed, context)
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body is larger than 1 MB'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function closeServer(server: Server, sessions: Map<string, ServerResponse>): Promise<void> {
  sessions.forEach((stream) => {
    if (!stream.writableEnded) {
      stream.end()
    }
  })
  sessions.clear()
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

export function tokensMatch(provided: string, expected: string): boolean {
  const left = createHash('sha256').update(provided).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

function bearerToken(req: IncomingMessage): string {
  const header = headerValue(req.headers.authorization)
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : ''
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || ''
  }
  return value || ''
}

function isLoopback(address?: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function hostAllowed(host: string, port?: number): boolean {
  if (!port) {
    return false
  }
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

function originAllowed(origin: string): boolean {
  if (!origin || origin === 'null') {
    return true
  }
  try {
    const url = new URL(origin)
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  } catch (error) {
    return false
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extra,
  })
  res.end(payload)
}
