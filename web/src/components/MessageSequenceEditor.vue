<template>
  <div class="sequence-editor">
    <div v-for="(sequence, index) in sequences" :key="sequence.id" class="sequence-card">
      <div class="sequence-header">
        <el-switch v-model="sequence.enabled" @change="emitChange" />
        <el-input
          class="name-input"
          size="mini"
          :placeholder="$t('connections.sequenceNamePlaceholder')"
          v-model="sequence.name"
          @change="emitChange"
        />
        <el-select class="trigger-select" size="mini" v-model="sequence.trigger" @change="emitChange">
          <el-option :label="$t('connections.sequenceTriggerManual')" value="manual" />
          <el-option :label="$t('connections.sequenceTriggerConnect')" value="connect" />
          <el-option :label="$t('connections.sequenceTriggerMessage')" value="message" />
        </el-select>
        <el-checkbox v-model="sequence.loop" @change="emitChange">{{ $t('connections.sequenceLoop') }}</el-checkbox>
        <template v-if="sequence.loop && sequence.stopWhen">
          <span class="field-label">{{ $t('connections.sequenceStopWhen') }}</span>
          <el-input
            v-model="sequence.stopWhen.variable"
            class="stop-variable"
            size="mini"
            placeholder="water"
            @change="emitChange"
          />
          <el-select v-model="sequence.stopWhen.op" class="stop-op" size="mini" @change="emitChange">
            <el-option v-for="op in compareOps" :key="op.value" :label="op.label" :value="op.value" />
          </el-select>
          <el-input
            v-model.number="sequence.stopWhen.value"
            class="stop-value"
            size="mini"
            type="number"
            @change="emitChange"
          />
          <span v-if="!(sequence.stopWhen.variable || '').trim()" class="field-label">
            {{ $t('connections.sequenceStopEmpty') }}
          </span>
        </template>
        <a class="remove" href="javascript:;" @click.prevent="removeSequence(index)">
          <i class="el-icon-delete"></i>
        </a>
      </div>

      <div v-if="sequence.trigger === 'message'" class="trigger-line">
        <span class="field-label">{{ $t('connections.sequenceMatchTopic') }}</span>
        <div class="topic-preset-field grow">
          <el-input
            size="mini"
            :placeholder="$t('connections.autoReplyMatchTopicPlaceholder')"
            v-model="sequence.matchTopic"
            @change="emitChange"
          />
          <TopicPresetPicker @select="applyMatchTopic(sequence, $event)" />
        </div>
        <span class="field-label">{{ $t('connections.sequenceMatchCondition') }}</span>
        <el-input
          class="grow"
          size="mini"
          :placeholder="$t('connections.autoReplyMatchConditionPlaceholder')"
          v-model="sequence.matchCondition"
          @change="emitChange"
        />
      </div>

      <div v-for="(step, stepIndex) in sequence.steps" :key="step.id" class="step-card">
        <div class="step-row">
          <span class="step-index">{{ stepIndex + 1 }}</span>
          <span class="field-pair">
            <el-input
              class="num-input"
              size="mini"
              type="number"
              :min="0"
              v-model.number="step.delayMs"
              @change="emitChange"
            />
            <span class="field-unit">ms</span>
          </span>
          <el-select class="qos-select" size="mini" v-model.number="step.qos" @change="emitChange">
            <el-option :label="'QoS 0'" :value="0" />
            <el-option :label="'QoS 1'" :value="1" />
            <el-option :label="'QoS 2'" :value="2" />
          </el-select>
          <el-checkbox v-model="step.retain" @change="emitChange">{{ $t('connections.sequenceRetain') }}</el-checkbox>
          <a class="step-remove" href="javascript:;" @click.prevent="removeStep(sequence, stepIndex)">
            <i class="el-icon-close"></i>
          </a>
        </div>
        <div class="topic-preset-field">
          <el-input
            size="mini"
            :placeholder="$t('connections.placeholderTopic')"
            v-model="step.topic"
            @change="emitChange"
          />
          <TopicPresetPicker @select="applyStepTopic(step, $event)" />
        </div>
        <div class="topic-preset-field is-area">
          <el-input
            size="mini"
            :placeholder="$t('connections.placeholderPayload')"
            v-model="step.payload"
            @change="emitChange"
          />
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
        <div class="set-variables">
          <span class="field-label">
            {{ $t('connections.sequenceSet') }}
            <HintIcon :text="$t('connections.sequenceSetHint')" />
          </span>
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
              <el-option v-for="name in variableNames" :key="name" :label="name" :value="name" />
            </el-select>
            <el-input v-model="item.value" size="mini" placeholder="${water - 20}" @change="emitChange" />
            <a class="step-remove" href="javascript:;" @click.prevent="removeSetVariable(step, setIndex)">
              <i class="el-icon-close"></i>
            </a>
          </div>
          <a class="add-step" href="javascript:;" @click.prevent="addSetVariable(step)">
            <i class="el-icon-plus"></i>
            <span>{{ $t('connections.sequenceSetAdd') }}</span>
          </a>
        </div>
      </div>

      <a class="add-step" href="javascript:;" @click.prevent="addStep(sequence)">
        <i class="el-icon-plus"></i>
        <span>{{ $t('connections.sequenceAddStep') }}</span>
      </a>
    </div>

    <div class="sequence-actions">
      <a v-if="!single || !sequences.length" class="add-sequence" href="javascript:;" @click.prevent="addSequence">
        <i class="el-icon-plus"></i>
        <span>{{ $t('connections.sequenceAdd') }}</span>
      </a>
      <PresetPicker
        v-if="allowPreset"
        :items="presetOptions"
        :title="$t('connections.sequenceTitle')"
        :label="$t('connections.presetLoad')"
        :empty-text="$t('configs.messageSequencePresetsEmpty')"
        :search-placeholder="$t('configs.presetSearchPlaceholder')"
        manage-tab="sequence"
        @show="loadPresets"
        @select="loadPreset"
      />
      <HintIcon :text="$t('connections.sequenceHint')" />
    </div>

  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import { v4 as uuidv4 } from 'uuid'
import { ensureMessageSequencePresets, getMessagePresets } from '@/utils/configProfiles'
import { cloneMessageSequence } from '@/utils/messageSequenceExamples'
import HintIcon from '@/components/HintIcon.vue'
import TopicPresetPicker from '@/components/TopicPresetPicker.vue'
import PresetPicker from '@/components/PresetPicker.vue'
import type { PresetOption } from '@/components/PresetPicker.vue'

/**
 * Editor for the message sequences of a connection ("消息序列").
 *
 * A sequence sends its steps one after another, each after its own delay, which is how a device
 * boot or an OTA handshake is replayed. `trigger` decides when it runs: on connect, when a matching
 * message arrives, or only when the user starts it.
 */
@Component({
  components: { HintIcon, TopicPresetPicker, PresetPicker },
})
export default class MessageSequenceEditor extends Vue {
  @Prop({ default: () => [] }) private value!: MessageSequenceModel[]

  /** Names already defined on this connection, offered when assigning a variable after a step. */
  @Prop({ default: () => [] }) private variableNames!: string[]

  /**
   * Whether "load from preset" is offered. A caller that stores a single sequence (the preset
   * editor) turns it off: loading a second one there would be dropped on save without a word.
   */
  @Prop({ default: true }) private allowPreset!: boolean

  /**
   * A sequence preset stores one sequence. The add button stays available only while the list is
   * empty, so a second sequence cannot be created and then dropped on save.
   */
  @Prop({ type: Boolean, default: false }) private single!: boolean

  private sequences: MessageSequenceModel[] = []

  /** Sequence presets ("消息序列预设") the user can load into this connection. */
  private presets: MessageSequencePresetModel[] = []

  /** Message presets copied onto a step. Reloaded when that picker opens. */
  private messagePresets: MessagePresetModel[] = []

  private compareOps: Array<{ value: MessageSequenceCompare; label: string }> = [
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'eq', label: '=' },
  ]

  /**
   * Distinguishes the list we just emitted from a list the parent loaded. The emitted list omits
   * sequences and steps that are still being typed, and the parent writes that list straight back;
   * without this the watch would delete the row the user just added.
   */
  private echoToken = 0

  private pendingEcho = -1

  @Watch('value', { immediate: true })
  private syncFromParent(val: MessageSequenceModel[]) {
    const incoming = (val ?? []).map((sequence) => this.withEditorState(sequence))
    const isEcho = this.pendingEcho === this.echoToken && this.echoToken !== 0
    this.pendingEcho = -1
    if (!isEcho) {
      this.sequences = incoming
      return
    }
    const incomingIds = new Set(incoming.map((sequence) => sequence.id))
    const merged = incoming.map((sequence) => {
      const local = this.sequences.find((item) => item.id === sequence.id)
      const incomingStepIds = new Set(sequence.steps.map((step) => step.id))
      const steps = sequence.steps.map((step) => {
        const localStep = local?.steps?.find((item) => item.id === step.id)
        const drafts = (localStep?.actions?.setVariables ?? []).filter((item) => String(item?.name ?? '').trim() === '')
        if (!drafts.length) {
          return step
        }
        return {
          ...step,
          actions: {
            resetVariables: step.actions?.resetVariables ?? [],
            setVariables: [...(step.actions?.setVariables ?? []), ...drafts],
          },
        }
      })
      const draftSteps = (local?.steps ?? []).filter(
        (step) => String(step.topic ?? '').trim() === '' && !incomingStepIds.has(step.id),
      )
      return { ...sequence, steps: [...steps, ...draftSteps] }
    })
    const drafts = this.sequences
      .filter((sequence) => !incomingIds.has(sequence.id))
      .map((sequence) => this.withEditorState(sequence))
    this.sequences = [...merged, ...drafts]
  }

  /**
   * Gives every sequence a stop condition object and every step an actions object, so the inputs
   * bind to properties Vue 2 already observes.
   */
  private withEditorState(sequence: MessageSequenceModel): MessageSequenceModel {
    const stop = sequence.stopWhen
    return {
      ...sequence,
      stopWhen: {
        variable: stop?.variable ?? '',
        op: stop?.op ?? 'lt',
        value: Number(stop?.value) || 0,
      },
      steps: (sequence.steps ?? []).map((step) => ({
        ...step,
        actions: {
          resetVariables: [...(step.actions?.resetVariables ?? [])],
          setVariables: (step.actions?.setVariables ?? []).map((item) => ({ ...item })),
        },
      })),
    }
  }

  private loadPresets() {
    this.presets = ensureMessageSequencePresets()
  }

  private loadMessagePresets() {
    this.messagePresets = getMessagePresets()
  }

  get messagePresetOptions(): PresetOption[] {
    return this.messagePresets.map((preset) => ({ id: preset.id, name: preset.name, summary: preset.topic }))
  }

  get presetOptions(): PresetOption[] {
    return this.presets.map((preset) => {
      const sequence = preset.sequence
      const steps = sequence?.steps?.length ?? 0
      return {
        id: preset.id,
        name: preset.name || sequence?.name || preset.id,
        summary: `${steps}`,
      }
    })
  }

  /**
   * Appends a copy of a preset, with new ids so it is independent of the stored preset.
   * Variables travel with the template; the parent adds any this connection does not already have.
   */
  private loadPreset(presetId: string) {
    if (!presetId || (this.single && this.sequences.length >= 1)) {
      return
    }
    this.loadPresets()
    const preset = this.presets.find((item) => item.id === presetId)
    if (!preset?.sequence) {
      return
    }
    const created = cloneMessageSequence(preset.sequence)
    created.name = (preset.name || created.name || '').trim()
    this.sequences.push(this.withEditorState(created))
    this.emitChange()
    const variables = preset.variables ?? {}
    if (Object.keys(variables).length) {
      this.$emit('example', { variables: JSON.parse(JSON.stringify(variables)) })
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

  /** A message preset fills this step's topic and payload. Delay, QoS, retain and assignments stay. */
  private applyMessagePreset(step: MessageSequenceStepModel, id: string) {
    const preset = this.messagePresets.find((item) => item.id === id)
    if (!preset) {
      return
    }
    step.topic = preset.topic
    step.payload = preset.payload
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

  private created() {
    this.loadPresets()
  }

  private createStep(): MessageSequenceStepModel {
    return {
      id: uuidv4(),
      delayMs: 0,
      topic: '',
      payload: '',
      qos: 0,
      retain: false,
      actions: { setVariables: [] },
    } as MessageSequenceStepModel
  }

  private createSequence(): MessageSequenceModel {
    return {
      id: uuidv4(),
      name: '',
      enabled: true,
      trigger: 'manual',
      matchTopic: '',
      matchCondition: '',
      loop: false,
      stopWhen: { variable: '', op: 'lt', value: 0 },
      steps: [this.createStep()],
    } as MessageSequenceModel
  }

  private addSequence() {
    if (this.single && this.sequences.length >= 1) {
      return
    }
    this.sequences.push(this.createSequence())
    this.emitChange()
  }

  private removeSequence(index: number) {
    this.sequences.splice(index, 1)
    this.emitChange()
  }

  private addStep(sequence: MessageSequenceModel) {
    sequence.steps.push(this.createStep())
    this.emitChange()
  }

  private removeStep(sequence: MessageSequenceModel, index: number) {
    sequence.steps.splice(index, 1)
    this.emitChange()
  }

  private emitChange() {
    // A step without a topic cannot be sent, so it is kept in the editor while being typed but left
    // out of what is saved - the runner would otherwise stop the whole sequence on it.
    const cleaned = this.sequences
      .filter((sequence) => (sequence.name ?? '').trim() !== '' || (sequence.steps ?? []).some((step) => (step.topic ?? '').trim() !== ''))
      .map((sequence) => ({
        ...sequence,
        steps: (sequence.steps ?? [])
          .filter((step) => (step.topic ?? '').trim() !== '')
          .map((step) => {
            const setVariables = (step.actions?.setVariables ?? [])
              .map((item) => ({ name: String(item?.name ?? '').trim(), value: item?.value ?? '' }))
              .filter((item) => item.name !== '')
            const resetVariables = (step.actions?.resetVariables ?? [])
              .map((name) => String(name ?? '').trim())
              .filter((name) => name !== '')
            const actions = setVariables.length || resetVariables.length ? { resetVariables, setVariables } : undefined
            return {
              ...step,
              delayMs: Number.isFinite(step.delayMs) ? Math.max(0, Number(step.delayMs)) : 0,
              payload: step.payload ?? '',
              actions,
            }
          }),
      }))
      .filter((sequence) => sequence.steps.length > 0)
    this.pendingEcho = ++this.echoToken
    this.$emit('input', cleaned)
  }
}
</script>

<style scoped>
.sequence-editor {
  font-size: 13px;
}

.sequence-card {
  border: 1px solid var(--color-border-default, #dcdfe6);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.sequence-header,
.trigger-line,
.step-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 5px;
}

.name-input {
  width: 150px;
}

.trigger-select {
  width: 120px;
}

.remove,
.step-remove {
  color: #909399;
  margin-left: auto;
}

.field-label {
  color: #909399;
  font-size: 12px;
}

.grow {
  flex: 1;
  min-width: 120px;
}

.step-index {
  width: 18px;
  color: #909399;
  font-size: 12px;
  text-align: right;
}

.topic-input {
  flex: 1;
  min-width: 140px;
}

.payload-input {
  flex: 1.2;
  min-width: 140px;
}

.qos-select {
  width: 86px;
}

.num-input {
  width: 70px;
}

.field-pair {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.field-unit {
  color: #909399;
  font-size: 12px;
}

.add-step,
.add-sequence {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-size: 12px;
}

.sequence-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.step-card {
  border-top: 1px dashed var(--color-border-default, #e4e7ed);
  margin-top: 6px;
  padding-top: 6px;
}

.stop-variable,
.set-variable-name {
  width: 120px;
}

.stop-op {
  width: 64px;
}

.stop-value {
  width: 80px;
}

.set-variables {
  margin-top: 4px;
}

.set-variable-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
}

</style>
