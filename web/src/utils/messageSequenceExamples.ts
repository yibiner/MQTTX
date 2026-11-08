/**
 * The two device scenarios the message sequence is built for.
 *
 * They are stored as sequence presets and offered on a new connection. Applying one copies
 * it onto that connection; it is not written onto a connection until the user asks.
 *
 * Water is a captured variable, not a sequence variable. A sequence variable would subtract
 * its own step on every read and fight the -20 / -30 the steps assign. The step resolves
 * `${water - 20}` first and assigns that result afterwards, so the payload and the stored
 * value stay the same number.
 *
 * The OTA delays are relative to the previous step. The first progress is 10s after the
 * command: 1s for the ack plus 9s, then 20s between the later percents.
 */

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const WATER_VARIABLE_NAME = 'water'

/** Stable ids so the first-run seed is the same row the preset list edits later. */
export const WATER_SEQUENCE_PRESET_ID = 'builtin-water-cycle'
export const OTA_SEQUENCE_PRESET_ID = 'builtin-ota'

/** Captured `water`, starting at 2000ml. It keeps its value across reconnects. */
export const waterVariableDefinition = (): VariableDefinitionConfig => ({
  kind: 'captured',
  value: '2000',
  resetOn: [],
})

const waterStep = (delayMs: number, payload: string, assign?: string): MessageSequenceStepModel => ({
  id: createId(),
  delayMs,
  topic: 'device/${clientId}/water/post',
  payload,
  qos: 0,
  retain: false,
  ...(assign ? { actions: { setVariables: [{ name: WATER_VARIABLE_NAME, value: assign }] } } : {}),
})

/** Send the current water, then drink -20 / -20 / -30 and repeat until water is below 500. */
export const createWaterCycleSequence = (): MessageSequenceModel => ({
  id: createId(),
  name: '水量循环',
  enabled: true,
  trigger: 'connect',
  matchTopic: '',
  matchCondition: '',
  loop: true,
  stopWhen: { variable: WATER_VARIABLE_NAME, op: 'lt', value: 500 },
  steps: [
    waterStep(0, '{"remaining":${water}}'),
    waterStep(60 * 1000, '{"remaining":${water - 20},"delta":-20}', '${water - 20}'),
    waterStep(5 * 60 * 1000, '{"remaining":${water - 20},"delta":-20}', '${water - 20}'),
    waterStep(5 * 60 * 1000, '{"remaining":${water - 30},"delta":-30}', '${water - 30}'),
  ],
})

const otaStep = (delayMs: number, topic: string, payload: string): MessageSequenceStepModel => ({
  id: createId(),
  delayMs,
  topic,
  payload,
  qos: 0,
  retain: false,
})

/**
 * After an OTA command: ack, then progress 0/20/40/90/100, then success and the version.
 * A second command cancels whatever of this run has not been sent yet.
 */
export const createOtaSequence = (): MessageSequenceModel => ({
  id: createId(),
  name: 'OTA 进度',
  enabled: true,
  trigger: 'message',
  matchTopic: 'device/ota/cmd',
  matchCondition: "cmd == 'OTA'",
  loop: false,
  stopWhen: { variable: '', op: 'lt', value: 0 },
  steps: [
    otaStep(1000, 'device/ota/ack', '{"cmd":"OTA","ack":0}'),
    otaStep(9000, 'device/ota/progress', '{"progress":0}'),
    otaStep(20000, 'device/ota/progress', '{"progress":20}'),
    otaStep(20000, 'device/ota/progress', '{"progress":40}'),
    otaStep(20000, 'device/ota/progress', '{"progress":90}'),
    otaStep(20000, 'device/ota/progress', '{"progress":100}'),
    otaStep(1000, 'device/ota/progress', '{"result":"success"}'),
    otaStep(0, 'device/ota/version', '{"version":"1.2.3"}'),
  ],
})

/** An empty sequence for the preset dialog. */
export const createBlankMessageSequence = (): MessageSequenceModel => ({
  id: createId(),
  name: '',
  enabled: true,
  trigger: 'manual',
  matchTopic: '',
  matchCondition: '',
  loop: false,
  stopWhen: { variable: '', op: 'lt', value: 0 },
  steps: [
    {
      id: createId(),
      delayMs: 0,
      topic: '',
      payload: '',
      qos: 0,
      retain: false,
      actions: { setVariables: [] },
    },
  ],
})

/**
 * A copy with fresh ids. Two connections, or two inserts on one connection, must not share a
 * sequence id: a later run of one would cancel the other.
 */
export const cloneMessageSequence = (sequence: MessageSequenceModel): MessageSequenceModel => {
  const copy = JSON.parse(JSON.stringify(sequence)) as MessageSequenceModel
  copy.id = createId()
  copy.steps = (copy.steps ?? []).map((step) => ({ ...step, id: createId() }))
  return copy
}

/** The sequence templates a fresh install offers. Editing or deleting them stays deleted. */
export const builtinMessageSequencePresets = (): MessageSequencePresetModel[] => {
  const water = createWaterCycleSequence()
  const ota = createOtaSequence()
  return [
    {
      id: WATER_SEQUENCE_PRESET_ID,
      name: water.name,
      sequence: { ...water, id: `${WATER_SEQUENCE_PRESET_ID}-seq` },
      variables: { [WATER_VARIABLE_NAME]: waterVariableDefinition() },
    },
    {
      id: OTA_SEQUENCE_PRESET_ID,
      name: ota.name,
      sequence: { ...ota, id: `${OTA_SEQUENCE_PRESET_ID}-seq` },
    },
  ]
}
