import {
  createPayloadVariableResolver,
  PayloadVariableResolver,
  readConnectionSession,
  ResolvedVariableDefinition,
  writeSessionSentCount,
} from '@/utils/payloadVariables'
import { matchTopicMethod } from '@/utils/topicMatch'
import { evaluatePayloadCondition, parseJsonPayload } from '@/utils/jmesPathCondition'

/**
 * Automatic replies: answering a message the server sent, the way a real device would.
 *
 * A rule matches on the topic (an MQTT filter, so a whole device family can be covered) and on a
 * JMESPath condition evaluated against the payload parsed as JSON, e.g.
 *
 *     topic     app/+/+/device/system/post
 *     condition cmd == 'WIFI_RECONNECT_SERVICE'
 *     reply     {"code":0,"msg":null}   (merged into the received message)
 *
 * The reply topic and the reply payload are templates resolved by the one variable resolver:
 * `${name}` is a variable of the connection, `${msg.path.to.field}` reads a field of the received
 * message, `${topic}` is the received topic, and arithmetic works on any number (`${msg.ts - 34000}`).
 * The message fields are provided by the message provider of the resolver, not by a pre-pass, so a
 * reply template is scanned once and `${msg.x}` works even inside a user variable value.
 */
export interface AutoReplyContext {
  /** topic the message was received on */
  topic: string
  /** raw payload of the received message */
  payload: string | Buffer
  variables?: { [name: string]: string }
  /** the stateful variables of the connection, so `${wf116wight}` advances on a reply */
  definitions?: { [name: string]: ResolvedVariableDefinition }
  /** the connection the reply is built for (session clocks and variable state) */
  connectionId?: string
  /**
   * The payload parsed once, shared by every rule of this message.
   *
   * A device normally has several rules that only differ in their condition, so parsing inside each
   * rule parsed the very same text once per rule. `planAutoReplies` fills this in; a caller that
   * matches a single rule may leave it out and the rule parses for itself.
   */
  parsed?: { value?: any; error?: string }
  /**
   * Whether counters used by a reply template are persisted (`${count:1}` advances). The engine
   * leaves this on; the automation dialog preview passes `false`, so looking at a preview never
   * changes what the next real reply sends.
   */
  commitCounters?: boolean
}

export interface PlannedAutoReply {
  ruleId: string
  topic: string
  payload: string
  qos: QoS
  retain: boolean
  delayMs: number
  /** variable actions of the rule (reset / capture), executed by the engine after the match */
  actions?: { resetVariables?: string[]; setVariables?: Array<{ name: string; value: string }> }
  /** why the reply could not be built (shown in the log, the rule is skipped) */
  error?: string
}

export interface AutoReplyTemplateScope {
  variables?: { [name: string]: string }
  topic?: string
  /** the received payload, already parsed as JSON */
  msg?: any
  /** stateful variables of the connection */
  definitions?: { [name: string]: ResolvedVariableDefinition }
  connectionId?: string
}

/** Whether a template has anything to resolve at all (the vast majority of filters do not). */
const hasPlaceholder = (text: unknown): boolean => typeof text === 'string' && text.includes('${')

/** A resolver for a reply whose templates are completely static: it resolves nothing and commits nothing. */
const IDENTITY_RESOLVER: PayloadVariableResolver = {
  resolve: (text: string) => text,
  unresolved: [],
  commit: () => undefined,
}

/** `setTimeout()` treats anything above 2^31-1 as 1ms, so a huge delay would fire immediately. */
const normalizeDelay = (delayMs: unknown): number => {
  const value = Number(delayMs)
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.min(Math.round(value), 2147483647)
}

/**
 * The resolver of one reply template, bound to the connection variables and to the received message.
 *
 * `messageContext` is always set: a reply is rendered *about* a received message, so a `${msg.x}`
 * of a payload that is not JSON renders as an empty string (as it always did) instead of being
 * reported as an unknown variable.
 */
const createReplyResolver = (scope: AutoReplyTemplateScope, commitCounters = true): PayloadVariableResolver =>
  createPayloadVariableResolver({
    variables: scope.variables ?? {},
    definitions: scope.definitions,
    connectionId: scope.connectionId,
    message: scope.msg,
    messageContext: true,
    topic: scope.topic,
    commitCounters,
  })

/**
 * Renders a topic/payload template of a reply: the variables of the connection (`${clientId}`,
 * `${count:1}`, ...), the fields of the received message (`${msg.msgId}`, `${msg.data.list[0].id}`)
 * and the received topic (`${topic}`), in one pass.
 */
export const renderReplyTemplate = (template: string, scope: AutoReplyTemplateScope = {}): string => {
  if (!template) {
    return template
  }
  if (!hasPlaceholder(template)) {
    // No `${...}`: no resolver, no session read, no provider walk.
    return template
  }
  const resolver = createReplyResolver(scope)
  const rendered = resolver.resolve(template)
  // Standalone callers expect the counters they use to advance, like `${count:1}` anywhere else.
  resolver.commit()
  return rendered
}

/**
 * Builds the reply body.
 *
 * `fixed` sends the configured payload as it is (templates resolved). `echo` starts from the
 * received message and merges the configured JSON object into it, which is what answers a command
 * with "the same message plus a result code".
 */
const buildReplyPayloadWith = (
  rule: AutoReplyRuleModel,
  received: unknown,
  resolver: PayloadVariableResolver,
): string => {
  const body = rule.reply?.payload ?? ''
  if (rule.reply?.mode !== 'echo') {
    return resolver.resolve(body)
  }
  // The configured fields are templates too: without resolving them here, a rule that reads
  // `{"code":0,"seen":"${msg.msgId}"}` would send the placeholder literally (and then be refused
  // as "still contains an unresolved placeholder"), which made echoing a field impossible.
  const resolved = resolver.resolve(body)
  const extension = resolved.trim() ? parseJsonPayload(resolved) : { value: undefined }
  if (extension.error !== undefined) {
    throw new Error(`reply JSON is invalid: ${extension.error}`)
  }
  const extra = extension.value
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
    throw new Error('reply JSON must be an object')
  }
  if (!received || typeof received !== 'object' || Array.isArray(received)) {
    // Nothing to echo: fall back to sending the configured fields on their own.
    return JSON.stringify(extra)
  }
  return JSON.stringify({ ...(received as Record<string, unknown>), ...extra })
}

/** Builds the reply body with a resolver of its own; `planAutoReplies` shares one resolver instead. */
export const buildReplyPayload = (
  rule: AutoReplyRuleModel,
  received: unknown,
  scope: AutoReplyTemplateScope,
): string => {
  const resolver = createReplyResolver(scope)
  const payload = buildReplyPayloadWith(rule, received, resolver)
  resolver.commit()
  return payload
}

/** Whether the rule matches this message: topic filter first, then the JMESPath condition. */
export const matchesAutoReplyRule = (
  rule: AutoReplyRuleModel,
  context: AutoReplyContext,
): { matched: boolean; received?: any; error?: string } => {
  if (!rule || rule.enabled === false) {
    return { matched: false }
  }
  // The filter is a template like the reply itself: it may contain client/global variables
  // (`app/${productType}/#`) or a stateful variable. Rendering it is a probe - a filter must not
  // advance a counter or the current value. A filter without a placeholder (the normal case) needs
  // no resolver at all.
  let filter = rule.matchTopic ?? ''
  if (hasPlaceholder(filter)) {
    const filterResolver = createReplyResolver(
      {
        variables: context.variables,
        definitions: context.definitions,
        connectionId: context.connectionId,
        topic: context.topic,
      },
      false,
    )
    filter = filterResolver.resolve(filter)
    if (filterResolver.unresolved.length) {
      return { matched: false, error: `unresolved variables in match topic: ${filterResolver.unresolved.join(', ')}` }
    }
  }
  if (!filter) {
    return { matched: false }
  }
  if (!matchTopicMethod(filter, context.topic)) {
    return { matched: false }
  }
  const parsed = context.parsed ?? parseJsonPayload(context.payload)
  const condition = (rule.matchCondition ?? '').trim()
  if (!condition) {
    return { matched: true, received: parsed.value }
  }
  if (parsed.error !== undefined) {
    return { matched: false }
  }
  const result = evaluatePayloadCondition(condition, parsed.value)
  if (result.error) {
    return { matched: false, error: result.error }
  }
  return { matched: result.matched, received: parsed.value }
}

/** All replies a received message triggers, in the order the rules are configured. */
export const planAutoReplies = (
  rules: AutoReplyRuleModel[] | null | undefined,
  context: AutoReplyContext,
): PlannedAutoReply[] => {
  if (!Array.isArray(rules) || !rules.length) {
    return []
  }
  // All rules match the same message, so its payload is parsed once here instead of once per rule:
  // rules usually share the topic filter and differ only in their condition.
  const sharedContext: AutoReplyContext = context.parsed
    ? context
    : { ...context, parsed: parseJsonPayload(context.payload) }
  const replies: PlannedAutoReply[] = []
  rules.forEach((rule) => {
    const result = matchesAutoReplyRule(rule, sharedContext)
    if (!result.matched) {
      if (result.error) {
        replies.push({
          ruleId: rule.id,
          topic: '',
          payload: '',
          qos: rule.reply?.qos ?? 0,
          retain: false,
          delayMs: 0,
          error: result.error,
        })
      }
      return
    }
    // One resolver for the reply topic and the reply body: a counter used by both advances once,
    // and the unresolved names of both are collected together. A rule whose reply, payload and
    // variable actions are all static needs none.
    const actionEntries = Array.isArray(rule.actions?.setVariables) ? rule.actions?.setVariables ?? [] : []
    const needsResolver =
      hasPlaceholder(rule.reply?.topic) ||
      hasPlaceholder(rule.reply?.payload) ||
      actionEntries.some((action) => hasPlaceholder(action?.value))
    const resolver = needsResolver
      ? createReplyResolver({
          variables: context.variables,
          definitions: context.definitions,
          connectionId: context.connectionId,
          topic: context.topic,
          msg: result.received,
        })
      : IDENTITY_RESOLVER
    try {
      const topic = resolver.resolve(rule.reply?.topic ?? '').trim()
      const payload = topic ? buildReplyPayloadWith(rule, result.received, resolver) : ''
      // The variable actions are resolved with the same resolver, so a captured value may use the
      // received message (`${msg.msgId}`) and the connection variables. They are resolved before
      // the unresolved check so an unknown name in an action value is reported too.
      const actionConfig = rule.actions && typeof rule.actions === 'object' ? rule.actions : undefined
      const actions: PlannedAutoReply['actions'] = actionConfig
        ? {
            resetVariables: Array.isArray(actionConfig.resetVariables)
              ? actionConfig.resetVariables.filter((name): name is string => typeof name === 'string' && name !== '')
              : undefined,
            setVariables: Array.isArray(actionConfig.setVariables)
              ? actionConfig.setVariables
                  .filter((action) => action && typeof action === 'object' && typeof action.name === 'string')
                  .map((action) => ({
                    name: action.name,
                    value: resolver.resolve(typeof action.value === 'string' ? action.value : ''),
                  }))
              : undefined,
          }
        : undefined
      // A reply has no user to ask: unlike the publish path there is no dialog to confirm sending
      // the placeholder verbatim, so an unresolved variable skips the rule and is logged instead.
      const unresolved = resolver.unresolved
      if (!topic) {
        throw new Error('reply topic is empty')
      }
      if (unresolved.length) {
        throw new Error(`unresolved variables: ${unresolved.join(', ')}`)
      }
      replies.push({
        ruleId: rule.id,
        topic,
        payload,
        qos: rule.reply?.qos ?? 0,
        retain: Boolean(rule.reply?.retain),
        delayMs: normalizeDelay(rule.reply?.delayMs),
        actions,
      })
      // Persist a counter only once the reply could really be built: an unresolved variable or an
      // invalid echo body must not consume a sequence number. A static reply has no resolver; the
      // session message counter still advances for it.
      if (context.commitCounters !== false) {
        if (needsResolver) {
          resolver.commit()
        } else if (context.connectionId) {
          const session = readConnectionSession(context.connectionId)
          writeSessionSentCount(context.connectionId, (session?.sentCount ?? 0) + 1)
        }
      }
    } catch (error) {
      replies.push({
        ruleId: rule.id,
        topic: '',
        payload: '',
        qos: rule.reply?.qos ?? 0,
        retain: false,
        delayMs: 0,
        error: (error as Error).toString(),
      })
    }
  })
  return replies
}
