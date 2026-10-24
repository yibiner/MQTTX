/**
 * The shape of the local MCP bridge, shared by the connection view and the main-process server.
 *
 * An external agent publishes and reads through the connection that is on screen. Subscriptions,
 * variables and message sequences stay in this app, so the objects below are a view of that
 * connection, never a second copy of its state.
 */

export interface AgentPublishInput {
  topic: string
  payload: string
  qos: 0 | 1 | 2
  retain: boolean
}

export interface AgentDisplayedMessage {
  id: string
  direction: 'in' | 'out'
  topic: string
  payload: string
  qos: number
  retain: boolean
  createAt: string
  /** Set when this bridge published the message, so the list can mark it. */
  source?: 'agent'
}

export interface AgentConnectionSnapshot {
  connectionId: string
  name: string
  clientId: string
  protocol: string
  host: string
  port: number
  path?: string
  connected: boolean
  subscriptions: Array<{ topic: string; qos: number; disabled: boolean }>
  sequences: Array<{ name: string; enabled: boolean; trigger: string }>
}

const DEFAULT_MESSAGE_LIMIT = 30
const MAX_MESSAGE_LIMIT = 100

export function messageFromAgent(message: { meta?: string }): boolean {
  if (!message.meta) {
    return false
  }
  try {
    return JSON.parse(message.meta).agent === true
  } catch (error) {
    return false
  }
}

export function toAgentMessage(message: MessageModel): AgentDisplayedMessage {
  const displayed: AgentDisplayedMessage = {
    id: message.id || '',
    direction: message.out ? 'out' : 'in',
    topic: message.topic,
    payload: message.payload,
    qos: message.qos,
    retain: !!message.retain,
    createAt: message.createAt,
  }
  if (messageFromAgent(message)) {
    displayed.source = 'agent'
  }
  return displayed
}

/**
 * The messages the connection page is showing, oldest first, capped to the newest `limit`.
 * `afterId` drops everything up to and including that message. When the id is no longer in the
 * visible list, `cursorReset` is true and the newest page is returned so the caller can resync
 * instead of waiting on a cursor that will never appear.
 */
export function selectAgentMessages(
  messages: AgentDisplayedMessage[],
  input: { limit?: number; afterId?: string } = {},
): { messages: AgentDisplayedMessage[]; cursorReset: boolean } {
  const limit = clampMessageLimit(input.limit)
  let rows = messages
  let cursorReset = false
  if (input.afterId) {
    const index = rows.findIndex((message) => message.id === input.afterId)
    if (index >= 0) {
      rows = rows.slice(index + 1)
    } else {
      cursorReset = true
    }
  }
  return { messages: rows.slice(-limit), cursorReset }
}

export function clampMessageLimit(limit?: number): number {
  if (!Number.isInteger(limit)) {
    return DEFAULT_MESSAGE_LIMIT
  }
  return Math.min(MAX_MESSAGE_LIMIT, Math.max(1, limit as number))
}

/**
 * What an agent needs in order to use the open connection. Credentials are not part of this
 * object: the agent does not open its own MQTT session.
 */
export function describeConnection(input: {
  id?: string
  name?: string
  clientId?: string
  protocol?: string
  host?: string
  port?: number
  path?: string
  connected: boolean
  subscriptions?: Array<{ topic: string; qos: number; disabled?: boolean | null }>
  messageSequences?: Array<{ name: string; enabled: boolean; trigger: string }> | null
}): AgentConnectionSnapshot {
  const snapshot: AgentConnectionSnapshot = {
    connectionId: input.id || '',
    name: input.name || '',
    clientId: input.clientId || '',
    protocol: input.protocol || '',
    host: input.host || '',
    port: input.port || 0,
    connected: input.connected,
    subscriptions: (input.subscriptions || []).map((subscription) => ({
      topic: subscription.topic,
      qos: subscription.qos,
      disabled: !!subscription.disabled,
    })),
    sequences: (input.messageSequences || []).map((sequence) => ({
      name: sequence.name,
      enabled: !!sequence.enabled,
      trigger: sequence.trigger,
    })),
  }
  if (input.path) {
    snapshot.path = input.path
  }
  return snapshot
}

/** Cursor and Claude Code both accept this streamable-HTTP entry. */
export function agentBridgeClientConfig(port: number, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        'mqttx-plus': {
          type: 'http',
          url: `http://127.0.0.1:${port}/mcp`,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2,
  )
}

export function agentBridgeSseUrl(port: number): string {
  return `http://127.0.0.1:${port}/sse`
}
