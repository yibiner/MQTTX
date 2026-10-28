/**
 * Ties the local MCP server to the connection page.
 *
 * The MQTT client and the message list live in the renderer that is showing the connection. Tool
 * calls are forwarded there, and the answer is whatever that page published and drew. A second
 * MQTTX process would not see that list, so the server runs inside this process and only while
 * the user has turned the bridge on.
 */
import { ipcMain, WebContents } from 'electron'
import { randomBytes, randomUUID } from 'crypto'
import version from '@/version'
import { agentBridgeClientConfig, agentBridgeSseUrl } from '@/utils/agentBridge'
import type { AgentMessagePage, AgentWaitResult } from '@/utils/agentBridge'
import { startAgentBridgeServer, AgentBridgeServer } from './http'
import type { AgentBridgeTools } from './protocol'

const ENABLED_KEY = 'agentBridge.enabled'
const TOKEN_KEY = 'agentBridge.token'
const PORT_KEY = 'agentBridge.port'
const DEFAULT_PORT = 21883
const PORT_TRIES = 10
const READ_TIMEOUT_MS = 8000
const PUBLISH_TIMEOUT_MS = 20000
/** A wait tool call answers on its own timeout; this only catches a page that stopped answering. */
const WAIT_TIMEOUT_MS = 70000

interface AgentBridgeStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface AgentBridgeStatus {
  enabled: boolean
  port: number | null
  url: string
  sseUrl: string
  config: string
  error: string
}

let store: AgentBridgeStore | null = null
let server: AgentBridgeServer | null = null
let starting: Promise<string> | null = null
let target: WebContents | null = null
let lastError = ''
let handlersReady = false

const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
>()

export function initAgentBridge(nextStore: AgentBridgeStore): void {
  store = nextStore
  if (!handlersReady) {
    handlersReady = true
    ipcMain.on('agent-bridge:focus', (event) => {
      rememberTarget(event.sender)
    })
    ipcMain.on('agent-bridge:blur', (event) => {
      if (target === event.sender) {
        target = null
      }
    })
    ipcMain.on(
      'agent-bridge:result',
      (_event, message: { id?: string; ok?: boolean; result?: unknown; error?: string }) => {
        if (!message?.id) {
          return
        }
        const waiting = pending.get(message.id)
        if (!waiting) {
          return
        }
        clearTimeout(waiting.timer)
        pending.delete(message.id)
        if (message.ok) {
          waiting.resolve(message.result)
        } else {
          waiting.reject(new Error(message.error || 'The connection did not answer'))
        }
      },
    )
    ipcMain.handle('agent-bridge:get-status', () => currentStatus())
    ipcMain.handle('agent-bridge:set-enabled', async (_event, enabled: boolean) => {
      if (!store) {
        return currentStatus()
      }
      store.set(ENABLED_KEY, !!enabled)
      if (enabled) {
        lastError = await startServer()
      } else {
        await stopAgentBridge()
        lastError = ''
      }
      return currentStatus()
    })
  }
  if (store.get(ENABLED_KEY) === true) {
    startServer().then((error) => {
      lastError = error
    })
  }
}

export async function stopAgentBridge(): Promise<void> {
  const current = server
  server = null
  if (!current) {
    return
  }
  await current.close()
}

function rememberTarget(contents: WebContents): void {
  if (target === contents) {
    return
  }
  target = contents
  contents.once('destroyed', () => {
    if (target === contents) {
      target = null
    }
  })
}

async function startServer(): Promise<string> {
  if (!store) {
    return 'The agent bridge is not ready'
  }
  if (server) {
    return ''
  }
  if (starting) {
    return starting
  }
  starting = startServerOnce().finally(() => {
    starting = null
  })
  return starting
}

async function startServerOnce(): Promise<string> {
  if (!store) {
    return 'The agent bridge is not ready'
  }
  const token = ensureToken(store)
  try {
    server = await startAgentBridgeServer({
      token,
      ports: portCandidates(Number(store.get(PORT_KEY)) || DEFAULT_PORT),
      context: {
        serverVersion: version,
        tools: rendererTools(),
      },
    })
    store.set(PORT_KEY, server.port)
    console.log(`[agent-bridge] listening on 127.0.0.1:${server.port}`)
    return ''
  } catch (error) {
    server = null
    store.set(ENABLED_KEY, false)
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[agent-bridge] failed to listen: ${message}`)
    return message
  }
}

function rendererTools(): AgentBridgeTools {
  return {
    getConnection: () => callRenderer('get_connection', {}, READ_TIMEOUT_MS),
    publish: (input) => callRenderer('publish', input, PUBLISH_TIMEOUT_MS),
    listMessages: (input) => callRenderer<AgentMessagePage>('list_messages', input, READ_TIMEOUT_MS),
    waitForMessage: (input) => callRenderer<AgentWaitResult>('wait_for_message', input, WAIT_TIMEOUT_MS),
    startSequence: (input) => callRenderer('start_sequence', input, PUBLISH_TIMEOUT_MS),
    stopSequence: (input) => callRenderer('stop_sequence', input, READ_TIMEOUT_MS),
  }
}

function callRenderer<T>(method: string, params: unknown, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (!target || target.isDestroyed()) {
      reject(new Error('Open a connection in MQTTX Plus. The bridge uses the connection currently on screen.'))
      return
    }
    const id = randomUUID()
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('MQTTX Plus did not answer in time. Keep the connection page open.'))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    target.send('agent-bridge:call', { id, method, params })
  })
}

function currentStatus(): AgentBridgeStatus {
  const enabled = store?.get(ENABLED_KEY) === true
  const port = server ? server.port : null
  const token = port && store ? String(store.get(TOKEN_KEY) || '') : ''
  return {
    enabled,
    port,
    url: port ? `http://127.0.0.1:${port}/mcp` : '',
    sseUrl: port ? agentBridgeSseUrl(port) : '',
    config: port ? agentBridgeClientConfig(port, token) : '',
    error: lastError,
  }
}

function ensureToken(current: AgentBridgeStore): string {
  const existing = current.get(TOKEN_KEY)
  if (typeof existing === 'string' && existing) {
    return existing
  }
  const token = randomBytes(24).toString('hex')
  current.set(TOKEN_KEY, token)
  return token
}

function portCandidates(preferred: number): number[] {
  const ports: number[] = []
  if (preferred >= DEFAULT_PORT && preferred < DEFAULT_PORT + PORT_TRIES) {
    ports.push(preferred)
  }
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + PORT_TRIES; port += 1) {
    if (!ports.includes(port)) {
      ports.push(port)
    }
  }
  return ports
}
