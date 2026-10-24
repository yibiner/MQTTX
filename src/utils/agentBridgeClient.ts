/**
 * Receives a tool call from the main process and runs it on the connection page that registered
 * itself. The page is the only place that both owns the MQTT client and draws the message list.
 */
import { ipcRenderer } from 'electron'
import { AgentPublishInput } from '@/utils/agentBridge'

export interface AgentBridgeHandler {
  describe(): Promise<unknown> | unknown
  publish(input: AgentPublishInput): Promise<unknown>
  listMessages(input: { limit?: number; afterId?: string }): Promise<unknown> | unknown
}

const NO_CONNECTION = 'Open a connection in MQTTX Plus. The bridge uses the connection currently on screen.'

let handler: AgentBridgeHandler | null = null
let listening = false

export function attachAgentBridge(next: AgentBridgeHandler): void {
  handler = next
  ensureListening()
  ipcRenderer.send('agent-bridge:focus')
}

export function detachAgentBridge(next: AgentBridgeHandler): void {
  if (handler !== next) {
    return
  }
  handler = null
  ipcRenderer.send('agent-bridge:blur')
}

export function focusAgentBridge(): void {
  if (handler) {
    ipcRenderer.send('agent-bridge:focus')
  }
}

function ensureListening(): void {
  if (listening) {
    return
  }
  listening = true
  ipcRenderer.on('agent-bridge:call', async (_event, request: { id: string; method: string; params?: unknown }) => {
    const current = handler
    if (!current) {
      reply(request.id, false, undefined, NO_CONNECTION)
      return
    }
    try {
      const result = await dispatch(current, request.method, request.params)
      reply(request.id, true, result)
    } catch (error) {
      reply(request.id, false, undefined, error instanceof Error ? error.message : String(error))
    }
  })
}

async function dispatch(current: AgentBridgeHandler, method: string, params: unknown): Promise<unknown> {
  if (method === 'get_connection') {
    return current.describe()
  }
  if (method === 'publish') {
    return current.publish(params as AgentPublishInput)
  }
  if (method === 'list_messages') {
    return current.listMessages((params || {}) as { limit?: number; afterId?: string })
  }
  throw new Error(`Unknown tool: ${method}`)
}

function reply(id: string, ok: boolean, result?: unknown, error?: string): void {
  ipcRenderer.send('agent-bridge:result', { id, ok, result, error })
}
