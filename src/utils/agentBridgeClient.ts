/**
 * Receives a tool call from the main process and runs it on the connection page that registered
 * itself. The page is the only place that both owns the MQTT client and draws the message list.
 */
import { ipcRenderer } from 'electron'
import { AgentPublishInput } from '@/utils/agentBridge'
import type { AgentBridgeTools } from '@/main/agentBridge/protocol'

/** What this page must answer; the same methods the MCP tool list exposes. */
export type AgentBridgeHandler = AgentBridgeTools

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
    return current.getConnection()
  }
  if (method === 'publish') {
    return current.publish(params as AgentPublishInput)
  }
  if (method === 'list_messages') {
    return current.listMessages((params || {}) as Parameters<AgentBridgeTools['listMessages']>[0])
  }
  if (method === 'wait_for_message') {
    return current.waitForMessage((params || {}) as Parameters<AgentBridgeTools['waitForMessage']>[0])
  }
  if (method === 'start_sequence') {
    return current.startSequence((params || {}) as Parameters<AgentBridgeTools['startSequence']>[0])
  }
  if (method === 'stop_sequence') {
    return current.stopSequence((params || {}) as Parameters<AgentBridgeTools['stopSequence']>[0])
  }
  throw new Error(`Unknown tool: ${method}`)
}

function reply(id: string, ok: boolean, result?: unknown, error?: string): void {
  ipcRenderer.send('agent-bridge:result', { id, ok, result, error })
}
