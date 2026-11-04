/**
 * The connections a local agent may use.
 *
 * Each MQTT client that has connected in this window is registered here, with its own message
 * feed. Tool calls name a connection id and run against that client. Nothing in this module opens
 * a connection: a client that is not currently connected is refused.
 */
import { AgentDisplayedMessage } from '@/utils/agentBridge'
import { AgentMessageFeed } from '@/utils/agentMessageFeed'

/** The slice of an MQTT client the registry needs. Tests pass a fake. */
export interface AgentRegistryClient {
  connected?: boolean
  publish?: (
    topic: string,
    payload: string | Buffer,
    options: { qos: 0 | 1 | 2; retain: boolean },
    callback?: (error?: Error) => void,
  ) => unknown
}

interface Entry {
  id: string
  name: string
  client: AgentRegistryClient
  feed: AgentMessageFeed
}

const entries = new Map<string, Entry>()

export const AGENT_CANNOT_CONNECT = 'The agent cannot open a connection.'

export const AGENT_CHOOSE_CONNECTION =
  'More than one connection is connected. Pass connectionId to publish, list_messages, wait_for_message, start_sequence and stop_sequence. The agent cannot open a connection.'

/** Remembers a client. A later call for the same id replaces the client but keeps the feed. */
export function rememberAgentConnection(id: string, name: string, client?: AgentRegistryClient): void {
  if (!id) {
    return
  }
  const current = entries.get(id)
  const nextClient = client && typeof client.publish === 'function' ? client : current?.client
  if (!nextClient) {
    if (current && name) {
      current.name = name
    }
    return
  }
  entries.set(id, {
    id,
    name: name || current?.name || id,
    client: nextClient,
    feed: current?.feed || new AgentMessageFeed(),
  })
}

/** Drops a connection that was deleted, and ends anyone still waiting on it. */
export function forgetAgentConnection(id: string): void {
  const entry = entries.get(id)
  if (!entry) {
    return
  }
  entry.feed.settleAll('The connection was removed.')
  entries.delete(id)
}

export function agentClient(id: string): AgentRegistryClient | undefined {
  return entries.get(id)?.client
}

export function agentFeedFor(id: string): AgentMessageFeed | undefined {
  return entries.get(id)?.feed
}

/** Records arrivals and publishes for one connection. Unknown ids are ignored. */
export function recordAgentMessages(id: string, messages: AgentDisplayedMessage[]): void {
  const feed = entries.get(id)?.feed
  if (!feed || !messages.length) {
    return
  }
  feed.record(messages)
}

/** Connections whose client is connected right now. */
export function connectedAgentConnections(): Array<{ id: string; name: string }> {
  const connected: Array<{ id: string; name: string }> = []
  entries.forEach((entry) => {
    if (entry.client.connected) {
      connected.push({ id: entry.id, name: entry.name })
    }
  })
  return connected
}

/**
 * The connection a tool call may use.
 *
 * An id must be one that is connected now. With no id, the only connected connection is used.
 * Several connected connections require an id. This never connects a client.
 */
export function resolveAgentConnection(connectionId?: string): { id: string; name: string } {
  if (connectionId) {
    const entry = entries.get(connectionId)
    if (!entry || !entry.client.connected) {
      throw new Error(`No connected connection has id ${connectionId}. ${AGENT_CANNOT_CONNECT}`)
    }
    return { id: entry.id, name: entry.name }
  }
  const connected = connectedAgentConnections()
  if (connected.length === 1) {
    return connected[0]
  }
  if (connected.length === 0) {
    throw new Error(`No connection is connected. ${AGENT_CANNOT_CONNECT}`)
  }
  const list = connected.map((item) => `${item.name} (${item.id})`).join(', ')
  throw new Error(
    `connectionId is required when more than one connection is connected: ${list}. ${AGENT_CANNOT_CONNECT}`,
  )
}

/** Ends every wait, for example when the connection page itself is closed. */
export function settleAgentWaits(reason: string): void {
  entries.forEach((entry) => entry.feed.settleAll(reason))
}

/** Test hook. Production code does not reset the table. */
export function resetAgentRegistryForTests(): void {
  entries.forEach((entry) => entry.feed.settleAll('reset'))
  entries.clear()
}
