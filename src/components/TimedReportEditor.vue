<template>
  <div class="timed-report-editor">
    <div class="editor-head">
      <el-button type="text" icon="el-icon-plus" class="report-add" @click="addReport">
        {{ $t('connections.timedReportAdd') }}
      </el-button>
      <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
        <div slot="content" class="automation-tip">
          <p>{{ $t('connections.timedReportsHint') }}</p>
        </div>
        <a href="javascript:;" class="editor-help">
          <i class="el-icon-warning-outline"></i>
        </a>
      </el-tooltip>
    </div>
    <div v-for="(report, index) in reports" :key="report.id" class="timed-report-row">
      <div class="timed-report-interval">
        <span class="field-label">{{ $t('connections.timedReportInterval') }}</span>
        <el-input-number
          v-model="report.interval"
          size="mini"
          :min="1"
          :step="1"
          :controls="false"
          class="interval-input"
          @change="emitChange"
        ></el-input-number>
        <span class="field-unit">s</span>
      </div>
      <div class="timed-report-topic">
        <el-input v-model="report.topic" size="mini" :placeholder="topicPlaceholder" @input="emitChange"></el-input>
        <TopicPresetPicker @select="applyTopic(report, $event)" />
      </div>
      <div class="timed-report-payload topic-preset-field is-area">
        <el-input
          v-model="report.payload"
          type="textarea"
          :rows="2"
          size="mini"
          :placeholder="$t('connections.timedReportPayload')"
          @input="emitChange"
        ></el-input>
        <PresetPicker
          :items="messagePresetOptions"
          :title="$t('configs.messagePresets')"
          :button-title="$t('connections.timedReportMessagePresetTip')"
          icon="el-icon-collection"
          placement="bottom-end"
          :empty-text="$t('configs.messagePresetsEmpty')"
          :search-placeholder="$t('configs.presetSearchPlaceholder')"
          manage-tab="message"
          @show="loadMessagePresets"
          @select="applyMessagePreset(report, $event)"
        />
      </div>
      <a href="javascript:;" class="timed-report-delete" @click="removeReport(index)">
        <i class="el-icon-delete"></i>
      </a>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Model, Vue, Watch } from 'vue-property-decorator'
import TopicPresetPicker from '@/components/TopicPresetPicker.vue'
import PresetPicker from '@/components/PresetPicker.vue'
import type { PresetOption } from '@/components/PresetPicker.vue'
import { getMessagePresets } from '@/utils/configProfiles'

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createReport = (): TimedReportModel => ({
  id: createId(),
  interval: 30,
  topic: '',
  payload: '',
  qos: 0,
  retain: false,
  payloadType: 'JSON',
  enabled: true,
})

/**
 * Editor for timed reports: a publish that starts after the connection succeeds.
 *
 * The rows are the configuration. Starting them is the existing timed-message runner, called
 * from the connect path. An empty topic is kept while the user is still typing.
 */
@Component({ components: { TopicPresetPicker, PresetPicker } })
export default class TimedReportEditor extends Vue {
  @Model('change', { type: Array }) private readonly value!: TimedReportModel[] | null | undefined

  private reports: TimedReportModel[] = []
  private lastEmitted = ''
  /** Message presets copied onto a report. Reloaded when the picker opens. */
  private messagePresets: MessagePresetModel[] = []

  get topicPlaceholder(): string {
    return this.$t('connections.autoSubscribeTopicPlaceholder') as string
  }

  /** Same light/dark choice as the other hints of the app (the tooltip must stay readable). */
  get tooltipEffect(): 'dark' | 'light' {
    const theme = (this as unknown as { $store?: { getters?: { currentTheme?: string } } }).$store?.getters
      ?.currentTheme
    return theme && theme !== 'light' ? 'light' : 'dark'
  }

  @Watch('value', { immediate: true })
  private onValueChange(value: TimedReportModel[] | null | undefined) {
    const next = JSON.stringify(value ?? [])
    if (next === this.lastEmitted) {
      return
    }
    this.reports = JSON.parse(next) as TimedReportModel[]
  }

  private emitChange() {
    const copy = JSON.parse(JSON.stringify(this.reports)) as TimedReportModel[]
    this.lastEmitted = JSON.stringify(copy)
    this.$emit('change', copy)
  }

  private addReport() {
    this.reports.push(createReport())
    this.emitChange()
  }

  private removeReport(index: number) {
    this.reports.splice(index, 1)
    this.emitChange()
  }

  private applyTopic(report: TimedReportModel, topic: string) {
    report.topic = topic
    this.emitChange()
  }

  /** One row per message preset. The topic is what tells two payloads apart. */
  get messagePresetOptions(): PresetOption[] {
    return this.messagePresets.map((preset) => ({ id: preset.id, name: preset.name, summary: preset.topic }))
  }

  private loadMessagePresets() {
    this.messagePresets = getMessagePresets()
  }

  /**
   * A message preset fills this report's topic and payload together. The interval stays, and a
   * later topic preset can still replace only the topic.
   */
  private applyMessagePreset(report: TimedReportModel, id: string) {
    const preset = this.messagePresets.find((item) => item.id === id)
    if (!preset) {
      return
    }
    report.topic = preset.topic
    report.payload = preset.payload
    this.emitChange()
  }
}
</script>

<style lang="scss">
.timed-report-editor {
  font-size: 12px;

  .editor-head {
    display: flex;
    align-items: center;
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

  .report-add.el-button--text {
    height: 32px;
    padding: 0;
    font-size: 12px;
    line-height: 32px;
  }

  .timed-report-row {
    display: grid;
    grid-template-columns: 160px 1fr 28px;
    grid-template-areas:
      'interval topic delete'
      'payload payload payload';
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
  }
  .timed-report-interval {
    grid-area: interval;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .timed-report-topic {
    grid-area: topic;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    .el-input {
      flex: 1;
    }
  }
  .timed-report-payload {
    grid-area: payload;
  }
  .timed-report-delete {
    grid-area: delete;
    color: var(--color-minor-red);
    text-align: center;
  }
  .field-label,
  .field-unit {
    color: var(--color-text-default);
    font-size: 12px;
    flex: none;
  }
  .interval-input {
    width: 72px;
  }
}
</style>
