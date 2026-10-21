import lodashGet from 'lodash/get'
import { resolvePayloadVariables } from '@/utils/payloadVariables'
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
 * The reply topic and the reply payload are templates: `${name}` is a payload variable of the
 * connection and `${msg.path.to.field}` reads a field of the received message, so a reply can echo
 * the `msgId` of the request without any script.
 */
export interface AutoReplyContext {
  /** topic the message was received on */
  topic: string
  /** raw payload of the received message */
  payload: string | Buffer
  variables?: { [name: string]: string }
  /**
   * The payload parsed once, shared by every rule of this message.
   *
   * A device normally has several rules that only differ in their condition, so parsing inside each
   * rule parsed the very same text once per rule. `planAutoReplies` fills this in; a caller that
   * matches a single rule may leave it out and the rule parses for itself.
   */
  parsed?: { value?: any; error?: string }
}

export interface PlannedAutoReply {
  ruleId: string
  topic: string
  payload: string
  qos: QoS
  retain: boolean
  delayMs: number
  /** why the reply could not be built (shown in the log, the rule is skipped) */
  error?: string
}

export interface AutoReplyTemplateScope {
  variables?: { [name: string]: string }
  topic?: string
  /** the received payload, already parsed as JSON */
  msg?: any
}

const FIELD_PLACEHOLDER = /\$\{(msg(?:[.[][^}]*)?|topic)\}/g

/** `setTimeout()` treats anything above 2^31-1 as 1ms, so a huge delay would fire immediately. */
const normalizeDelay = (delayMs: unknown): number => {
  const value = Number(delayMs)
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.min(Math.round(value), 2147483647)
}

/** Reads `${msg.data.list[0].id}`, `${msg}` or `${topic}` of the received message. */
const readMessageField = (scope: AutoReplyTemplateScope, path: string): any => {
  if (path === 'topic') {
    return scope.topic
  }
  if (path === 'msg') {
    return scope.msg
  }
  return lodashGet(scope.msg, path.slice('msg'.length).replace(/^\./, ''))
}

/**
 * Renders a topic/payload template of a reply: first the message references (`${msg.x}`, `${topic}`)
 * and then the payload variables of the connection (`${clientId}`, `${count:1}`, ...).
 */
export const renderReplyTemplate = (template: string, scope: AutoReplyTemplateScope = {}): string => {
  if (!template) {
    return template
  }
  const withMessage = template.replace(FIELD_PLACEHOLDER, (_match, path: string) => {
    const value = readMessageField(scope, path)
    if (value === undefined || value === null) {
      return ''
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  })
  return resolvePayloadVariables(withMessage, { variables: scope.variables ?? {} }).text
}

/**
 * Builds the reply body.
 *
 * `fixed` sends the configured payload as it is (templates resolved). `echo` starts from the
 * received message and merges the configured JSON object into it, which is what answers a command
 * with "the same message plus a result code".
 */
export const buildReplyPayload = (
  rule: AutoReplyRuleModel,
  received: unknown,
  scope: AutoReplyTemplateScope,
): string => {
  const body = rule.reply?.payload ?? ''
  if (rule.reply?.mode !== 'echo') {
    return renderReplyTemplate(body, scope)
  }
  // The configured fields are templates too: without resolving them here, a rule that reads
  // `{"code":0,"seen":"${msg.msgId}"}` would send the placeholder literally (and then be refused
  // as "still contains an unresolved placeholder"), which made echoing a field impossible.
  const extension = body.trim() ? parseJsonPayload(renderReplyTemplate(body, scope)) : { value: undefined }
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

/** Whether the rule matches this message: topic filter first, then the JMESPath condition. */
export const matchesAutoReplyRule = (
  rule: AutoReplyRuleModel,
  context: AutoReplyContext,
): { matched: boolean; received?: any; error?: string } => {
  if (!rule || rule.enabled === false) {
    return { matched: false }
  }
  const filter = renderReplyTemplate(rule.matchTopic ?? '', { variables: context.variables })
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
    const scope: AutoReplyTemplateScope = { variables: context.variables, topic: context.topic, msg: result.received }
    try {
      const topic = renderReplyTemplate(rule.reply?.topic ?? '', scope).trim()
      if (!topic) {
        replies.push({
          ruleId: rule.id,
          topic: '',
          payload: '',
          qos: rule.reply?.qos ?? 0,
          retain: false,
          delayMs: 0,
          error: 'reply topic is empty',
        })
        return
      }
      replies.push({
        ruleId: rule.id,
        topic,
        payload: buildReplyPayload(rule, result.received, scope),
        qos: rule.reply?.qos ?? 0,
        retain: Boolean(rule.reply?.retain),
        delayMs: normalizeDelay(rule.reply?.delayMs),
      })
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
