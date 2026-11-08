/**
 * Applying the reusable presets ("预设管理") to a connection form, browser side.
 *
 * The presets themselves are stored by `utils/configProfiles.ts`, shared with the desktop build. What
 * is browser specific is one rule: a server preset may name the raw MQTT protocols (`mqtt`/`mqtts`),
 * which a browser cannot open - only `ws`/`wss` are available. Such a preset is refused with a
 * reason instead of being silently rewritten to a websocket port that may not exist, because a
 * connection "that works but talks to the wrong port" is much harder to diagnose than a refused one.
 */

export interface ApplyPresetResult {
  applied: boolean
  /** why the preset was refused, shown to the user */
  reason?: 'protocolNotSupportedInBrowser' | 'notFound'
}

const BROWSER_PROTOCOLS: Array<ConnectionModel['protocol']> = ['ws', 'wss']

/** Applies the server part of a preset: protocol, host, port and path. */
export const applyServerProfileToRecord = (
  record: ConnectionModel,
  profile: ServerProfileModel | null | undefined,
): ApplyPresetResult => {
  if (!profile) {
    return { applied: false, reason: 'notFound' }
  }
  const protocol = profile.protocol as ConnectionModel['protocol']
  if (!BROWSER_PROTOCOLS.includes(protocol)) {
    return { applied: false, reason: 'protocolNotSupportedInBrowser' }
  }
  record.protocol = protocol
  record.host = profile.host
  record.port = profile.port
  if (profile.path !== undefined) {
    record.path = profile.path
  }
  return { applied: true }
}

/**
 * Applies the client part of a preset: identity, session parameters and the preset's variables.
 *
 * Values the preset does not set are left as they are, so applying a client preset to a form that
 * already has a broker configured does not clear anything the user typed.
 */
export const applyClientProfileToRecord = (
  record: ConnectionModel,
  profile: ClientProfileModel | null | undefined,
): ApplyPresetResult => {
  if (!profile) {
    return { applied: false, reason: 'notFound' }
  }
  if (profile.clientId) {
    record.clientId = profile.clientId
  }
  if (profile.username !== undefined) {
    record.username = profile.username
  }
  if (profile.password !== undefined) {
    record.password = profile.password
  }
  // The web client offers MQTT 3.1.1 and 5.0 only; a preset saved with 3.1 keeps the current version
  // rather than writing a value the connection form cannot show or the client cannot open.
  if (profile.mqttVersion === '3.1.1' || profile.mqttVersion === '5.0') {
    record.mqttVersion = profile.mqttVersion
  }
  if (profile.connectTimeout !== undefined) {
    record.connectTimeout = profile.connectTimeout
  }
  if (profile.keepalive !== undefined) {
    record.keepalive = profile.keepalive
  }
  if (profile.reconnect !== undefined) {
    record.reconnect = profile.reconnect
  }
  if (profile.reconnectPeriod !== undefined) {
    record.reconnectPeriod = profile.reconnectPeriod
  }
  if (profile.clean !== undefined) {
    record.clean = profile.clean
  }
  if (profile.variables) {
    // The preset's variables are merged in, the connection's own values still win.
    record.variables = { ...profile.variables, ...(record.variables ?? {}) }
  }
  return { applied: true }
}

/** Reads the current form back into a server preset (used by "save as preset"). */
export const serverProfileFromRecord = (
  record: ConnectionModel,
  alias: string,
): Omit<ServerProfileModel, 'id'> => ({
  alias: alias || record.host,
  host: record.host,
  port: record.port,
  protocol: (record.protocol ?? 'ws') as ServerProfileModel['protocol'],
  ...(record.path ? { path: record.path } : {}),
})

/** Reads the client identity of the form back into a client preset. */
export const clientProfileFromRecord = (
  record: ConnectionModel,
  alias: string,
): Omit<ClientProfileModel, 'id'> => ({
  alias: alias || record.name || record.clientId,
  clientId: record.clientId,
  username: record.username || undefined,
  password: record.password || undefined,
  mqttVersion: record.mqttVersion,
  ...(record.variables ? { variables: record.variables } : {}),
})
