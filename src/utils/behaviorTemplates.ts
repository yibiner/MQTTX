import { v4 as uuidv4 } from 'uuid'
import { getBehaviorTemplates, saveBehaviorTemplate } from '@/utils/configProfiles'
import { cloneMessageSequence } from '@/utils/messageSequenceExamples'

/**
 * Resolves a behaviour template.
 *
 * The chain is walked from the root to the template itself. Lists are appended in that order.
 * A scalar (a variable, a username, a password, a credential source, the default server,
 * one advanced field, one will field) is taken from the closest template that actually sets it.
 * The returned lists are copies.
 *
 * A connection stores that copy and does not stay linked to the template. Stopping sync does
 * the same thing onto the template itself and then clears `parentId`.
 */

export interface ResolvedBehavior {
  username?: string
  password?: string
  usernameFrom: BehaviorCredentialSource
  passwordFrom: BehaviorCredentialSource
  defaultServerId?: string
  /** Advanced fields set anywhere on the chain. Empty when nobody set one. */
  session: BehaviorSessionConfig
  /** Will fields set anywhere on the chain. Empty when nobody set one. */
  will: BehaviorWillConfig
  variables: { [name: string]: StoredVariable }
  autoSubscriptions: AutoSubscribeGroupModel[]
  timedReports: TimedReportModel[]
  autoReplies: AutoReplyRuleModel[]
  messageSequences: MessageSequenceModel[]
  /** root first, the template itself last */
  chain: BehaviorTemplateModel[]
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const freshGroup = (group: AutoSubscribeGroupModel): AutoSubscribeGroupModel => ({
  ...clone(group),
  id: uuidv4(),
})

const freshReport = (report: TimedReportModel): TimedReportModel => ({
  ...clone(report),
  id: uuidv4(),
})

const freshReply = (rule: AutoReplyRuleModel): AutoReplyRuleModel => ({
  ...clone(rule),
  id: uuidv4(),
})

/** New ids, so two connections (or a detached template and its former parent) do not share a run. */
export const copyBehaviorLists = (
  behavior: Pick<ResolvedBehavior, 'autoSubscriptions' | 'timedReports' | 'autoReplies' | 'messageSequences'>,
): Pick<ResolvedBehavior, 'autoSubscriptions' | 'timedReports' | 'autoReplies' | 'messageSequences'> => ({
  autoSubscriptions: behavior.autoSubscriptions.map(freshGroup),
  timedReports: behavior.timedReports.map(freshReport),
  autoReplies: behavior.autoReplies.map(freshReply),
  messageSequences: behavior.messageSequences.map((sequence) => cloneMessageSequence(sequence)),
})

/**
 * Templates from the root down to `id`. A cycle stops the walk: the template that was already
 * seen is not entered again, so a broken parent link still resolves to a finite chain.
 */
export const behaviorChain = (templates: BehaviorTemplateModel[], id: string): BehaviorTemplateModel[] => {
  const byId = new Map(templates.map((template) => [template.id, template]))
  const chain: BehaviorTemplateModel[] = []
  const seen = new Set<string>()
  let current = byId.get(id)
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

const nonEmpty = (value: string | null | undefined): value is string =>
  value !== undefined && value !== null && String(value).trim() !== ''

/** Copies keys that are present. `properties` is merged one level down, so one field does not wipe the rest. */
const mergeConfig = <T extends BehaviorSessionConfig | BehaviorWillConfig>(base: T, extra: T | null | undefined): T => {
  if (!extra) {
    return base
  }
  const next = { ...base }
  Object.keys(extra).forEach((key) => {
    if (key === 'properties') {
      return
    }
    const value = (extra as { [name: string]: unknown })[key]
    if (value !== undefined) {
      ;(next as { [name: string]: unknown })[key] = value
    }
  })
  if (extra.properties) {
    next.properties = {
      ...((base.properties ?? {}) as Record<string, unknown>),
      ...(extra.properties as Record<string, unknown>),
    } as T['properties']
  }
  return next
}

/** Drops an empty override so a template that never touched the section keeps following its parent. */
export const compactBehaviorConfig = <T extends BehaviorSessionConfig | BehaviorWillConfig>(
  value: T | null | undefined,
): T | null => {
  if (!value) {
    return null
  }
  const properties = value.properties
  const rest = { ...value } as { [name: string]: unknown }
  delete rest.properties
  const hasRest = Object.keys(rest).some((key) => rest[key] !== undefined)
  const hasProperties = !!properties && Object.keys(properties).length > 0
  if (!hasRest && !hasProperties) {
    return null
  }
  return (hasProperties ? { ...rest, properties } : rest) as unknown as T
}

/**
 * A cleared advanced number is stored as null. On the connection that means the new-connection
 * default, so a child can stop following the parent's keepalive without leaving the field unset.
 */
const SESSION_DEFAULTS: { [name: string]: unknown } = {
  mqttVersion: '5.0',
  connectTimeout: 10,
  keepalive: 60,
  reconnect: true,
  reconnectPeriod: 4000,
  clean: true,
}

const assignDefined = (target: { [name: string]: unknown }, source: { [name: string]: unknown }) => {
  Object.keys(source).forEach((key) => {
    if (key === 'properties' || source[key] === undefined) {
      return
    }
    if (source[key] === null) {
      if (Object.prototype.hasOwnProperty.call(SESSION_DEFAULTS, key)) {
        target[key] = SESSION_DEFAULTS[key]
      } else {
        delete target[key]
      }
      return
    }
    target[key] = source[key]
  })
}

/**
 * The parts of a new-connection form a behaviour template overwrites.
 * Captured before the first apply and restored before the next one, so switching or clearing
 * a template drops the previous template's advanced fields, will and server.
 */
export interface BehaviorFormBaseline {
  username: string
  password: string
  variables: { [name: string]: StoredVariable }
  autoSubscriptions: AutoSubscribeGroupModel[]
  timedReports: TimedReportModel[]
  autoReplies: AutoReplyRuleModel[]
  messageSequences: MessageSequenceModel[]
  mqttVersion: ConnectionModel['mqttVersion']
  connectTimeout: number
  keepalive: number
  reconnect: boolean
  reconnectPeriod: number
  clean: boolean
  properties?: ConnectionModel['properties']
  will?: ConnectionModel['will']
  host: string
  port: number
  protocol?: ConnectionModel['protocol']
  path: string
  ssl: boolean
  certType?: ConnectionModel['certType']
  serverProfileId: string | null
}

export const captureBehaviorBaseline = (
  record: ConnectionModel,
  serverProfileId: string | null,
): BehaviorFormBaseline => ({
  username: record.username ?? '',
  password: record.password ?? '',
  variables: clone(record.variables ?? {}),
  autoSubscriptions: clone(record.autoSubscriptions ?? []),
  timedReports: clone(record.timedReports ?? []),
  autoReplies: clone(record.autoReplies ?? []),
  messageSequences: clone(record.messageSequences ?? []),
  mqttVersion: record.mqttVersion,
  connectTimeout: record.connectTimeout ?? 10,
  keepalive: record.keepalive ?? 60,
  reconnect: record.reconnect ?? true,
  reconnectPeriod: record.reconnectPeriod ?? 4000,
  clean: record.clean ?? true,
  properties: record.properties ? clone(record.properties) : undefined,
  will: record.will ? clone(record.will) : undefined,
  host: record.host,
  port: record.port,
  protocol: record.protocol,
  path: record.path ?? '',
  ssl: record.ssl ?? false,
  certType: record.certType,
  serverProfileId,
})

export const restoreBehaviorBaseline = (record: ConnectionModel, baseline: BehaviorFormBaseline): void => {
  record.username = baseline.username
  record.password = baseline.password
  record.variables = clone(baseline.variables)
  record.autoSubscriptions = clone(baseline.autoSubscriptions)
  record.timedReports = clone(baseline.timedReports)
  record.autoReplies = clone(baseline.autoReplies)
  record.messageSequences = clone(baseline.messageSequences)
  record.mqttVersion = baseline.mqttVersion
  record.connectTimeout = baseline.connectTimeout
  record.keepalive = baseline.keepalive
  record.reconnect = baseline.reconnect
  record.reconnectPeriod = baseline.reconnectPeriod
  record.clean = baseline.clean
  record.properties = baseline.properties ? clone(baseline.properties) : undefined
  record.will = baseline.will ? clone(baseline.will) : undefined
  record.host = baseline.host
  record.port = baseline.port
  record.protocol = baseline.protocol
  record.path = baseline.path
  record.ssl = baseline.ssl
  record.certType = baseline.certType
}

/**
 * Writes the template account onto a connection.
 *
 * An empty template username or password does not clear an account already on the form
 * (the client selected beside the template). A template that names the client as the source
 * uses that client's account. Returns whether the checkbox for remembering the client should show.
 */
export const applyBehaviorAccount = (
  record: ConnectionModel,
  resolved: Pick<ResolvedBehavior, 'username' | 'password' | 'usernameFrom' | 'passwordFrom'>,
  device?: Pick<ClientProfileModel, 'username' | 'password'>,
): boolean => {
  if (resolved.usernameFrom === 'device') {
    if (device) {
      record.username = device.username || ''
    }
  } else if (nonEmpty(resolved.username)) {
    record.username = resolved.username
  }
  if (resolved.passwordFrom === 'device') {
    if (device) {
      record.password = device.password || ''
    }
  } else if (nonEmpty(resolved.password)) {
    record.password = resolved.password
  }
  return resolved.usernameFrom === 'device' || resolved.passwordFrom === 'device'
}

/**
 * Writes the advanced and will fields a template chain resolved onto a connection.
 * Keys nobody set are left as the form already has them.
 */
export const applyBehaviorClientOptions = (
  record: ConnectionModel,
  session?: BehaviorSessionConfig | null,
  will?: BehaviorWillConfig | null,
): void => {
  if (session) {
    assignDefined(record as unknown as { [name: string]: unknown }, session as { [name: string]: unknown })
    if (session.properties) {
      record.properties = { ...(record.properties ?? {}), ...session.properties }
      assignDefined(
        record.properties as unknown as { [name: string]: unknown },
        session.properties as { [name: string]: unknown },
      )
    }
  }
  if (will) {
    const current = record.will ?? {
      lastWillTopic: '',
      lastWillPayload: '',
      lastWillQos: 0 as QoS,
      lastWillRetain: false,
      properties: {},
    }
    const next = { ...current }
    assignDefined(next as unknown as { [name: string]: unknown }, will as { [name: string]: unknown })
    if (will.properties) {
      next.properties = { ...(current.properties ?? {}) }
      assignDefined(
        next.properties as unknown as { [name: string]: unknown },
        will.properties as { [name: string]: unknown },
      )
    }
    record.will = next
  }
}

/** The behaviour of `id` with every synced parent folded in. Missing template → undefined. */
export const resolveBehaviorFrom = (templates: BehaviorTemplateModel[], id: string): ResolvedBehavior | undefined => {
  const chain = behaviorChain(templates, id)
  if (!chain.length) {
    return undefined
  }
  const resolved: ResolvedBehavior = {
    usernameFrom: 'template',
    passwordFrom: 'template',
    variables: {},
    session: {},
    will: {},
    autoSubscriptions: [],
    timedReports: [],
    autoReplies: [],
    messageSequences: [],
    chain,
  }
  chain.forEach((template) => {
    Object.keys(template.variables ?? {}).forEach((name) => {
      const stored = template.variables?.[name]
      if (stored === undefined) {
        return
      }
      if (typeof stored === 'string' && stored.trim() === '') {
        return
      }
      resolved.variables[name] = clone(stored)
    })
    resolved.autoSubscriptions.push(...(template.autoSubscriptions ?? []).map((group) => clone(group)))
    resolved.timedReports.push(...(template.timedReports ?? []).map((report) => clone(report)))
    resolved.autoReplies.push(...(template.autoReplies ?? []).map((rule) => clone(rule)))
    resolved.messageSequences.push(...(template.messageSequences ?? []).map((sequence) => clone(sequence)))
    if (nonEmpty(template.username)) {
      resolved.username = template.username
    }
    if (nonEmpty(template.password)) {
      resolved.password = template.password
    }
    if (template.usernameFrom) {
      resolved.usernameFrom = template.usernameFrom
    }
    if (template.passwordFrom) {
      resolved.passwordFrom = template.passwordFrom
    }
    if (nonEmpty(template.defaultServerId)) {
      resolved.defaultServerId = template.defaultServerId ?? undefined
    }
    resolved.session = mergeConfig(resolved.session, template.session)
    resolved.will = mergeConfig(resolved.will, template.will)
  })
  return resolved
}

export const resolveBehaviorTemplate = (id: string): ResolvedBehavior | undefined =>
  resolveBehaviorFrom(getBehaviorTemplates(), id)

/**
 * Templates that can be chosen as the parent of `selfId`.
 *
 * A template cannot sit on itself, and it cannot sit on a template that already inherits from
 * it: that would be a cycle. `selfId` is omitted for a template that has not been saved yet.
 */
export const behaviorParentChoices = (
  templates: BehaviorTemplateModel[],
  selfId?: string | null,
): BehaviorTemplateModel[] => {
  if (!selfId) {
    return templates.slice()
  }
  const blocked = new Set<string>([selfId])
  const visit = (id: string) => {
    templates.forEach((template) => {
      if (template.parentId === id && !blocked.has(template.id)) {
        blocked.add(template.id)
        visit(template.id)
      }
    })
  }
  visit(selfId)
  return templates.filter((template) => !blocked.has(template.id))
}

/** True when some other template still inherits from `id`. Deleting it would drop that behaviour. */
export const behaviorTemplateHasChildren = (
  id: string,
  templates: BehaviorTemplateModel[] = getBehaviorTemplates(),
): boolean => templates.some((template) => template.parentId === id)

/**
 * Copies the resolved parent chain into the template and clears the parent link.
 *
 * The result is what the template should store. Inherited rows receive new ids and become
 * ordinary editable rows. Calling it again changes nothing once `parentId` is already empty.
 */
export const detachBehaviorContent = (
  template: BehaviorTemplateModel,
  templates: BehaviorTemplateModel[],
): BehaviorTemplateModel => {
  if (!template.parentId) {
    return template
  }
  const id = template.id || 'draft'
  const list = templates.some((item) => item.id === id)
    ? templates.map((item) => (item.id === id ? { ...template, id } : item))
    : [...templates, { ...template, id }]
  const resolved = resolveBehaviorFrom(list, id)
  if (!resolved) {
    return { ...template, parentId: null }
  }
  const lists = copyBehaviorLists(resolved)
  return {
    ...template,
    parentId: null,
    username: resolved.username,
    password: resolved.password,
    usernameFrom: resolved.usernameFrom,
    passwordFrom: resolved.passwordFrom,
    defaultServerId: resolved.defaultServerId ?? null,
    session: compactBehaviorConfig(resolved.session),
    will: compactBehaviorConfig(resolved.will),
    variables: { ...resolved.variables },
    ...lists,
  }
}

/** Stops syncing `id` with its parent and stores the snapshot. */
export const detachBehaviorTemplate = (id: string): BehaviorTemplateModel | undefined => {
  const template = getBehaviorTemplates().find((item) => item.id === id)
  if (!template) {
    return undefined
  }
  return saveBehaviorTemplate(detachBehaviorContent(template, getBehaviorTemplates()))
}
