/**
 * MCP tool surface for the connection that is open in MQTTX Plus.
 *
 * The server speaks the methods both transports need (initialize, tools/list, tools/call). It does
 * not open an MQTT session of its own: every tool is answered by the window that is showing the
 * connection, which is also what puts a publish into the message list.
 */
import type { AgentPublishInput } from '@/utils/agentBridge'

export class AgentBridgeInputError extends Error {}

export interface AgentBridgeTools {
  getConnection(): Promise<unknown>
  publish(input: AgentPublishInput): Promise<unknown>
  listMessages(input: { limit?: number; afterId?: string }): Promise<unknown>
}

export interface McpContext {
  serverVersion: string
  tools: AgentBridgeTools
}

interface JsonRpcRequest {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: { protocolVersion?: string; name?: string; arguments?: unknown }
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

const SUPPORTED_PROTOCOL_VERSIONS = ['2024-11-05', '2025-03-26', '2025-06-18']
const DEFAULT_PROTOCOL_VERSION = '2025-03-26'

export const AGENT_BRIDGE_INSTRUCTIONS =
  'You are using the MQTT connection currently open in MQTTX Plus. ' +
  'Publish and read messages with these tools. Subscriptions, variables, automatic replies and message sequences stay in the app; do not recreate them or open your own MQTT client. ' +
  "A publish is shown in that connection's message list, and the tool result is the text the list shows. " +
  'Call get_connection again when the user may have switched connections, because the bridge follows the connection on screen.'

const TOOLS = [
  {
    name: 'get_connection',
    description:
      'Read the MQTT connection currently open in MQTTX Plus: name, broker, client id, whether it is connected, its subscriptions and the names of its message sequences. This is the simulated device. Do not copy its variables or sequences, and do not connect to the broker yourself.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'publish',
    description:
      "Publish one message through the open connection, the same way the publish panel does. The message is appended to that connection's message list and marked Agent. The result is the topic and payload the list shows, after ${name} placeholders are filled from the connection's variables. payload is UTF-8 text.",
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'MQTT topic. ${name} placeholders are filled from the connection.' },
        payload: { type: 'string', description: 'UTF-8 payload. Empty is allowed.' },
        qos: { type: 'integer', enum: [0, 1, 2], description: 'Defaults to 0.' },
        retain: { type: 'boolean', description: 'Defaults to false.' },
      },
      required: ['topic', 'payload'],
    },
  },
  {
    name: 'list_messages',
    description:
      'Read the messages currently shown for the open connection, oldest first. Includes messages it received and messages it sent (manual, sequence, automatic reply, and this bridge). Pass afterId of the last message you have seen to read only newer ones. When cursorReset is true, that id is no longer on screen and the returned messages are the newest visible page.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Defaults to 30.' },
        afterId: { type: 'string', description: 'Return messages after this id.' },
      },
    },
  },
]

export function parsePublishArguments(args: unknown): AgentPublishInput {
  const record = objectArguments(args, 'publish')
  const topic = typeof record.topic === 'string' ? record.topic.trim() : ''
  if (!topic) {
    throw new AgentBridgeInputError('topic is required')
  }
  if (typeof record.payload !== 'string') {
    throw new AgentBridgeInputError('payload must be a string')
  }
  let qos: 0 | 1 | 2 = 0
  if (record.qos !== undefined) {
    if (record.qos !== 0 && record.qos !== 1 && record.qos !== 2) {
      throw new AgentBridgeInputError('qos must be 0, 1 or 2')
    }
    qos = record.qos
  }
  if (record.retain !== undefined && typeof record.retain !== 'boolean') {
    throw new AgentBridgeInputError('retain must be a boolean')
  }
  return { topic, payload: record.payload, qos, retain: record.retain === true }
}

export function parseListArguments(args: unknown): { limit?: number; afterId?: string } {
  if (args === undefined || args === null) {
    return {}
  }
  const record = objectArguments(args, 'list_messages')
  const parsed: { limit?: number; afterId?: string } = {}
  if (record.limit !== undefined) {
    if (!Number.isInteger(record.limit) || (record.limit as number) < 1 || (record.limit as number) > 100) {
      throw new AgentBridgeInputError('limit must be an integer from 1 to 100')
    }
    parsed.limit = record.limit as number
  }
  if (record.afterId !== undefined) {
    if (typeof record.afterId !== 'string' || !record.afterId) {
      throw new AgentBridgeInputError('afterId must be a message id')
    }
    parsed.afterId = record.afterId
  }
  return parsed
}

export async function handleMcpMessage(message: unknown, context: McpContext): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return rpcError(null, -32600, 'Invalid request')
  }
  const request = message as JsonRpcRequest
  if (request.jsonrpc !== undefined && request.jsonrpc !== '2.0') {
    return rpcError(request.id ?? null, -32600, 'Invalid request')
  }
  if (!request.method || typeof request.method !== 'string') {
    return rpcError(request.id ?? null, -32600, 'Invalid request')
  }
  if (isNotification(request)) {
    return null
  }
  const id = request.id ?? null
  try {
    switch (request.method) {
      case 'initialize':
        return rpcResult(id, {
          protocolVersion: negotiateProtocol(request.params?.protocolVersion),
          capabilities: { tools: {} },
          serverInfo: { name: 'mqttx-plus', version: context.serverVersion },
          instructions: AGENT_BRIDGE_INSTRUCTIONS,
        })
      case 'ping':
        return rpcResult(id, {})
      case 'tools/list':
        return rpcResult(id, { tools: TOOLS })
      case 'tools/call':
        return rpcResult(id, await callTool(request.params, context.tools))
      default:
        return rpcError(id, -32601, `Method not found: ${request.method}`)
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    return rpcError(id, -32603, text)
  }
}

async function callTool(
  params: JsonRpcRequest['params'] | undefined,
  tools: AgentBridgeTools,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const name = params?.name
  const args = params?.arguments
  try {
    if (name === 'get_connection') {
      return toolText(await tools.getConnection())
    }
    if (name === 'publish') {
      return toolText(await tools.publish(parsePublishArguments(args)))
    }
    if (name === 'list_messages') {
      return toolText(await tools.listMessages(parseListArguments(args)))
    }
    return toolText(`Unknown tool: ${name || ''}`, true)
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    return toolText(text, true)
  }
}

function negotiateProtocol(requested?: string): string {
  if (requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested
  }
  return DEFAULT_PROTOCOL_VERSION
}

function objectArguments(args: unknown, tool: string): Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new AgentBridgeInputError(`${tool} arguments must be an object`)
  }
  return args as Record<string, unknown>
}

function isNotification(request: JsonRpcRequest): boolean {
  return !Object.prototype.hasOwnProperty.call(request, 'id')
}

function toolText(
  value: unknown,
  isError = false,
): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] }
}

function rpcResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}
