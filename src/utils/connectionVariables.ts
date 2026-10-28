import { getGlobalVariables } from '@/utils/configProfiles'
import {
  normalizeGlobalVariables,
  normalizeVariableMap,
  peekDefinitionValue,
  ResolvedVariableDefinition,
} from '@/utils/variables'
import type { VariableGuideEntry } from '@/utils/variables'

/**
 * The variables of one connection, i.e. the domain glue between the connection model, the preset
 * manager and the generic variable resolver.
 *
 * The scope order lives here, once (it used to be repeated by the publish path, the timed messages,
 * the automatic replies, the automatic subscriptions, the subscription panel and the automation
 * dialog):
 *
 *   1. the "客户端变量" of the connection (closest, wins)
 *   2. the global variables of the preset manager
 *   3. the fields of the connection itself, so `${clientId}` works without configuration
 *
 * A variable is either a constant or a stateful definition. The scope also decides where its
 * current value lives: a global variable has one shared value (`g:<id>`), a client variable has one
 * value per connection (`c:<connection id>:<name>`), so two devices can count independently.
 */
export type ConnectionVariableSource = Partial<
  Pick<ConnectionModel, 'id' | 'variables' | 'clientId' | 'username' | 'name' | 'host' | 'port'>
>

export interface ConnectionVariableSet {
  /** definitions (constants included), closest scope first, each with its state key */
  definitions: { [name: string]: ResolvedVariableDefinition }
  /** the constant/current values as plain strings, for code that only needs the text */
  variables: { [name: string]: string }
}

/**
 * The values a connection exposes to its own messages: `${clientId}`, `${username}`, `${name}`,
 * `${host}`, `${port}`.
 *
 * A device usually shows up in its topic, so a template like `sensor/${clientId}/data` serves
 * every connection without editing the message. These values are derived from the connection
 * itself, so a variable the user defined (client or global) still wins over them.
 *
 * The password is deliberately not exposed: the value of a variable ends up in a published
 * message, and therefore on the broker and in the receiver's logs.
 */
export const connectionFieldVariables = (
  connection: ConnectionVariableSource | null | undefined,
): { [name: string]: string } => {
  const fields: { [name: string]: string } = {}
  if (!connection) {
    return fields
  }
  const add = (name: string, value: string | number | null | undefined) => {
    if (value === undefined || value === null) {
      return
    }
    const text = String(value)
    // An empty field (a connection without a username) stays undefined instead of resolving to ""
    if (text.trim() === '') {
      return
    }
    fields[name] = text
  }
  add('clientId', connection.clientId)
  add('username', connection.username)
  add('name', connection.name)
  add('host', connection.host)
  add('port', connection.port)
  return fields
}

/** The connection-scoped definitions (constant or stateful) of one connection. */
export const connectionScopedDefinitions = (
  connection: ConnectionVariableSource | null | undefined,
): { [name: string]: ResolvedVariableDefinition } =>
  normalizeVariableMap(connection?.variables as { [name: string]: StoredVariable } | null | undefined, {
    connectionId: connection?.id,
  })

/** The definitions of the global variables of the preset manager (shared by every connection). */
export const globalVariableDefinitions = (): { [name: string]: ResolvedVariableDefinition } =>
  normalizeGlobalVariables(
    getGlobalVariables() as Array<{
      id: string
      name: string
      value: string
      definition?: VariableDefinitionConfig
    }>,
  )

/** The connection fields as constant definitions (lowest scope). */
const connectionFieldDefinitions = (
  connection: ConnectionVariableSource | null | undefined,
): { [name: string]: ResolvedVariableDefinition } => {
  const fields = connectionFieldVariables(connection)
  const definitions: { [name: string]: ResolvedVariableDefinition } = {}
  Object.keys(fields).forEach((name) => {
    definitions[name] = {
      name,
      kind: 'constant',
      value: fields[name],
      onBound: 'clamp',
      resetOn: [],
      resetOnReconnect: true,
      generator: 'uuid',
      scope: 'connection',
    }
  })
  return definitions
}

/**
 * The merged definitions of one connection, closest scope first:
 * client variables -> global variables -> connection fields.
 *
 * An empty constant of the closer scope counts as "not defined" and falls through, exactly like the
 * legacy `mergeVariables` did, so a connection can inherit a global value.
 */
export const connectionVariableDefinitions = (
  connection: ConnectionVariableSource | null | undefined,
): { [name: string]: ResolvedVariableDefinition } => {
  const merged: { [name: string]: ResolvedVariableDefinition } = {}
  const scopes = [
    connectionScopedDefinitions(connection),
    globalVariableDefinitions(),
    connectionFieldDefinitions(connection),
  ]
  scopes.forEach((scope) => {
    Object.keys(scope).forEach((name) => {
      if (name in merged) {
        return
      }
      const definition = scope[name]
      // An empty value counts as "not defined" (legacy mergeVariables behavior), so a connection
      // without its own value inherits the global one.
      if (definition.kind === 'constant' && (definition.value === undefined || definition.value.trim() === '')) {
        return
      }
      merged[name] = definition
    })
  })
  return merged
}

/** The merged `{ name: value }` view: constants and the current values of stateful variables. */
export const connectionVariableMap = (
  connection: ConnectionVariableSource | null | undefined,
): { [name: string]: string } => {
  const definitions = connectionVariableDefinitions(connection)
  const map: { [name: string]: string } = {}
  Object.keys(definitions).forEach((name) => {
    const definition = definitions[name]
    if (definition.kind === 'constant') {
      if (definition.value) {
        map[name] = definition.value
      }
      return
    }
    const current = peekDefinitionValue(definition)
    if (current !== undefined && String(current) !== '') {
      map[name] = String(current)
    }
  })
  return map
}

/** The legacy shape of the module: definitions plus their plain string view. */
export const connectionVariables = (
  connection: ConnectionVariableSource | null | undefined,
): ConnectionVariableSet => ({
  definitions: connectionVariableDefinitions(connection),
  variables: connectionVariableMap(connection),
})

/** Everything a resolver of one connection needs: the definitions and the connection id. */
export const connectionVariableOptions = (
  connection: ConnectionVariableSource | null | undefined,
): { definitions: { [name: string]: ResolvedVariableDefinition }; connectionId?: string } => ({
  definitions: connectionVariableDefinitions(connection),
  connectionId: connection?.id,
})

/**
 * The current value of every variable of one connection, for display and for the local agent.
 *
 * This is a read: nothing advances (a sequence counter does not step, a random value is not drawn).
 * A stateful variable that has no value yet (`runStart` before its sequence started, a random value
 * before its first draw) reports `null` rather than the initial value, because a message would not
 * resolve it either.
 */
export const connectionVariableSnapshot = (
  connection: ConnectionVariableSource | null | undefined,
): Array<{ name: string; kind: string; scope: string; value: string | null }> => {
  const definitions = connectionVariableDefinitions(connection)
  return Object.keys(definitions).map((name) => {
    const definition = definitions[name]
    const current = definition.kind === 'constant' ? definition.value : peekDefinitionValue(definition)
    return {
      name,
      kind: definition.kind,
      scope: definition.scope,
      value: current === undefined || String(current) === '' ? null : String(current),
    }
  })
}

/** The connection fields as guide entries, so "变量说明" lists them next to the other sources. */
export const connectionVariableGuide: VariableGuideEntry[] = ['clientId', 'username', 'name', 'host', 'port'].map(
  (name) => ({ name: '${' + name + '}', group: 'connection' }),
)
