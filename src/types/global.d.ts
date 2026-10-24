import Vue from 'vue'
import { TranslateResult } from 'vue-i18n'
import { IPublishPacket, MqttClient } from 'mqtt'
import type { AIModel } from '@/utils/ai/copilot'

declare global {
  type $TSFixed = any

  type Theme = 'light' | 'dark' | 'night'

  type Language = 'zh' | 'en' | 'ja' | 'tr' | 'hu' | 'ko'

  type Protocol = 'ws' | 'wss' | 'mqtt' | 'mqtts'

  type PayloadType = 'Plaintext' | 'Base64' | 'JSON' | 'Hex' | 'CBOR' | 'MsgPack'

  type QoS = 0 | 1 | 2

  type RetainHandling = 0 | 1 | 2

  type QoSList = [0, 1, 2]

  type RetainHandlingList = [0, 1, 2]

  type ProtocolMap = {
    [key in ProtocolOption]: string
  }

  type CertType = '' | 'server' | 'self'

  type MqttVersion = '3.1.1' | '5.0'

  enum ProtocolOption {
    ws = 'ws',
    wss = 'wss',
    mqtt = 'mqtt',
    mqtts = 'mqtts',
  }

  type MessageType = 'all' | 'received' | 'publish'

  // Vue
  type VueForm = Vue & {
    validate: (validate: (valid: boolean) => void) => void
    clearValidate: () => void
    resetFields: () => void
  }

  interface FormRule {
    field: string
    fullField: string
    type: string
    validator: () => void
  }

  interface MetricsModel {
    label: string
    received: number
    sent: number
  }

  // System
  interface ContextmenuModel {
    top: number
    left: number
  }

  interface Options {
    value: any
    label: string | TranslateResult
    children?: Options[]
    disabled?: boolean
  }

  type SearchCallBack = (data: ConnectionModel[]) => ConnectionModel[]

  type NameCallBack = (name: string) => string

  // Vuex state
  interface ActiveConnection {
    [id: string]: {
      client: MqttClient
      subscriptions?: SubscriptionModel[]
      responseInformation?: string
    }
  }
  interface App {
    currentTheme: Theme
    currentLang: Language
    autoCheck: boolean
    autoResub: boolean
    syncOsTheme: boolean
    multiTopics: boolean
    maxReconnectTimes: number
    showClientInfo: {
      [id: string]: boolean
    }
    unreadMessageCount: {
      [id: string]: number
    }
    activeConnection: ActiveConnection
    willMessageVisible: boolean
    advancedVisible: boolean
    allConnections: ConnectionModel[]
    currentScript: ScriptState | null
    currentConnectionId: string | null
    connectionTreeState: ConnectionTreeStateMap
    jsonHighlight: boolean
    enableCopilot: boolean
    openAIAPIHost: string
    openAIAPIKey: string
    model: AIModel
    isPrismButtonAdded: boolean
    logLevel: LogLevel
    showConnectionList: boolean
    connectDatabaseFailMessage: string
    ignoreQoS0Message: boolean
    topicWhitespaceDetection: boolean
    maxPayloadDisplaySize: number
    enableHardwareAcceleration: boolean
    saveHistoryMessage: boolean
    historyMaxCount: number
  }

  interface State {
    app: App
  }

  // Routes
  interface Routes {
    path: string
    component: any
    name: string
    redirect?: string
    children?: Routes[]
  }

  // Connections
  interface Client {
    readonly id: string
    client: Partial<MqttClient>
    responseInformation?: string
  }

  interface Message {
    readonly id: string
    message: MessageModel
  }

  interface ClientInfo {
    readonly id: string
    showClientInfo: boolean
  }

  interface Subscriptions {
    readonly id: string
    subscriptions: SubscriptionModel[]
  }

  interface UnreadMessage {
    readonly id: string
    unreadMessageCount?: 0
    increasedCount?: number
  }

  interface SubscriptionModel {
    id?: string
    topic: string
    qos: QoS
    disabled: boolean
    alias?: string
    retain?: boolean
    color?: string
    createAt: string
    // MQTT 5.0 only
    nl?: boolean
    rap?: boolean
    rh?: RetainHandling
    subscriptionIdentifier?: number | null
    userProperties?: { [key: string]: string | string[] } | null
    /** true while the row was subscribed by the automatic subscriptions and is untouched */
    autoSubscribed?: boolean | null
  }

  interface MessageModel {
    id?: string
    createAt: string
    out: boolean
    payload: string
    qos: QoS
    retain: boolean
    topic: string
    color?: string
    properties?: PushPropertiesModel
    meta?: string
  }

  interface MessagePaginationModel {
    list: MessageModel[]
    total: number
    publishedTotal: number
    receivedTotal: number
    limit: number
    page: number
  }

  interface HistoryMessageHeaderModel {
    connectionId?: string
    id?: string
    retain: boolean
    topic: string
    qos: QoS
    payload?: string | null
    payloadType?: string | null
    createAt?: string
  }

  /** A currently running timed message (owned by the global timed message manager). */
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

  /** Reusable MQTT server (dev/test/...) profile, selectable when creating a connection. */
  interface ServerProfileModel {
    id: string
    alias: string
    host: string
    port: number
    protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss'
    path?: string
  }

  /** Reusable MQTT client identity (clientId/username/password), selectable when creating a connection. */
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

  /** Reusable topic + message preset, selectable directly in the publish window. */
  interface MessagePresetModel {
    id: string
    name: string
    topic: string
    payload: string
  }

  /**
   * A reusable message sequence, edited in preset settings.
   * Creating a connection lists these and copies the chosen one onto that connection.
   */
  interface MessageSequencePresetModel {
    id: string
    name: string
    sequence: MessageSequenceModel
    /** Variables the sequence needs, copied onto the connection when the template is applied. */
    variables?: { [name: string]: StoredVariable } | null
  }

  /**
   * A user-defined payload variable. Every message can reference it as `${name}` in its topic and
   * its payload; the value may itself contain placeholders (built-in ones, other variables, or a
   * message field in an automatic reply).
   *
   * A variable is either a plain constant or one of the stateful kinds (`sequence`, `random`,
   * `randomWalk`, `choice`, `session`, `captured`), configured by `definition`.
   */
  interface GlobalVariableModel {
    id: string
    name: string
    /** the constant template, or the initial value of a stateful variable (legacy: always present) */
    value: string
    /** stateful configuration; absent means a plain constant */
    definition?: VariableDefinitionConfig
  }

  /** How a stateful variable produces its value. */
  type VariableKind = 'constant' | 'sequence' | 'random' | 'randomWalk' | 'choice' | 'session' | 'captured'

  /** Lifecycle events that may reset a stateful variable to its initial value. */
  type VariableResetTrigger = 'connect' | 'disconnect' | 'appStart' | 'manual' | 'bound'

  /** What happens when a sequence leaves its [min, max] range. */
  type VariableBoundStrategy = 'clamp' | 'wrap' | 'reset' | 'keep'

  /**
   * The persisted configuration of one variable. The bare-string form (`StoredVariable`) is the
   * original constant variable, so every older connection/preset/backup keeps working unchanged.
   */
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

  /** One variable of a `{ name: value }` map: a constant string or a definition. */
  type StoredVariable = string | VariableDefinitionConfig

  interface HistoryMessagePayloadModel {
    connectionId?: string
    id?: string
    payload: string
    payloadType: string
    createAt?: string
  }

  interface SSLPath {
    rejectUnauthorized?: boolean
    ALPNProtocols?: string | null
    ca: string
    cert: string
    key: string
  }

  // MQTT 5 feature
  interface WillPropertiesModel {
    willDelayInterval?: number | null
    payloadFormatIndicator?: boolean | null
    messageExpiryInterval?: number | null
    contentType?: string | null
    responseTopic?: string | null
    correlationData?: string | Buffer | null
    userProperties?: { [key: string]: string | string[] } | null
  }

  interface WillModel {
    id?: string
    lastWillTopic: string
    lastWillPayload: string
    lastWillQos: QoS
    lastWillRetain: boolean
    properties?: WillPropertiesModel
  }

  interface ConnectionModel extends SSLPath {
    readonly id?: string
    clientId: string
    name: string
    clean: boolean
    protocol?: Protocol
    createAt: string
    updateAt: string
    host: string
    port: number
    keepalive: number
    connectTimeout: number
    reconnect: boolean
    reconnectPeriod: number
    username: string
    password: string
    path: string
    certType?: CertType
    ssl: boolean
    mqttVersion: string
    unreadMessageCount: number
    messages: MessageModel[]
    subscriptions: SubscriptionModel[]
    will?: WillModel
    clientIdWithTime?: boolean
    parentId?: string | null
    isCollection: false
    orderId?: number
    properties?: ClientPropertiesModel
    /**
     * Variables of this client ("客户端变量"), e.g. the product type it talks to. They are
     * referenced as `${name}` in a topic and in a payload and win over the global variables of
     * the preset manager. A value is a constant string or a stateful definition.
     */
    variables?: { [name: string]: StoredVariable } | null
    /** Topics subscribed automatically once the connection is established. */
    autoSubscriptions?: AutoSubscribeGroupModel[] | null
    /** Rules that answer a received message automatically on this connection. */
    autoReplies?: AutoReplyRuleModel[] | null
    /**
     * Ordered publishes of this connection. Each step waits a delay after the previous one,
     * resolves its templates at send time, then applies its variable assignments.
     */
    messageSequences?: MessageSequenceModel[] | null
  }

  /** One topic filter of an automatic subscription batch. */
  interface AutoSubscribeTopicModel {
    topic: string
    qos: QoS
    /**
     * Paused from the subscription panel ("停止订阅"). The topic stays configured but is not
     * subscribed after connecting, so pausing a row in the panel is not undone by the automation.
     */
    disabled?: boolean
  }

  /**
   * A batch of topics subscribed together after the connection is established, e.g. what a device
   * sends right after it came online. `delayMs` counts from the moment the connection succeeded and
   * `merge` sends all topics of the batch in one SUBSCRIBE packet (one SUBACK for the whole batch).
   */
  interface AutoSubscribeGroupModel {
    id: string
    delayMs: number
    merge: boolean
    enabled: boolean
    topics: AutoSubscribeTopicModel[]
  }

  /** What a matched message is answered with. */
  interface AutoReplyReplyModel {
    topic: string
    /** `echo` merges `payload` into the received JSON object, `fixed` sends `payload` as it is. */
    mode: 'echo' | 'fixed'
    payload: string
    qos: QoS
    retain: boolean
    delayMs: number
  }

  /**
   * One automatic reply rule, e.g. answering a device command. `matchTopic` is an MQTT topic filter
   * and `matchCondition` a JMESPath expression evaluated against the received payload parsed as
   * JSON, so a rule reads like `cmd == 'WIFI_RECONNECT_SERVICE'`.
   */
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

  /** Variable actions of an automatic reply rule, applied when the rule matched (E7 / C4). */
  interface AutoReplyActionsModel {
    /** names of variables reset to their initial value after the match */
    resetVariables?: string[]
    /** `{ name, value }` where value is a template resolved against the received message */
    setVariables?: Array<{ name: string; value: string }>
  }

  /** When a message sequence starts. `message` uses the same topic filter and JMESPath condition as a reply. */
  type MessageSequenceTrigger = 'manual' | 'connect' | 'message'

  /** Comparison of a sequence's stop condition. Checked after a round, before the next one starts. */
  type MessageSequenceCompare = 'lt' | 'lte' | 'gt' | 'gte' | 'eq'

  /** Stop another loop when the named variable compares against `value`. The variable is read after the last step's assignment. */
  interface MessageSequenceStopWhen {
    variable: string
    op: MessageSequenceCompare
    value: number
  }

  /**
   * One publish of a message sequence.
   *
   * `delayMs` is relative to the previous step (the first step may be 0). Templates are resolved
   * when the step is sent. `actions` are applied after that publish, so the next step reads them.
   */
  interface MessageSequenceStepModel {
    id: string
    delayMs: number
    topic: string
    payload: string
    qos: QoS
    retain: boolean
    actions?: AutoReplyActionsModel
  }

  /**
   * Several publishes that belong together, e.g. a water report that then drinks on a schedule,
   * or the ack and progress messages of an OTA. Starting the sequence again cancels the steps
   * that have not been sent.
   */
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

  // MQTT 5 feature
  interface ClientPropertiesModel {
    sessionExpiryInterval?: number | null
    receiveMaximum?: number | null
    maximumPacketSize?: number | null
    topicAliasMaximum?: number | null
    requestResponseInformation?: boolean | null
    requestProblemInformation?: boolean | null
    userProperties?: { [key: string]: string | string[] } | null
    authenticationMethod?: string | null
    authenticationData?: Buffer | null
  }

  interface PushOptions {
    qos?: QoS
    retain?: boolean
    dup?: boolean
    properties?: PushPropertiesModel
  }

  // MQTT 5 feature
  interface PushPropertiesModel {
    payloadFormatIndicator?: boolean | null
    messageExpiryInterval?: number | null
    topicAlias?: number | null
    responseTopic?: string | null
    correlationData?: string | Buffer | null
    userProperties?: { [key: string]: string | string[] } | null
    subscriptionIdentifier?: number | null
    contentType?: string | null
  }

  interface CollectionModel {
    readonly id: string
    name: string
    children: ConnectionModelTree[]
    isCollection: true
    isEdit?: boolean
    orderId?: number
    isNewing?: boolean
  }

  type ConnectionModelTree = CollectionModel | ConnectionModel

  interface SSLContent {
    ca: string | string[] | Buffer | Buffer[] | undefined
    cert: string | string[] | Buffer | Buffer[] | undefined
    key: string | string[] | Buffer | Buffer[] | undefined
  }

  interface ConnectionTreeState {
    id: string
    expanded: boolean
  }

  interface ConnectionTreeStateMap {
    [id: string]: {
      expanded: boolean
    }
  }

  // Scripts
  // TODO: split this
  interface ScriptModel {
    id?: string
    name: string
    script: string
    type?: string | null
  }

  interface FunctionModel {
    id?: string
    name: string
    script: string
    type?: string | null
  }

  interface SchemaModel {
    id?: string
    name: string
    rawSchema: string
    type: SchemaType
  }

  // TODO: split this
  interface ScriptState {
    apply: MessageType
    function?: ScriptModel | null
    schema?: ScriptModel | null
    // config of function/schema
    config?: {
      // protobuf name
      name?: string
    }
  }

  interface FunctionState {
    function: ScriptModel | null
  }

  interface ProtobufSchema {
    type: 'protobuf'
    schema: SchemaModel | null
    protobufMsgName: string
  }

  interface AvroSchema {
    type: 'avro'
    schema: SchemaModel | null
  }

  type SchemaState = {
    apply: MessageType
    schemaOptions: ProtobufSchema | AvroSchema
  }

  interface SettingModel {
    autoCheck?: boolean
    currentLang?: Language
    currentTheme?: Theme
    maxReconnectTimes?: number
    autoResub?: boolean
    saveHistoryMessage?: boolean
    historyMaxCount?: number
  }

  type SchemaType = 'protobuf' | 'avro'
  type FunctionType = 'javascript'
  interface SchemaList {
    label: string
    value: SchemaType
  }
  interface FunctionList {
    label: string
    value: FunctionType
  }

  interface ImportScriptForm {
    filePath: string
    fileName: string
    fileContent: string
  }

  type CopilotRole = 'user' | 'system' | 'assistant'
  interface CopilotMessage {
    id: string
    role: CopilotRole
    content: string
    createAt?: string
  }

  interface AreaLineSeriesData {
    xData: string[]
    seriesData: {
      name: string
      areaStyle: {
        colorFrom: string
        colorTo: string
      }
      data: any[]
    }[]
  }

  type LogLevel = 'debug' | 'info' | 'warn' | 'error'

  interface TopicTreeNode {
    id: string
    label: string
    messageCount: number
    subTopicCount: number
    message?: MessageModel
    connectionInfo?: ConnectionModel
    parentId?: string
    children?: TopicTreeNode[]
  }

  interface UpdateTopicNodeResult {
    updatedTree: TopicTreeNode[]
    updatedNode: TopicTreeNode | null
  }

  interface TopicNodeStats {
    msgTopic: string
    msgCount: number
    lastTime: string
    latestMessage?: MessageModel
  }

  interface QueuedMessage {
    connectionId: string
    updateNodes: TopicTreeNode[]
    timestamp: number
  }

  interface EChartsTreeNode extends TopicTreeNode {
    name: string
    lastMessage?: string
    data?: TopicTreeNode
    children?: EChartsTreeNode[]
  }
  interface DashboardModel {
    id: string
    name: string
    description?: string
    orderId?: number
    globalSettings?: any
    widgets: WidgetModel[]
    createAt: string
    updateAt: string
  }

  type WidgetType = 'Big Number' | 'Gauge' | 'Line'
  interface WidgetModel {
    id?: string
    type: WidgetType
    title?: string

    x: number
    y: number
    w: number
    h: number
    static?: boolean
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number

    dashboardId: string

    connectionId?: string
    topicPattern?: string
    valueField?: string
    fallbackValue: number

    schemaType?: 'protobuf' | 'avro'
    schemaId?: string
    schemaMessageName?: string

    // Schema validation state tracking
    schemaValidationState?: 'valid' | 'invalid'
    schemaValidationError?: string

    widgetOptions?: GaugeWidgetOptions | BigNumberWidgetOptions | LineWidgetOptions

    createAt?: string
    updateAt?: string
  }
  interface GaugeWidgetOptions {
    thresholdsType?: 'Absolute' | 'Percentage'
    min?: number
    max?: number
    thresholds?: Threshold[]
    decimals?: number
    unit?: string
    color?: string
  }
  interface BigNumberWidgetOptions {
    thresholdsType?: 'Absolute' | 'Percentage'
    thresholds?: Threshold[]
    min?: number
    max?: number
    decimals?: number
    unit?: string
    color?: string
  }
  interface LineWidgetOptions {
    thresholdsType?: 'Absolute' | 'Percentage'
    thresholds?: Threshold[]
    smooth?: boolean
    area?: boolean
    color?: string
  }
  interface Threshold {
    value: number
    color: string
  }

  interface TimeSeriesDataPoint {
    timestamp: string
    values: { [fieldName: string]: any }
    topic: string
    connectionId: string
    metadata: { qos: QoS; retain: boolean }
  }

  interface BigNumberData {
    value: number | null
    fieldName?: string
    chartData: {
      xData: string[]
      seriesData: [
        {
          name: string
          data: number[]
        },
      ]
    }
  }
  interface GaugeData {
    value: number | null
    fieldName?: string
  }
  interface LineData {
    chartData: {
      xData: string[]
      seriesData: [
        {
          name: string
          data: number[]
        },
      ]
    }
  }
}
