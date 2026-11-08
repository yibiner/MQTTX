<template>
  <div class="connect-report-editor">
    <div v-for="(report, index) in reports" :key="report.id" class="report-card">
      <div class="report-header">
        <el-switch v-model="report.enabled" @change="emitChange" />
        <span class="report-title">{{ $t('connections.connectReportItem') }} {{ index + 1 }}</span>

        <span class="report-field">
          <span class="field-label">{{ $t('connections.connectReportDelay') }}</span>
          <el-input
            class="field-input"
            size="mini"
            type="number"
            :min="0"
            v-model.number="report.delay"
            @change="normalizeDelay(report)"
          />
          <span class="field-unit">s</span>
        </span>

        <span class="report-field">
          <el-select class="qos-select" size="mini" v-model.number="report.qos" @change="emitChange">
            <el-option :label="'QoS 0'" :value="0" />
            <el-option :label="'QoS 1'" :value="1" />
            <el-option :label="'QoS 2'" :value="2" />
          </el-select>
        </span>

        <span class="report-field">
          <el-checkbox v-model="report.retain" @change="emitChange">{{ $t('connections.connectReportRetain') }}</el-checkbox>
        </span>

        <a class="report-remove" href="javascript:;" @click.prevent="removeReport(index)">
          <i class="el-icon-delete"></i>
        </a>
      </div>

      <el-input
        class="report-input"
        size="mini"
        :placeholder="$t('connections.connectReportTopicPlaceholder')"
        v-model="report.topic"
        @change="emitChange"
      />
      <el-input
        class="report-input payload"
        size="mini"
        type="textarea"
        :rows="2"
        :placeholder="$t('connections.connectReportPayloadPlaceholder')"
        v-model="report.payload"
        @change="emitChange"
      />
    </div>

    <div class="editor-actions">
      <a class="add-report" href="javascript:;" @click.prevent="addReport">
        <i class="el-icon-plus"></i>
        <span>{{ $t('connections.connectReportAdd') }}</span>
      </a>
      <HintIcon :text="$t('connections.connectReportHint')" />
    </div>

  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import { v4 as uuidv4 } from 'uuid'
import { connectReportDelaySeconds } from '@/utils/connectReports'
import HintIcon from '@/components/HintIcon.vue'

/**
 * Editor for the one-shot publishes sent after connecting ("连接后上报").
 *
 * The typical use is device simulation: connect, then report once that the device is online. Every
 * row can wait a moment of its own, which is how an OTA report can follow the online report.
 *
 * The list is passed in and a cleaned copy is passed back, so the same editor can later be reused
 * from a preset or a behaviour template.
 */
@Component({
  components: { HintIcon },
})
export default class ConnectReportEditor extends Vue {
  @Prop({ default: () => [] }) private value!: ConnectReportModel[]

  private reports: ConnectReportModel[] = []

  /** Keeps a row that has no topic yet when the parent writes the cleaned list back. */
  private echoToken = 0

  private pendingEcho = -1

  @Watch('value', { immediate: true })
  private syncFromParent(val: ConnectReportModel[]) {
    const incoming = (val ?? []).map((report) => ({ ...report }))
    const isEcho = this.pendingEcho === this.echoToken && this.echoToken !== 0
    this.pendingEcho = -1
    if (!isEcho) {
      this.reports = incoming
      return
    }
    const incomingIds = new Set(incoming.map((report) => report.id))
    const drafts = this.reports.filter(
      (report) => (report.topic ?? '').trim() === '' && !incomingIds.has(report.id),
    )
    this.reports = [...incoming, ...drafts]
  }

  private createReport(): ConnectReportModel {
    return {
      id: uuidv4(),
      enabled: true,
      delay: 0,
      topic: '',
      payload: '',
      qos: 0,
      retain: false,
    } as ConnectReportModel
  }

  private addReport() {
    this.reports.push(this.createReport())
    this.emitChange()
  }

  private removeReport(index: number) {
    this.reports.splice(index, 1)
    this.emitChange()
  }

  /** A negative delay is refused by the runner, so the editor never stores one. */
  private normalizeDelay(report: ConnectReportModel) {
    report.delay = connectReportDelaySeconds(report.delay) ?? 0
    this.emitChange()
  }

  private emitChange() {
    // A row without a topic is still being typed: keep it in the editor, drop it from what is saved.
    const cleaned = this.reports
      .filter((report) => (report.topic ?? '').trim() !== '')
      .map((report) => ({
        ...report,
        delay: connectReportDelaySeconds(report.delay) ?? 0,
        payload: report.payload ?? '',
      }))
    this.pendingEcho = ++this.echoToken
    this.$emit('input', cleaned)
  }
}
</script>

<style scoped>
.editor-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.connect-report-editor {
  font-size: 13px;
}

.report-card {
  border: 1px solid var(--color-border-default, #dcdfe6);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.report-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 6px;
}

.report-title {
  font-weight: 600;
}

.report-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.field-label,
.field-unit {
  color: #909399;
  font-size: 12px;
}

.field-input {
  width: 80px;
}

.qos-select {
  width: 90px;
}

.report-remove {
  color: #909399;
  margin-left: auto;
}

.report-input {
  margin-bottom: 4px;
}

.add-report {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-size: 12px;
}

</style>
