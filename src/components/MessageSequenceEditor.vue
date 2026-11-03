<template>
  <div class="message-sequence-editor">
    <div class="editor-head">
      <el-button v-if="!singleton" type="text" icon="el-icon-plus" class="sequence-add" @click="addSequence">
        {{ $t('connections.messageSequenceAdd') }}
      </el-button>
      <PresetPicker
        v-if="templates.length"
        :items="presetOptions"
        :title="$t('configs.messageSequencePresets')"
        :label="$t('configs.insertPreset')"
        :empty-text="$t('configs.messageSequencePresetsEmpty')"
        :search-placeholder="$t('configs.presetSearchPlaceholder')"
        manage-tab="sequence"
        @select="insertTemplateById"
      />
      <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
        <div slot="content" class="automation-tip">
          <p>{{ $t('connections.messageSequenceDesc') }}</p>
          <p>{{ $t('connections.messageSequenceNote') }}</p>
        </div>
        <a href="javascript:;" class="editor-help">
          <i class="el-icon-warning-outline"></i>
        </a>
      </el-tooltip>
    </div>

    <div v-for="(sequence, index) in sequences" :key="sequence.id" class="sequence-card">
      <div v-if="!singleton || canRun" class="sequence-header">
        <el-input
          v-if="!singleton"
          v-model="sequence.name"
          size="mini"
          class="sequence-name"
          :placeholder="$t('connections.messageSequenceName')"
          @input="emitChange"
        ></el-input>
        <div class="sequence-options">
          <el-button
            v-if="canRun && !isRunning(sequence)"
            size="mini"
            type="primary"
            plain
            :disabled="!canStart(sequence)"
            @click="requestRun(sequence)"
          >
            {{ $t('connections.messageSequenceRun') }}
          </el-button>
          <el-button
            v-if="canRun && isRunning(sequence)"
            size="mini"
            type="danger"
            plain
            @click="requestStop(sequence)"
          >
            {{ $t('connections.messageSequenceStop') }}
          </el-button>
          <el-tooltip :content="$t('connections.autoReplyEnableRule')" placement="top" :effect="tooltipEffect">
            <el-switch
              v-model="sequence.enabled"
              active-color="#13ce66"
              inactive-color="#A2A9B0"
              @change="emitChange"
            ></el-switch>
          </el-tooltip>
          <a v-if="!singleton" href="javascript:;" class="sequence-delete" @click="removeSequence(index)">
            <i class="el-icon-delete"></i>
          </a>
        </div>
      </div>

      <div class="sequence-grid">
        <label>{{ $t('connections.messageSequenceTrigger') }}</label>
        <div class="trigger-row">
          <el-radio-group v-model="sequence.trigger" size="mini" @change="emitChange">
            <el-radio-button label="manual">{{ $t('connections.messageSequenceTriggerManual') }}</el-radio-button>
            <el-radio-button label="connect">{{ $t('connections.messageSequenceTriggerConnect') }}</el-radio-button>
            <el-radio-button label="message">{{ $t('connections.messageSequenceTriggerMessage') }}</el-radio-button>
          </el-radio-group>
          <!-- Preset dialog has no name row, so the enable switch shares the trigger line. -->
          <div v-if="singleton && !canRun" class="sequence-options">
            <el-tooltip :content="$t('connections.autoReplyEnableRule')" placement="top" :effect="tooltipEffect">
              <el-switch
                v-model="sequence.enabled"
                active-color="#13ce66"
                inactive-color="#A2A9B0"
                @change="emitChange"
              ></el-switch>
            </el-tooltip>
          </div>
        </div>

        <template v-if="sequence.trigger === 'message'">
          <label>{{ $t('connections.autoReplyMatchTopic') }}</label>
          <div class="topic-preset-field">
            <el-input
              v-model="sequence.matchTopic"
              size="mini"
              placeholder="device/ota/cmd"
              @input="emitChange"
            ></el-input>
            <TopicPresetPicker @select="applyMatchTopic(sequence, $event)" />
          </div>
          <label>{{ $t('connections.autoReplyCondition') }}</label>
          <div>
            <el-input
              v-model="sequence.matchCondition"
              size="mini"
              placeholder="cmd == 'OTA'"
              @input="emitChange"
            ></el-input>
            <p v-if="isConditionInvalid(sequence)" class="cell-error">
              {{ $t('connections.autoReplyConditionInvalid') }}
            </p>
          </div>
        </template>

        <label>{{ $t('connections.messageSequenceLoop') }}</label>
        <div class="loop-row">
          <el-checkbox
            v-model="sequence.loop"
            class="loop-toggle"
            :aria-label="$t('connections.messageSequenceLoop')"
            @change="emitChange"
          ></el-checkbox>
          <template v-if="sequence.loop && sequence.stopWhen">
            <span class="stop-cluster">
              <span class="delay-unit">{{ $t('connections.messageSequenceStopWhen') }}</span>
              <el-input
                v-model="sequence.stopWhen.variable"
                size="mini"
                class="stop-variable"
                placeholder="water"
                @input="emitChange"
              ></el-input>
              <el-select v-model="sequence.stopWhen.op" size="mini" class="stop-op" @change="emitChange">
                <el-option v-for="op in compareOps" :key="op.value" :label="op.label" :value="op.value"></el-option>
              </el-select>
              <el-input-number
                v-model="sequence.stopWhen.value"
                size="mini"
                class="stop-value"
                :controls="false"
                @change="emitChange"
              ></el-input-number>
            </span>
            <span v-if="!(sequence.stopWhen.variable || '').trim()" class="delay-unit">
              {{ $t('connections.messageSequenceStopEmpty') }}
            </span>
          </template>
        </div>
      </div>

      <div v-for="(step, stepIndex) in sequence.steps" :key="step.id" class="sequence-step">
        <div class="step-toolbar">
          <span class="step-index">{{ stepIndex + 1 }}</span>
          <el-input-number
            v-model="step.delayMs"
            size="mini"
            class="delay-input"
            :min="0"
            :controls="false"
            @change="emitChange"
          ></el-input-number>
          <span class="delay-unit">ms</span>
          <a
            v-for="quick in quickDelays"
            :key="quick.ms"
            href="javascript:;"
            :class="['quick-delay', { active: Number(step.delayMs) === quick.ms }]"
            @click="setDelay(step, quick.ms)"
          >
            {{ quick.label }}
          </a>
          <span class="step-flags">
            <el-checkbox v-model="step.retain" @change="emitChange">{{
              $t('connections.autoReplyRetain')
            }}</el-checkbox>
            <el-select v-model="step.qos" size="mini" class="qos-select" @change="emitChange">
              <el-option v-for="qos in qosList" :key="qos" :label="'QoS ' + qos" :value="qos"></el-option>
            </el-select>
          </span>
          <a href="javascript:;" class="sequence-delete" @click="removeStep(sequence, stepIndex)">
            <i class="el-icon-delete"></i>
          </a>
        </div>
        <div class="step-grid">
          <label>{{ $t('connections.messageSequenceTopic') }}</label>
          <div class="topic-preset-field">
            <el-input
              v-model="step.topic"
              size="mini"
              placeholder="device/${clientId}/water/post"
              @input="emitChange"
            ></el-input>
            <TopicPresetPicker @select="applyStepTopic(step, $event)" />
          </div>
          <label>{{ $t('connections.messageSequencePayload') }}</label>
          <div class="topic-preset-field is-area">
            <el-input
              v-model="step.payload"
              type="textarea"
              size="mini"
              class="payload-input"
              :autosize="{ minRows: 2, maxRows: 6 }"
              placeholder='{"remaining":${water}}'
              @input="emitChange"
            ></el-input>
            <PresetPicker
              :items="messagePresetOptions"
              :title="$t('configs.messagePresets')"
              :button-title="$t('configs.sequenceMessagePresetTip')"
              icon="el-icon-collection"
              placement="bottom-end"
              :empty-text="$t('configs.messagePresetsEmpty')"
              :search-placeholder="$t('configs.presetSearchPlaceholder')"
              manage-tab="message"
              @show="loadMessagePresets"
              @select="applyMessagePreset(step, $event)"
            />
          </div>
          <label class="with-help">
            {{ $t('connections.messageSequenceSet') }}
            <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
              <div slot="content" class="automation-tip">
                <p>{{ $t('connections.messageSequenceSetHint') }}</p>
              </div>
              <a href="javascript:;" class="field-help">
                <i class="el-icon-warning-outline"></i>
              </a>
            </el-tooltip>
          </label>
          <div class="set-variables">
            <div
              v-for="(item, setIndex) in (step.actions && step.actions.setVariables) || []"
              :key="setIndex"
              class="set-variable-row"
            >
              <el-select
                v-model="item.name"
                size="mini"
                filterable
                allow-create
                default-first-option
                class="set-variable-name"
                @change="emitChange"
              >
                <el-option v-for="name in variableNames" :key="name" :label="name" :value="name"></el-option>
              </el-select>
              <el-input v-model="item.value" size="mini" placeholder="${water - 20}" @input="emitChange"></el-input>
              <a href="javascript:;" class="sequence-delete" @click="removeSetVariable(step, setIndex)">
                <i class="el-icon-close"></i>
              </a>
            </div>
            <el-button type="text" class="sequence-add" @click="addSetVariable(step)">
              {{ $t('connections.messageSequenceSetAdd') }}
            </el-button>
          </div>
        </div>
      </div>

      <el-button type="text" icon="el-icon-plus" class="sequence-add" @click="addStep(sequence)">
        {{ $t('connections.messageSequenceStepAdd') }}
      </el-button>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Model, Prop, Vue, Watch } from 'vue-property-decorator'
import TopicPresetPicker from '@/components/TopicPresetPicker.vue'
import PresetPicker from '@/components/PresetPicker.vue'
import type { PresetOption } from '@/components/PresetPicker.vue'
import { isValidCondition } from '@/utils/jmesPathCondition'
import { cloneMessageSequence } from '@/utils/messageSequenceExamples'
import { getMessagePresets } from '@/utils/configProfiles'

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createStep = (): MessageSequenceStepModel => ({
  id: createId(),
  delayMs: 0,
  topic: '',
  payload: '',
  qos: 0,
  retain: false,
  actions: { setVariables: [] },
})

const createSequence = (): MessageSequenceModel => ({
  id: createId(),
  name: '',
  enabled: true,
  trigger: 'manual',
  matchTopic: '',
  matchCondition: '',
  loop: false,
  stopWhen: { variable: '', op: 'lt', value: 0 },
  steps: [createStep()],
})

/**
 * Editor for the message sequences of a connection or a client preset.
 *
 * A sequence is a list of publishes. The delay of a step is relative to the previous step.
 * Assignments are stored on the step and applied by the runner after that step is sent, so
 * this editor only records the template (`${water - 20}`), it does not evaluate it.
 */
@Component({ components: { TopicPresetPicker, PresetPicker } })
export default class MessageSequenceEditor extends Vue {
  @Model('change', { type: Array }) private readonly value!: MessageSequenceModel[] | null | undefined
  @Prop({ required: false, default: () => [] }) private readonly variableNames!: string[]
  /** Run and stop are offered while the connection is up. The form itself only edits the sequence. */
  @Prop({ required: false, default: false }) private readonly canRun!: boolean
  @Prop({ required: false, default: () => [] }) private readonly runningIds!: string[]
  /** Sequence templates from preset settings. Each button copies one onto this list. */
  @Prop({ required: false, default: () => [] }) private readonly templates!: MessageSequencePresetModel[]
  /** One sequence, named by the parent. Used by the preset dialog. */
  @Prop({ required: false, default: false }) private readonly singleton!: boolean

  private sequences: MessageSequenceModel[] = []
  private lastEmitted = ''
  private qosList: QoS[] = [0, 1, 2]
  private quickDelays: Array<{ ms: number; label: string }> = [
    { ms: 0, label: '0' },
    { ms: 1000, label: '1s' },
    { ms: 60000, label: '60s' },
    { ms: 300000, label: '5m' },
  ]
  private compareOps: Array<{ value: MessageSequenceCompare; label: string }> = [
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'eq', label: '=' },
  ]

  get tooltipEffect(): 'dark' | 'light' {
    const theme = (this as unknown as { $store?: { getters?: { currentTheme?: string } } }).$store?.getters
      ?.currentTheme
    return theme && theme !== 'light' ? 'light' : 'dark'
  }

  @Watch('value', { immediate: true })
  private handleValueChanged(value: MessageSequenceModel[] | null | undefined) {
    // The parent echoes the copy this editor just emitted. Rebuilding from it would drop a
    // sequence the user has started but not named yet.
    const incoming = JSON.stringify(value ?? [])
    if (incoming === this.lastEmitted || incoming === JSON.stringify(this.sequences ?? [])) {
      return
    }
    this.sequences = this.clone(value ?? [])
    this.lastEmitted = incoming
  }

  private clone(sequences: MessageSequenceModel[]): MessageSequenceModel[] {
    return JSON.parse(JSON.stringify(sequences ?? [])).map((sequence: MessageSequenceModel) => ({
      ...createSequence(),
      ...sequence,
      stopWhen: { variable: '', op: 'lt' as MessageSequenceCompare, value: 0, ...(sequence.stopWhen ?? {}) },
      steps: (sequence.steps?.length ? sequence.steps : [createStep()]).map((step) => ({
        ...createStep(),
        ...step,
        actions: {
          resetVariables: [...(step.actions?.resetVariables ?? [])],
          setVariables: (step.actions?.setVariables ?? []).map((item) => ({ ...item })),
        },
      })),
    }))
  }

  private isConditionInvalid(sequence: MessageSequenceModel): boolean {
    return !isValidCondition(sequence.matchCondition)
  }

  private isRunning(sequence: MessageSequenceModel): boolean {
    return (this.runningIds ?? []).includes(sequence.id)
  }

  private canStart(sequence: MessageSequenceModel): boolean {
    return sequence.enabled !== false && (sequence.steps ?? []).some((step) => (step.topic ?? '').trim() !== '')
  }

  private clean(sequence: MessageSequenceModel): MessageSequenceModel {
    const stop = sequence.stopWhen
    return {
      ...sequence,
      stopWhen: {
        variable: String(stop?.variable ?? '').trim(),
        op: stop?.op ?? 'lt',
        value: Number(stop?.value) || 0,
      },
      steps: (sequence.steps ?? []).map((step) => {
        const setVariables = (step.actions?.setVariables ?? [])
          .map((item) => ({ name: String(item?.name ?? '').trim(), value: item?.value ?? '' }))
          .filter((item) => item.name !== '')
        const resetVariables = (step.actions?.resetVariables ?? [])
          .map((name) => String(name ?? '').trim())
          .filter((name) => name !== '')
        const qos = Number(step.qos)
        const actions = setVariables.length || resetVariables.length ? { resetVariables, setVariables } : undefined
        return {
          ...step,
          delayMs: Math.max(0, Number(step.delayMs) || 0),
          qos: (qos === 1 || qos === 2 ? qos : 0) as QoS,
          retain: Boolean(step.retain),
          actions,
        }
      }),
    }
  }

  private applyMatchTopic(sequence: MessageSequenceModel, topic: string) {
    sequence.matchTopic = topic
    this.emitChange()
  }

  private applyStepTopic(step: MessageSequenceStepModel, topic: string) {
    step.topic = topic
    this.emitChange()
  }

  /** Message presets copied onto a step. Reloaded when a picker opens. */
  private messagePresets: MessagePresetModel[] = []

  /** One row per message preset. The topic is what tells two payloads apart. */
  get messagePresetOptions(): PresetOption[] {
    return this.messagePresets.map((preset) => ({ id: preset.id, name: preset.name, summary: preset.topic }))
  }

  private loadMessagePresets() {
    this.messagePresets = getMessagePresets()
  }

  /**
   * A message preset fills this step's topic and payload together. Delay, QoS, retain and the
   * assignments stay, and a later topic preset can still replace only the topic.
   */
  private applyMessagePreset(step: MessageSequenceStepModel, id: string) {
    const preset = this.messagePresets.find((item) => item.id === id)
    if (!preset) {
      return
    }
    step.topic = preset.topic
    step.payload = preset.payload
    this.emitChange()
  }

  private emitChange() {
    const cleaned = this.sequences.map((sequence) => this.clean(sequence))
    this.lastEmitted = JSON.stringify(cleaned)
    this.$emit('change', JSON.parse(this.lastEmitted) as MessageSequenceModel[])
  }

  private addSequence() {
    this.sequences.push(createSequence())
    this.emitChange()
  }

  private removeSequence(index: number) {
    this.sequences.splice(index, 1)
    this.emitChange()
  }

  private addStep(sequence: MessageSequenceModel) {
    sequence.steps.push(createStep())
    this.emitChange()
  }

  private removeStep(sequence: MessageSequenceModel, index: number) {
    sequence.steps.splice(index, 1)
    if (!sequence.steps.length) {
      sequence.steps.push(createStep())
    }
    this.emitChange()
  }

  private setDelay(step: MessageSequenceStepModel, delayMs: number) {
    step.delayMs = delayMs
    this.emitChange()
  }

  private addSetVariable(step: MessageSequenceStepModel) {
    if (!step.actions) {
      step.actions = { setVariables: [] }
    }
    if (!step.actions.setVariables) {
      step.actions.setVariables = []
    }
    step.actions.setVariables.push({ name: '', value: '' })
    this.emitChange()
  }

  private removeSetVariable(step: MessageSequenceStepModel, index: number) {
    step.actions?.setVariables?.splice(index, 1)
    this.emitChange()
  }

  private requestRun(sequence: MessageSequenceModel) {
    this.$emit('run', sequence.id)
  }

  private requestStop(sequence: MessageSequenceModel) {
    this.$emit('stop', sequence.id)
  }

  /**
   * One row per preset: name, plus what tells two similar sequences apart (trigger and step count).
   */
  get presetOptions(): PresetOption[] {
    return this.templates.map((preset) => {
      const sequence = preset.sequence
      const steps = sequence?.steps?.length ?? 0
      const trigger = this.triggerLabel(sequence?.trigger)
      const loop = sequence?.loop ? ` · ${this.$t('connections.messageSequenceLoop') as string}` : ''
      return {
        id: preset.id,
        name: preset.name || sequence?.name || preset.id,
        summary: `${trigger} · ${steps} ${this.$t('configs.stepsUnit') as string}${loop}`,
      }
    })
  }

  private triggerLabel(trigger?: MessageSequenceTrigger): string {
    if (trigger === 'connect') {
      return this.$t('connections.messageSequenceTriggerConnect') as string
    }
    if (trigger === 'message') {
      return this.$t('connections.messageSequenceTriggerMessage') as string
    }
    return this.$t('connections.messageSequenceTriggerManual') as string
  }

  /**
   * Copies a preset onto this list. The sequence gets new ids so a second insert does not
   * share a run with the first. Variables travel with the template; the parent adds any this
   * connection does not already have.
   */
  private insertTemplateById(id: string) {
    const preset = this.templates.find((item) => item.id === id)
    if (preset) {
      this.insertTemplate(preset)
    }
  }

  private insertTemplate(preset: MessageSequencePresetModel) {
    if (!preset?.sequence) {
      return
    }
    const created = cloneMessageSequence(preset.sequence)
    created.name = (preset.name || created.name || '').trim()
    this.sequences = this.clone([...this.sequences, created])
    this.emitChange()
    const variables = preset.variables ?? {}
    if (Object.keys(variables).length) {
      this.$emit('example', { variables: JSON.parse(JSON.stringify(variables)) })
    }
  }
}
</script>

<style lang="scss">
.message-sequence-editor {
  .editor-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 32px;
    margin-bottom: 8px;
  }

  .editor-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 32px;
    color: var(--color-text-default);
    cursor: help;
    line-height: 1;
    font-size: 15px;
    &:hover {
      color: var(--color-main-green);
    }
  }

  .sequence-add.el-button--text {
    height: 32px;
    padding: 0;
    font-size: 12px;
    line-height: 32px;
  }

  .sequence-card {
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px solid var(--color-border-default);
    border-radius: 4px;
    background: var(--color-bg-normal);
  }

  .sequence-header {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 28px;
    margin-bottom: 10px;
    .sequence-name {
      flex: 1;
      max-width: 260px;
    }
    .sequence-options {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
      flex: none;
      height: 28px;
    }
  }

  .sequence-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    color: var(--color-minor-red);
    line-height: 1;
  }

  .el-radio-group {
    display: flex;
    flex-wrap: wrap;
  }

  .el-radio-button--mini .el-radio-button__inner {
    width: auto;
    padding: 7px 12px;
    white-space: nowrap;
    font-size: 12px;
    line-height: 1.2;
  }

  .el-radio-button--mini .el-radio-button__orig-radio:checked + .el-radio-button__inner {
    border-color: var(--color-main-green);
    border-left: 1px solid var(--color-main-green);
  }

  .sequence-grid,
  .step-grid {
    display: grid;
    // Same 96px label column as 自动回复 and the variable definition, so the
    // inputs share one left edge down the connection form.
    grid-template-columns: 96px 1fr;
    gap: 8px 10px;
    align-items: start;
    label {
      min-width: 0;
      color: var(--color-text-default);
      line-height: 28px;
      overflow-wrap: anywhere;
    }
    .with-help {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      max-width: 100%;
    }
    .field-help {
      color: var(--color-text-default);
      cursor: help;
      font-size: 13px;
      line-height: 1;
      &:hover {
        color: var(--color-main-green);
      }
    }
  }

  .trigger-row,
  .loop-row,
  .step-toolbar,
  .set-variable-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 28px;
  }

  .trigger-row .sequence-options {
    margin-left: auto;
  }

  .stop-cluster {
    display: inline-flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 6px;
  }

  .sequence-card .loop-row span.delay-unit,
  .sequence-card .step-toolbar span.delay-unit {
    color: var(--color-text-light);
    line-height: 28px;
  }

  .sequence-card .stop-variable {
    width: 120px;
  }

  // `.el-form .el-select` and `.el-input-number--mini` are width 100% globally.
  .sequence-card .stop-op.el-select {
    width: 72px;
  }

  .sequence-card .stop-value.el-input-number--mini {
    width: 96px;
  }

  .sequence-step {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--color-border-default);
  }

  .step-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 11px;
    background: var(--color-light-green);
    color: var(--color-main-green);
    font-size: 12px;
    line-height: 1;
  }

  .sequence-card .delay-input.el-input-number--mini {
    width: 88px;
    flex: none;
    line-height: 26px;
    .el-input__inner {
      height: 28px;
      line-height: 28px;
      padding-left: 8px;
      padding-right: 8px;
    }
  }

  .quick-delay {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 6px;
    color: var(--color-main-green);
    border-radius: 3px;
    line-height: 1;
    &.active {
      color: var(--color-text-active);
      background: var(--color-main-green);
    }
  }

  .step-flags {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .sequence-card .qos-select.el-select {
    width: 88px;
  }

  .loop-toggle .el-checkbox__label {
    display: none;
  }

  .payload-input textarea {
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
  }

  .set-variables {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .set-variable-row {
    width: 100%;
    .set-variable-name.el-select {
      width: 140px;
      flex: none;
    }
    .el-input {
      flex: 1;
    }
  }

  .cell-error {
    margin: 2px 0 0;
    color: var(--color-minor-red);
    font-size: 12px;
  }

  .el-checkbox {
    display: inline-flex;
    align-items: center;
    height: 28px;
    margin-right: 0;
    font-size: 12px;
    font-weight: 400;
    color: var(--color-text-default);
    .el-checkbox__label {
      padding-left: 6px;
      font-size: 12px;
      font-weight: 400;
      line-height: 28px;
      color: var(--color-text-default);
    }
  }
}
</style>
