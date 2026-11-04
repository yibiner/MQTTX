/**
 * The shape of the local MCP bridge, shared by the connection view and the main-process server.
 *
 * An external agent publishes and reads through connections the app has already connected.
 * It cannot open one. Subscriptions, variables and message sequences stay in this app, so the
 * objects below are a view of that connection, never a second copy of its state.
 *
 * Two rules shape the tool surface:
 *
 *   - Reading is independent of which connection is on screen. `list_messages` answers from the
 *     stored messages plus that connection's own log, so scrolling, the direction tab, the topic
 *     filter and the search box change nothing an agent can see.
 *   - A call names the connection by id. With one connection connected, the id can be omitted.
 *     A connection that is not connected is refused, and the agent does not connect it.
 */
import { matchTopicMethod } from '@/utils/topicMatch'

export interface AgentPublishInput {
  topic: string
  payload: string
  qos: 0 | 1 | 2
  retain: boolean
  /** Which connected connection to use. Required when more than one is connected. */
  connectionId?: string
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

/** One variable of the open connection, as the agent may read it. */
export interface AgentVariableValue {
  name: string
  kind: string
  scope: string
  /** Current value; null while a stateful variable has not been resolved yet. */
  value: string | null
}

export interface AgentSequenceInfo {
  id: string
  name: string
  enabled: boolean
  trigger: string
  /** True while a step is waiting or in flight. */
  running: boolean
  steps: number
}

export interface AgentAutoReplyInfo {
  name: string
  enabled: boolean
  matchTopic: string
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
  sequences: AgentSequenceInfo[]
  variables: AgentVariableValue[]
  /** Rules the app answers by itself; the agent should not send the same reply twice. */
  autoReplies: AgentAutoReplyInfo[]
}

/** What a `list_messages` / `wait_for_message` call can narrow down to. */
export interface AgentMessageFilter {
  /** MQTT topic filter (`+`, `#`, or `$share/...`). */
  topic?: string
  direction?: 'in' | 'out'
  /** Case-sensitive substring of the payload. */
  contains?: string
}

export interface AgentMessagePage {
  messages: AgentDisplayedMessage[]
  /** True when `afterId` is gone, so the returned messages are the newest page. */
  cursorReset: boolean
}

export interface AgentWaitResult {
  matched: boolean
  waitedMs: number
  message?: AgentDisplayedMessage
  hint?: string
}

/** What `wait_for_message` narrows down to, plus how far back an arrival still counts. */
export interface AgentWaitOptions extends AgentMessageFilter {
  timeoutMs?: number
  /** Only an arrival after this message id counts. */
  afterId?: string
  /**
   * `createAt` of `afterId`, resolved by the page. The feed drops old arrivals, so the id the agent
   * names is often no longer held there; without this the wait could not tell newer from older.
   */
  afterCreateAt?: string
}

const DEFAULT_MESSAGE_LIMIT = 30
const MAX_MESSAGE_LIMIT = 100
const DEFAULT_WAIT_MS = 10000
export const MAX_WAIT_MS = 60000
/** How many arrivals the page keeps for the agent; older ones are still in the store. */
export const MAX_BUFFERED_MESSAGES = 200

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
 * Stored messages plus the ones this page saw that are not in the store yet (QoS 0 when the user
 * asked to skip those, and everything inside the one-second write buffer).
 *
 * The two sources overlap: a row can be in the store and still in the page log. The page log also
 * starts before the stored page does (the store only answers with its newest rows), so appending it
 * would put old arrivals at the end and make them look newest. The merge therefore dedupes by id and
 * restores arrival order by `createAt`, which is what "newest `limit`" below relies on.
 */
export function mergeAgentMessages(
  persisted: AgentDisplayedMessage[],
  live: AgentDisplayedMessage[],
): AgentDisplayedMessage[] {
  const merged = persisted.slice()
  const seen = new Set(merged.map((message) => message.id))
  live.forEach((message) => {
    if (!message.id || seen.has(message.id)) {
      return
    }
    seen.add(message.id)
    merged.push(message)
  })
  // Both sources carry the sqlite `createAt` format, so the string order is the arrival order.
  // Array.prototype.sort is stable, so rows sharing a timestamp keep the order they came in.
  return merged.sort((left, right) => (left.createAt < right.createAt ? -1 : left.createAt > right.createAt ? 1 : 0))
}

/** Keep the tail of an arrival log, so a long verification run cannot grow without bound. */
export function appendAgentMessage(
  log: AgentDisplayedMessage[],
  message: AgentDisplayedMessage,
): AgentDisplayedMessage[] {
  if (!message.id) {
    return log
  }
  const next = log.concat([message])
  return next.length > MAX_BUFFERED_MESSAGES ? next.slice(next.length - MAX_BUFFERED_MESSAGES) : next
}

export function matchAgentMessage(message: AgentDisplayedMessage, filter: AgentMessageFilter = {}): boolean {
  if (filter.direction && message.direction !== filter.direction) {
    return false
  }
  if (filter.topic && !matchTopicMethod(filter.topic, message.topic)) {
    return false
  }
  if (filter.contains && !message.payload.includes(filter.contains)) {
    return false
  }
  return true
}

export function filterAgentMessages(
  messages: AgentDisplayedMessage[],
  filter: AgentMessageFilter = {},
): AgentDisplayedMessage[] {
  return messages.filter((message) => matchAgentMessage(message, filter))
}

/** "topic device/+/ack, direction in, payload contains \"OTA\"" — used when a wait times out. */
export function describeAgentFilter(filter: AgentMessageFilter = {}): string {
  const parts: string[] = []
  if (filter.topic) parts.push(`topic ${filter.topic}`)
  if (filter.direction) parts.push(`direction ${filter.direction}`)
  if (filter.contains) parts.push(`payload contains ${JSON.stringify(filter.contains)}`)
  return parts.length ? parts.join(', ') : 'any message'
}

/** Index of `afterId` in the given messages, or -1 when it is not there (already pruned or older). */
export function agentMessageIndex(messages: AgentDisplayedMessage[], afterId?: string): number {
  if (!afterId) {
    return -1
  }
  return messages.findIndex((message) => message.id === afterId)
}

/** Where an `afterId` sits inside a page: everything after it, or `cursorReset` when it is gone. */
export function messagesAfter(
  messages: AgentDisplayedMessage[],
  afterId?: string,
): { rows: AgentDisplayedMessage[]; cursorReset: boolean } {
  if (!afterId) {
    return { rows: messages, cursorReset: false }
  }
  const index = agentMessageIndex(messages, afterId)
  return index >= 0 ? { rows: messages.slice(index + 1), cursorReset: false } : { rows: messages, cursorReset: true }
}

export function clampMessageLimit(limit?: number): number {
  if (!Number.isInteger(limit)) {
    return DEFAULT_MESSAGE_LIMIT
  }
  return Math.min(MAX_MESSAGE_LIMIT, Math.max(1, limit as number))
}

export function clampWaitMs(timeoutMs?: number): number {
  if (!Number.isInteger(timeoutMs)) {
    return DEFAULT_WAIT_MS
  }
  return Math.min(MAX_WAIT_MS, Math.max(1, timeoutMs as number))
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
  messageSequences?: Array<{
    id?: string
    name: string
    enabled: boolean
    trigger: string
    steps?: Array<unknown>
  }> | null
  runningSequenceIds?: string[]
  variables?: AgentVariableValue[]
  autoReplies?: Array<{ name: string; enabled: boolean; matchTopic: string }> | null
}): AgentConnectionSnapshot {
  const running = new Set(input.runningSequenceIds || [])
  const sequences = (input.messageSequences || []).map((sequence) => ({
    id: sequence.id || '',
    name: sequence.name,
    enabled: !!sequence.enabled,
    trigger: sequence.trigger,
    running: running.has(sequence.id || ''),
    steps: (sequence.steps || []).length,
  }))
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
    sequences,
    variables: (input.variables || []).map((variable) => ({
      name: variable.name,
      kind: variable.kind,
      scope: variable.scope,
      value: variable.value === undefined ? null : variable.value,
    })),
    autoReplies: (input.autoReplies || []).map((rule) => ({
      name: rule.name,
      enabled: !!rule.enabled,
      matchTopic: rule.matchTopic,
    })),
  }
  if (input.path) {
    snapshot.path = input.path
  }
  return snapshot
}

/**
 * Refuses a call that names a connection other than the open one, instead of sending to whichever
 * device happens to be on screen. `undefined` keeps the old "use the open one" behavior.
 */
export function agentConnectionMismatch(
  expected: string | undefined,
  current: { id?: string; name?: string },
): string | null {
  if (!expected || !current.id || expected === current.id) {
    return null
  }
  return (
    `The open connection changed: it is now "${current.name || current.id}" (${current.id}), not ${expected}. ` +
    'Call get_connection again before publishing or reading.'
  )
}

/** Streamable HTTP entry for a local AI agent. */
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
