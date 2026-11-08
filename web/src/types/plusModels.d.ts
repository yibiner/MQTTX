/**
 * Models added by MQTTX Plus, ported from the desktop build (`src/types/global.d.ts`).
 *
 * They live in their own file so the upstream web sources stay untouched: TypeScript merges
 * interfaces declared in the same global scope, so `ConnectionModel` below only lists the fields
 * this fork adds on top of the upstream definition in `global.d.ts`.
 */

interface AutoReplyActionsModel {
  /** names of variables reset to their initial value after the match */
  resetVariables?: string[]
  /** `{ name, value }` where value is a template resolved against the received message */
  setVariables?: Array<{ name: string; value: string }>
}

interface AutoReplyPresetModel {
  id: string
  name: string
  rule: AutoReplyRuleModel
  rules?: AutoReplyRuleModel[]
  /** Variables the rules refer to, copied onto the connection when the preset is inserted. */
  variables?: { [name: string]: StoredVariable } | null
}

interface AutoReplyReplyModel {
  topic: string
  /** `echo` merges `payload` into the received JSON object, `fixed` sends `payload` as it is. */
  mode: 'echo' | 'fixed'
  payload: string
  qos: QoS
  retain: boolean
  delayMs: number
}

interface AutoReplyRuleModel {
  id: string
  name: string
  enabled: boolean
  matchTopic: string
  matchCondition: string
  reply: AutoReplyReplyModel
  /**
   * What the rule does to stateful variables when it matches: reset some to their initial value
   * and/or capture fields of the received message for later messages.
   */
  actions?: AutoReplyActionsModel
}

interface AutoSubscribeGroupModel {
  id: string
  delayMs: number
  merge: boolean
  enabled: boolean
  topics: AutoSubscribeTopicModel[]
}

interface AutoSubscribeTopicModel {
  topic: string
  qos: QoS
  /**
   * Paused from the subscription panel ("停止订阅"). The topic stays configured but is not
   * subscribed after connecting, so pausing a row in the panel is not undone by the automation.
   */
  disabled?: boolean
}

type BehaviorCredentialSource = 'template' | 'device'

interface BehaviorSessionConfig {
  mqttVersion?: '3.1' | '3.1.1' | '5.0'
  connectTimeout?: number | null
  keepalive?: number | null
  reconnect?: boolean
  reconnectPeriod?: number | null
  clean?: boolean
  properties?: {
    sessionExpiryInterval?: number | null
    receiveMaximum?: number | null
    maximumPacketSize?: number | null
    topicAliasMaximum?: number | null
    requestResponseInformation?: boolean | null
    requestProblemInformation?: boolean | null
    userProperties?: { [key: string]: string | string[] } | null
    authenticationMethod?: string | null
  } | null
}

interface BehaviorTemplateModel {
  id: string
  name: string
  parentId?: string | null
  /** server preset applied when a connection is created from this template; empty inherits */
  defaultServerId?: string | null
  username?: string
  password?: string
  /** empty inherits the parent's source; the default for a template with no parent is `template` */
  usernameFrom?: BehaviorCredentialSource | null
  passwordFrom?: BehaviorCredentialSource | null
  /**
   * MQTT client options from the connection form's Advanced section.
   * Only keys this template sets are stored; the rest follow the parent.
   */
  session?: BehaviorSessionConfig | null
  /** Last-will fields this template sets. Missing keys follow the parent. */
  will?: BehaviorWillConfig | null
  variables?: { [name: string]: StoredVariable } | null
  autoSubscriptions?: AutoSubscribeGroupModel[] | null
  /** One-shot publishes after connect. Appended along the template chain. */
  connectReports?: ConnectReportModel[] | null
  timedReports?: TimedReportModel[] | null
  autoReplies?: AutoReplyRuleModel[] | null
  messageSequences?: MessageSequenceModel[] | null
}

interface BehaviorWillConfig {
  lastWillTopic?: string
  lastWillPayload?: string
  lastWillQos?: QoS
  lastWillRetain?: boolean
  properties?: {
    willDelayInterval?: number | null
    payloadFormatIndicator?: boolean | null
    messageExpiryInterval?: number | null
    contentType?: string | null
    responseTopic?: string | null
    correlationData?: string | null
  } | null
}

interface ClientProfileModel {
  id: string
  alias: string
  clientId: string
  username?: string
  password?: string
  /** MQTT protocol version, undefined = keep whatever the form already has (legacy profiles) */
  mqttVersion?: '3.1' | '3.1.1' | '5.0'
  connectTimeout?: number
  keepalive?: number
  reconnect?: boolean
  reconnectPeriod?: number
  clean?: boolean
  /** Variables of the client itself, copied into its "客户端变量" when the preset is applied. */
  variables?: { [name: string]: StoredVariable } | null
  /** Subscriptions the preset starts after connecting, copied into the connection. */
  autoSubscriptions?: AutoSubscribeGroupModel[] | null
  /** Automatic replies of the preset, copied into the connection. */
  autoReplies?: AutoReplyRuleModel[] | null
  /** Ordered publishes of the preset, copied into the connection. */
  messageSequences?: MessageSequenceModel[] | null
}

interface ConnectReportModel {
  id: string
  delay: number
  topic: string
  payload: string
  qos?: QoS
  retain?: boolean
  payloadType?: PayloadType
  /** false keeps the row but does not send it after connecting */
  enabled?: boolean
}

interface GlobalVariableModel {
  id: string
  name: string
  /** the constant template, or the initial value of a stateful variable (legacy: always present) */
  value: string
  /** stateful configuration; absent means a plain constant */
  definition?: VariableDefinitionConfig
}

interface MessagePresetModel {
  id: string
  name: string
  topic: string
  payload: string
}

type MessageSequenceCompare = 'lt' | 'lte' | 'gt' | 'gte' | 'eq'

interface MessageSequenceModel {
  id: string
  name: string
  enabled: boolean
  trigger: MessageSequenceTrigger
  /** MQTT topic filter, used when `trigger` is `message`. */
  matchTopic: string
  /** JMESPath condition against the received JSON, used when `trigger` is `message`. */
  matchCondition: string
  loop: boolean
  /** Read after the last step of a round. Ignored when `loop` is false. */
  stopWhen?: MessageSequenceStopWhen | null
  steps: MessageSequenceStepModel[]
}

interface MessageSequencePresetModel {
  id: string
  name: string
  sequence: MessageSequenceModel
  /** Variables the sequence needs, copied onto the connection when the template is applied. */
  variables?: { [name: string]: StoredVariable } | null
}

interface MessageSequenceStepModel {
  id: string
  delayMs: number
  topic: string
  payload: string
  qos: QoS
  retain: boolean
  actions?: AutoReplyActionsModel
}

interface MessageSequenceStopWhen {
  variable: string
  op: MessageSequenceCompare
  value: number
}

type MessageSequenceTrigger = 'manual' | 'connect' | 'message'

interface ServerProfileModel {
  id: string
  alias: string
  host: string
  port: number
  protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss'
  path?: string
}

type StoredVariable = string | VariableDefinitionConfig

interface TimedMessageRuntime {
  id: number
  interval: number
  topic: string
  /** epoch ms of the next scheduled send, shown in the panel */
  nextSendAt: number
  /**
   * True while the task is paused because the connection page it needs is not open. Only tasks
   * that require the view pipeline (user script, data schema, MQTT 5 properties, or a payload
   * type the fallback cannot encode) are ever paused.
   */
  degraded?: boolean
}

interface TimedReportModel {
  id: string
  /** seconds between publishes; the same unit the timed-message runner uses */
  interval: number
  topic: string
  payload: string
  qos?: QoS
  retain?: boolean
  payloadType?: PayloadType
  /** false keeps the row but does not start it after connecting */
  enabled?: boolean
}

interface TopicPresetModel {
  id: string
  name: string
  topic: string
}

type VariableBoundStrategy = 'clamp' | 'wrap' | 'reset' | 'keep'

interface VariableDefinitionConfig {
  kind?: VariableKind
  /** constant template, or the initial/default value of a stateful variable */
  value?: string
  /** sequence / randomWalk: first value when no stored state exists */
  initial?: number
  /** sequence: how much each send adds (a negative value counts down, e.g. -20) */
  step?: number
  min?: number
  max?: number
  onBound?: VariableBoundStrategy
  resetOn?: VariableResetTrigger[]
  /** whether an automatic reconnect also fires the `connect` reset (default true) */
  resetOnReconnect?: boolean
  /** reset lazily once this many seconds passed since the last reset/use */
  resetEverySec?: number
  /** randomWalk: maximum distance from the previous value per send */
  range?: number
  /** choice: weighted possible values */
  options?: Array<{ value: string; weight: number }>
  /** random / randomWalk / choice: reproducible pseudo random stream */
  seed?: number
  /** session: how the value of one connection session is generated */
  generator?: 'uuid' | 'template'
  /** output formatting: zero padding and/or decimal places */
  format?: { pad?: number; precision?: number }
}

type VariableKind = 'constant' | 'sequence' | 'random' | 'randomWalk' | 'choice' | 'session' | 'captured' | 'runStart'

type VariableResetTrigger = 'connect' | 'disconnect' | 'appStart' | 'manual' | 'bound'

/** Fields MQTTX Plus adds to the upstream connection model. */
interface ConnectionModel {
  variables?: { [name: string]: StoredVariable } | null
  autoSubscriptions?: AutoSubscribeGroupModel[] | null
  connectReports?: ConnectReportModel[] | null
  timedReports?: TimedReportModel[] | null
  autoReplies?: AutoReplyRuleModel[] | null
  messageSequences?: MessageSequenceModel[] | null
}

/** The automatic subscriptions are marked in the subscription list ("自动" badge). */
interface SubscriptionModel {
  autoSubscribed?: boolean
}
