<template>
  <div class="connect-report-editor">
    <div class="editor-head">
      <el-button type="text" icon="el-icon-plus" class="report-add" @click="addReport">
        {{ $t('connections.connectReportAdd') }}
      </el-button>
      <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
        <div slot="content" class="automation-tip">
          <p>{{ $t('connections.connectReportsHint') }}</p>
        </div>
        <a href="javascript:;" class="editor-help">
          <i class="el-icon-warning-outline"></i>
        </a>
      </el-tooltip>
    </div>
    <div v-for="(report, index) in reports" :key="report.id" class="connect-report-row">
      <div class="connect-report-delay">
        <span class="field-label">{{ $t('connections.autoSubscribeDelay') }}</span>
        <el-input-number
          v-model="report.delay"
          size="mini"
          :min="0"
          :step="1"
          :controls="false"
          class="delay-input"
          @change="setDelay(report, $event)"
        ></el-input-number>
        <span class="field-unit">s</span>
      </div>
      <div class="connect-report-topic">
        <el-input v-model="report.topic" size="mini" :placeholder="topicPlaceholder" @input="emitChange"></el-input>
        <TopicPresetPicker @select="applyTopic(report, $event)" />
      </div>
      <div class="connect-report-payload topic-preset-field is-area">
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
      <a href="javascript:;" class="connect-report-delete" @click="removeReport(index)">
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
import { connectReportDelaySeconds } from '@/utils/connectReports'

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createReport = (): ConnectReportModel => ({
  id: createId(),
  delay: 0,
  topic: '',
  payload: '',
  qos: 0,
  retain: false,
  payloadType: 'JSON',
  enabled: true,
})

/**
 * Editor for reports sent once after the connection succeeds.
 *
 * Each row has its own delay. A message preset fills the topic and the payload; a topic preset
 * replaces only the topic. Sending happens on the connect path.
 */
@Component({ components: { TopicPresetPicker, PresetPicker } })
export default class ConnectReportEditor extends Vue {
  @Model('change', { type: Array }) private readonly value!: ConnectReportModel[] | null | undefined

  private reports: ConnectReportModel[] = []
  private lastEmitted = ''
  private messagePresets: MessagePresetModel[] = []

  get topicPlaceholder(): string {
    return this.$t('connections.autoSubscribeTopicPlaceholder') as string
  }

  get tooltipEffect(): 'dark' | 'light' {
    const theme = (this as unknown as { $store?: { getters?: { currentTheme?: string } } }).$store?.getters
      ?.currentTheme
    return theme && theme !== 'light' ? 'light' : 'dark'
  }

  @Watch('value', { immediate: true })
  private onValueChange(value: ConnectReportModel[] | null | undefined) {
    const next = JSON.stringify(value ?? [])
    if (next === this.lastEmitted) {
      return
    }
    const parsed = JSON.parse(next) as ConnectReportModel[]
    // A cleared number input stores nothing. Show that as 0, which sends as soon as the
    // connection succeeds, instead of leaving a blank that would be skipped.
    this.reports = parsed.map((report) => ({
      ...report,
      delay: connectReportDelaySeconds(report.delay) ?? 0,
    }))
  }

  private emitChange() {
    this.reports.forEach((report) => {
      report.delay = connectReportDelaySeconds(report.delay) ?? 0
    })
    const copy = JSON.parse(JSON.stringify(this.reports)) as ConnectReportModel[]
    this.lastEmitted = JSON.stringify(copy)
    this.$emit('change', copy)
  }

  /** An empty delay box means "send immediately", so the stored value stays 0. */
  private setDelay(report: ConnectReportModel, value: number | null | undefined) {
    report.delay = connectReportDelaySeconds(value) ?? 0
    this.emitChange()
  }

  private addReport() {
    this.reports.push(createReport())
    this.emitChange()
  }

  private removeReport(index: number) {
    this.reports.splice(index, 1)
    this.emitChange()
  }

  private applyTopic(report: ConnectReportModel, topic: string) {
    report.topic = topic
    this.emitChange()
  }

  get messagePresetOptions(): PresetOption[] {
    return this.messagePresets.map((preset) => ({ id: preset.id, name: preset.name, summary: preset.topic }))
  }

  private loadMessagePresets() {
    this.messagePresets = getMessagePresets()
  }

  private applyMessagePreset(report: ConnectReportModel, id: string) {
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
.connect-report-editor {
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

  .connect-report-row {
    display: grid;
    grid-template-columns: 160px 1fr 28px;
    grid-template-areas:
      'delay topic delete'
      'payload payload payload';
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
  }
  .connect-report-delay {
    grid-area: delay;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .connect-report-topic {
    grid-area: topic;
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    .el-input {
      flex: 1;
    }
  }
  .connect-report-payload {
    grid-area: payload;
  }
  .connect-report-delete {
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
  .delay-input {
    width: 72px;
  }
}
</style>
