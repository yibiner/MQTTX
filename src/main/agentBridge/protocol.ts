/**
 * MCP tool surface for the connections that are already connected in MQTTX Plus.
 *
 * The server speaks the methods both transports need (initialize, tools/list, tools/call). It does
 * not open an MQTT session of its own, and it cannot connect one: every tool is answered by a
 * client the app has already connected.
 *
 * Reading is deliberately not tied to the view: `list_messages` and `wait_for_message` see the
 * stored messages of the connection plus what the page just received, so the direction tab, the
 * topic filter, the search box and the scroll position never hide a message from an agent.
 */
import type { AgentMessageFilter, AgentMessagePage, AgentPublishInput, AgentWaitResult } from '@/utils/agentBridge'
import { MAX_WAIT_MS } from '@/utils/agentBridge'

export class AgentBridgeInputError extends Error {}

export interface AgentSequenceTarget {
  /** Sequence id, or its name when the caller only knows that. */
  sequence?: string
  id?: string
  name?: string
  /** Which connected connection to use. Required when more than one is connected. */
  connectionId?: string
}

export interface AgentBridgeTools {
  getConnection(input?: { connectionId?: string }): Promise<unknown>
  publish(input: AgentPublishInput): Promise<unknown>
  listMessages(
    input: AgentMessageFilter & { limit?: number; afterId?: string; connectionId?: string },
  ): Promise<AgentMessagePage>
  waitForMessage(
    input: AgentMessageFilter & { timeoutMs?: number; afterId?: string; connectionId?: string },
  ): Promise<AgentWaitResult>
  startSequence(input: AgentSequenceTarget): Promise<unknown>
  stopSequence(input: AgentSequenceTarget): Promise<unknown>
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

const CONNECTION_ID_PROPERTY = {
  type: 'string',
  description:
    'The connectionId from get_connection. Required when more than one connection is connected. The agent can only use a connection that is already connected, and cannot open one.',
}

export const AGENT_BRIDGE_INSTRUCTIONS =
  'You are using MQTT connections that are already connected in MQTTX Plus. ' +
  'You cannot open a connection. Publish, read messages and run saved message sequences with these tools. Subscriptions, variables, automatic replies and message sequences stay in the app; do not recreate them or open your own MQTT client. ' +
  "A publish is shown in that connection's message list, and the tool result is the text the list shows. " +
  'list_messages and wait_for_message see every message of the connection you named, independent of which connection is on screen and of the filters and the scroll position of the list. ' +
  'Call get_connection first. With one connected connection it returns that connection. With several it returns a list: pass connectionId on later calls. A connection that is not connected is refused.'

const TOOLS = [
  {
    name: 'get_connection',
    description:
      'Read MQTT connections that are already connected in MQTTX Plus. With no connectionId: one connected connection returns its snapshot (name, broker, client id, subscriptions, variable values, automatic replies, message sequences); more than one returns { connections: [...] }. With connectionId: the snapshot of that connected connection. Does not open a connection. Do not copy its variables or sequences, and do not connect to the broker yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: CONNECTION_ID_PROPERTY,
      },
    },
  },
  {
    name: 'publish',
    description:
      "Publish one message through a connection that is already connected. The message is appended to that connection's message list and marked Agent. The result is the topic and payload after ${name} placeholders are filled from that connection's variables. payload is UTF-8 text. Does not open a connection.",
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'MQTT topic. ${name} placeholders are filled from the connection.' },
        payload: { type: 'string', description: 'UTF-8 payload. Empty is allowed.' },
        qos: { type: 'integer', enum: [0, 1, 2], description: 'Defaults to 0.' },
        retain: { type: 'boolean', description: 'Defaults to false.' },
        connectionId: CONNECTION_ID_PROPERTY,
      },
      required: ['topic', 'payload'],
    },
  },
  {
    name: 'list_messages',
    description:
      'Read the recent messages of a connected connection, oldest first, newest `limit`. This is the stored history plus what arrived a moment ago, so which connection is on screen, and the direction tab, the topic filter, the search box and the scroll position of the list, do not affect it. Pass afterId of the last message you saw to read only newer ones. When cursorReset is true, that id is older than the returned window and the messages are the newest page.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Defaults to 30.' },
        afterId: { type: 'string', description: 'Return messages after this id.' },
        topic: { type: 'string', description: 'MQTT topic filter, e.g. device/+/state or device/#' },
        direction: {
          type: 'string',
          enum: ['in', 'out'],
          description: 'in = received by the connection, out = published by it.',
        },
        contains: { type: 'string', description: 'Keep messages whose payload contains this text.' },
        connectionId: CONNECTION_ID_PROPERTY,
      },
    },
  },
  {
    name: 'wait_for_message',
    description:
      'Wait for the next message a connected connection receives or publishes that matches the filter, and return it. Use it instead of polling after a publish. Resolves with matched true as soon as one arrives; on timeout it returns matched false and a hint. Switching the connection on screen does not cancel the wait.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'MQTT topic filter, e.g. device/+/state' },
        direction: { type: 'string', enum: ['in', 'out'], description: 'Defaults to any direction.' },
        contains: { type: 'string', description: 'Keep messages whose payload contains this text.' },
        afterId: {
          type: 'string',
          description: 'Only consider messages after this id, so a message you already read is not matched again.',
        },
        timeoutMs: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_WAIT_MS,
          description: `How long to wait. Defaults to 10000, maximum ${MAX_WAIT_MS}.`,
        },
        connectionId: CONNECTION_ID_PROPERTY,
      },
    },
  },
  {
    name: 'start_sequence',
    description:
      'Start one of the message sequences saved on a connected connection, by id or by name. This is the same run the user starts from the app: the steps, their delays and the variable writes stay in the app. Returns the sequence state. Does not open a connection.',
    inputSchema: {
      type: 'object',
      properties: {
        sequence: { type: 'string', description: 'Sequence id or its name as get_connection reports it.' },
        connectionId: CONNECTION_ID_PROPERTY,
      },
      required: ['sequence'],
    },
  },
  {
    name: 'stop_sequence',
    description:
      'Stop a running message sequence of a connected connection, by id or by name. Steps that have not been sent yet are dropped.',
    inputSchema: {
      type: 'object',
      properties: {
        sequence: { type: 'string', description: 'Sequence id or its name as get_connection reports it.' },
        connectionId: CONNECTION_ID_PROPERTY,
      },
      required: ['sequence'],
    },
  },
]

export function parseGetConnectionArguments(args: unknown): { connectionId?: string } {
  if (args === undefined || args === null) {
    return {}
  }
  const record = objectArguments(args, 'get_connection')
  const connectionId = optionalString(record.connectionId, 'connectionId')
  return connectionId ? { connectionId } : {}
}

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
  const input: AgentPublishInput = { topic, payload: record.payload, qos, retain: record.retain === true }
  const connectionId = optionalString(record.connectionId, 'connectionId')
  if (connectionId) {
    input.connectionId = connectionId
  }
  return input
}

export function parseListArguments(args: unknown): AgentMessageFilter & {
  limit?: number
  afterId?: string
  connectionId?: string
} {
  const parsed: AgentMessageFilter & { limit?: number; afterId?: string; connectionId?: string } = parseFilterArguments(
    args,
    'list_messages',
  )
  if (args === undefined || args === null) {
    return parsed
  }
  const record = args as Record<string, unknown>
  applyMessageLimit(record, parsed)
  applyAfterId(record, parsed)
  applyConnectionId(record, parsed)
  return parsed
}

export function parseWaitArguments(args: unknown): AgentMessageFilter & {
  timeoutMs?: number
  afterId?: string
  connectionId?: string
} {
  const parsed: AgentMessageFilter & { timeoutMs?: number; afterId?: string; connectionId?: string } =
    parseFilterArguments(args, 'wait_for_message')
  if (args === undefined || args === null) {
    return parsed
  }
  const record = args as Record<string, unknown>
  if (record.timeoutMs !== undefined) {
    if (
      !Number.isInteger(record.timeoutMs) ||
      (record.timeoutMs as number) < 1 ||
      (record.timeoutMs as number) > MAX_WAIT_MS
    ) {
      throw new AgentBridgeInputError(`timeoutMs must be an integer from 1 to ${MAX_WAIT_MS}`)
    }
    parsed.timeoutMs = record.timeoutMs as number
  }
  applyAfterId(record, parsed)
  applyConnectionId(record, parsed)
  return parsed
}

function applyMessageLimit(record: Record<string, unknown>, parsed: { limit?: number }): void {
  if (record.limit === undefined) {
    return
  }
  if (!Number.isInteger(record.limit) || (record.limit as number) < 1 || (record.limit as number) > 100) {
    throw new AgentBridgeInputError('limit must be an integer from 1 to 100')
  }
  parsed.limit = record.limit as number
}

function applyAfterId(record: Record<string, unknown>, parsed: { afterId?: string }): void {
  if (record.afterId === undefined) {
    return
  }
  if (typeof record.afterId !== 'string' || !record.afterId) {
    throw new AgentBridgeInputError('afterId must be a message id')
  }
  parsed.afterId = record.afterId
}

function applyConnectionId(record: Record<string, unknown>, parsed: { connectionId?: string }): void {
  const connectionId = optionalString(record.connectionId, 'connectionId')
  if (connectionId) {
    parsed.connectionId = connectionId
  }
}

export function parseSequenceArguments(args: unknown, tool: string): AgentSequenceTarget {
  const record = objectArguments(args, tool)
  const target: AgentSequenceTarget = {}
  const sequence =
    typeof record.sequence === 'string'
      ? record.sequence.trim()
      : typeof record.id === 'string'
      ? record.id.trim()
      : typeof record.name === 'string'
      ? record.name.trim()
      : ''
  if (!sequence) {
    throw new AgentBridgeInputError('sequence is required: the id or the name from get_connection')
  }
  target.sequence = sequence
  const connectionId = optionalString(record.connectionId, 'connectionId')
  if (connectionId) {
    target.connectionId = connectionId
  }
  return target
}

function parseFilterArguments(args: unknown, tool: string): AgentMessageFilter {
  const filter: AgentMessageFilter = {}
  if (args === undefined || args === null) {
    return filter
  }
  const record = objectArguments(args, tool)
  const topic = optionalString(record.topic, 'topic')
  if (topic) {
    filter.topic = topic
  }
  if (record.direction !== undefined) {
    if (record.direction !== 'in' && record.direction !== 'out') {
      throw new AgentBridgeInputError('direction must be in or out')
    }
    filter.direction = record.direction
  }
  const contains = optionalString(record.contains, 'contains')
  if (contains) {
    filter.contains = contains
  }
  return filter
}

function optionalString(value: unknown, field: string): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value !== 'string') {
    throw new AgentBridgeInputError(`${field} must be a string`)
  }
  return value.trim()
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
      return toolText(await tools.getConnection(parseGetConnectionArguments(args)))
    }
    if (name === 'publish') {
      return toolText(await tools.publish(parsePublishArguments(args)))
    }
    if (name === 'list_messages') {
      return toolText(await tools.listMessages(parseListArguments(args)))
    }
    if (name === 'wait_for_message') {
      return toolText(await tools.waitForMessage(parseWaitArguments(args)))
    }
    if (name === 'start_sequence') {
      return toolText(await tools.startSequence(parseSequenceArguments(args, 'start_sequence')))
    }
    if (name === 'stop_sequence') {
      return toolText(await tools.stopSequence(parseSequenceArguments(args, 'stop_sequence')))
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
