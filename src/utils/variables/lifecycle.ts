import { connectionVariableDefinitions, globalVariableDefinitions } from '@/utils/connectionVariables'
import type { ConnectionVariableSource } from '@/utils/connectionVariables'
import type { ResolvedVariableDefinition } from './definitions'
import {
  applyConnectionVariableTrigger,
  applyVariableResetTrigger,
  clearConnectionSession,
  clearConnectionVariableStates,
  clearConnectionVariableValues,
  deleteVariableState,
  resetAllVariableStates,
  resetGlobalVariableStates,
  setDefinitionValue,
  startConnectionSession,
} from './state'

/**
 * Lifecycle wiring of the stateful variables.
 *
 * The definitions say *what* a variable is; this module says *when* its value restarts:
 *
 * - `connect`      a successful CONNACK. Automatic reconnects count too, unless the variable sets
 *                  `resetOnReconnect: false` (`markManualDisconnect()` makes the next connect a
 *                  fresh one again);
 * - `disconnect`   the connection went away;
 * - `appStart`     the first time a connection is used after the app started (applied once);
 * - `bound`        handled by the state computation itself (`onBound: 'reset'`);
 * - `manual`       the reset buttons in the variable editors / settings;
 * - timed resets   lazy, see `resetEverySec` in `state.ts`.
 *
 * The functions are called next to the MQTT client (like the automatic replies), not from a page,
 * so they also work for timed messages while the connection page is closed.
 */

const connectedOnce = new Set<string>()
/** connections whose `appStart` reset already ran in this app process */
const appStartApplied = new Set<string>()
/** the shared global variables are reset once per app process, not once per connection */
let globalAppStartApplied = false

/** The rebuild-happens-when-needed summary returned to the callers (used for logging/tests). */
export interface LifecycleResetResult {
  reset: string[]
  reconnect: boolean
}

const targetsOf = (
  record: ConnectionVariableSource,
): {
  global: ResolvedVariableDefinition[]
  connection: ResolvedVariableDefinition[]
} => ({
  global: Object.values(globalVariableDefinitions()),
  connection: Object.values(connectionVariableDefinitions(record)),
})

/** A successful connect: start the session clock and run the `connect` (and once `appStart`) resets. */
export const onConnectionEstablished = (record: ConnectionVariableSource): LifecycleResetResult => {
  if (!record?.id) {
    return { reset: [], reconnect: false }
  }
  const reconnect = connectedOnce.has(record.id)
  connectedOnce.add(record.id)
  // Every session gets a fresh clock and message counter, also after an automatic reconnect.
  startConnectionSession(record.id)
  const targets = targetsOf(record)
  const reset = applyConnectionVariableTrigger(record.id, 'connect', targets, { reconnect })
  // "应用启动重置" happens on first use of each connection after the app started; global variables
  // are shared, so their app-start reset runs once. No page has to be open for it.
  if (!appStartApplied.has(record.id)) {
    appStartApplied.add(record.id)
    applyVariableResetTrigger(
      'appStart',
      targets.connection.filter((definition) => definition.scope === 'connection'),
    )
  }
  if (!globalAppStartApplied) {
    globalAppStartApplied = true
    applyVariableResetTrigger('appStart', targets.global)
  }
  return { reset, reconnect }
}

/** The connection went away: run the `disconnect` resets. */
export const onConnectionClosed = (record: ConnectionVariableSource): string[] => {
  if (!record?.id) {
    return []
  }
  return applyConnectionVariableTrigger(record.id, 'disconnect', targetsOf(record))
}

/** The user disconnected on purpose: the next connect is a new session, not a reconnect. */
export const markManualDisconnect = (connectionId: string): void => {
  connectedOnce.delete(connectionId)
  clearConnectionSession(connectionId)
}

/** The definitions of a connection were edited / a preset was applied: start from the defaults. */
export const onConnectionVariablesChanged = (connectionId: string | undefined): void => {
  if (connectionId) {
    // Only the values: editing the definitions must not throw away the session clock of a
    // connection that is currently connected (`${connectedAt}` would stop resolving).
    clearConnectionVariableValues(connectionId)
  }
}

/** A connection was deleted: forget its state and its session. */
export const onConnectionDeleted = (connectionId: string | undefined): void => {
  if (!connectionId) {
    return
  }
  connectedOnce.delete(connectionId)
  appStartApplied.delete(connectionId)
  clearConnectionVariableStates(connectionId)
}

/** A global variable was edited: its shared value starts from the (new) default. */
export const onGlobalVariableChanged = (globalId: string | undefined): void => {
  if (globalId) {
    deleteVariableState(`g:${globalId}`)
  }
}

/** A global variable was deleted: drop its shared value as well. */
export const onGlobalVariableDeleted = (globalId: string | undefined): void => {
  onGlobalVariableChanged(globalId)
}

/** Resets the current value of one variable (single reset button). */
export const resetVariable = (definition: ResolvedVariableDefinition | undefined): boolean => {
  if (!definition?.stateKey) {
    return false
  }
  deleteVariableState(definition.stateKey)
  return true
}

/** Resets every variable of one connection and the global variables (the connection editors' action). */
export const resetConnectionVariables = (record: ConnectionVariableSource | null | undefined): void => {
  if (record?.id) {
    clearConnectionVariableValues(record.id)
  }
  // The connection's own values are gone; a manual reset of a global variable is a global action.
  resetGlobalVariableStates()
}

/** "Reset all variable values" of the settings page. */
export const resetAllVariables = (): void => {
  resetAllVariableStates()
}

/** Sets the current value of one variable manually (debugging a device state). */
export const setVariableValue = (
  definition: ResolvedVariableDefinition | undefined,
  value: number | string,
): boolean => {
  if (!definition?.stateKey) {
    return false
  }
  setDefinitionValue(definition, value)
  return true
}

/**
 * Writes the start time of a sequence run into this connection's `runStart` variables.
 *
 * Called when the run actually begins (a click, a connect trigger, or a matching message), before
 * the first step waits out its delay. A later step of the same run keeps reading this value.
 * Starting the sequence again writes a new time. A global variable is left alone: one shared clock
 * would move for every connection.
 */
export const assignSequenceRunStart = (
  record: ConnectionVariableSource | null | undefined,
  startedAt: number = Date.now(),
): string[] => {
  if (!record?.id || !Number.isFinite(startedAt)) {
    return []
  }
  const names: string[] = []
  Object.values(connectionVariableDefinitions(record)).forEach((definition) => {
    if (definition.kind !== 'runStart' || definition.scope !== 'connection' || !definition.stateKey) {
      return
    }
    setDefinitionValue(definition, startedAt)
    names.push(definition.name)
  })
  return names
}

/** Applies the variable actions of a matched automatic reply rule (E7 / C4). */
export const applyAutoReplyVariableActions = (
  record: ConnectionVariableSource | null | undefined,
  actions: { resetVariables?: string[]; setVariables?: Array<{ name: string; value: string }> } | undefined,
): void => {
  if (!record?.id || !actions) {
    return
  }
  const definitions = connectionVariableDefinitions(record)
  ;(actions.resetVariables ?? []).forEach((name) => {
    const definition = definitions[name]
    if (definition?.stateKey) {
      deleteVariableState(definition.stateKey)
    }
  })
  ;(actions.setVariables ?? []).forEach((changed) => {
    const definition = definitions[changed.name]
    if (!definition?.stateKey) {
      return
    }
    // Keep the captured text exactly as rendered (a "007" must stay "007"); numeric values are
    // still usable by a sequence because the state reader parses numeric strings.
    setDefinitionValue(definition, changed.value)
  })
}

/** Test helper: forget the per-process connect/app-start bookkeeping. */
export const resetLifecycleState = (): void => {
  connectedOnce.clear()
  appStartApplied.clear()
  globalAppStartApplied = false
}
