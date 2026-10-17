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
export const buildReplyPayload = (rule: AutoReplyRuleModel, received: any, scope: AutoReplyTemplateScope): string => {
  const body = rule.reply?.payload ?? ''
  if (rule.reply?.mode !== 'echo') {
    return renderReplyTemplate(body, scope)
  }
  const extension = body.trim() ? parseJsonPayload(body) : { value: undefined }
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
  return JSON.stringify({ ...received, ...extra })
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
  const condition = (rule.matchCondition ?? '').trim()
  if (!condition) {
    const parsed = parseJsonPayload(context.payload)
    return { matched: true, received: parsed.value }
  }
  const parsed = parseJsonPayload(context.payload)
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
  const replies: PlannedAutoReply[] = []
  rules.forEach((rule) => {
    const result = matchesAutoReplyRule(rule, context)
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
        delayMs: Math.max(0, Number(rule.reply?.delayMs) || 0),
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
