<template>
  <div class="timed-report-editor">
    <div v-for="(report, index) in reports" :key="report.id" class="report-row">
      <el-switch v-model="report.enabled" @change="emitChange" />

      <span class="field-pair">
        <span class="field-label">{{ $t('connections.timedReportInterval') }}</span>
        <el-input
          class="num-input"
          size="mini"
          type="number"
          :min="1"
          v-model.number="report.interval"
          @change="normalizeInterval(report)"
        />
        <span class="field-unit">s</span>
      </span>

      <el-input class="topic-input" size="mini" :placeholder="$t('connections.placeholderTopic')" v-model="report.topic" @change="emitChange" />
      <el-input
        class="payload-input"
        size="mini"
        :placeholder="$t('connections.placeholderPayload')"
        v-model="report.payload"
        @change="emitChange"
      />

      <el-select class="qos-select" size="mini" v-model.number="report.qos" @change="emitChange">
        <el-option :label="'QoS 0'" :value="0" />
        <el-option :label="'QoS 1'" :value="1" />
        <el-option :label="'QoS 2'" :value="2" />
      </el-select>
      <el-checkbox v-model="report.retain" @change="emitChange">{{ $t('connections.timedReportRetain') }}</el-checkbox>

      <a class="row-remove" href="javascript:;" @click.prevent="removeReport(index)">
        <i class="el-icon-delete"></i>
      </a>
    </div>

    <div class="editor-actions">
      <a class="add-row" href="javascript:;" @click.prevent="addReport">
        <i class="el-icon-plus"></i>
        <span>{{ $t('connections.timedReportAdd') }}</span>
      </a>
      <HintIcon :text="$t('connections.timedReportHint')" />
    </div>

  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import { v4 as uuidv4 } from 'uuid'
import HintIcon from '@/components/HintIcon.vue'

/**
 * Editor for the timed messages of a connection ("定时消息").
 *
 * The interval is clamped to at least one second here, because the runner (like the desktop one)
 * treats anything shorter as "do not start" - a row the user can create but that silently never
 * runs would be worse than a row they cannot create.
 */
@Component({
  components: { HintIcon },
})
export default class TimedReportEditor extends Vue {
  @Prop({ default: () => [] }) private value!: TimedReportModel[]

  private reports: TimedReportModel[] = []

  /** Keeps a row that has no topic yet when the parent writes the cleaned list back. */
  private echoToken = 0

  private pendingEcho = -1

  @Watch('value', { immediate: true })
  private syncFromParent(val: TimedReportModel[]) {
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

  private createReport(): TimedReportModel {
    return {
      id: uuidv4(),
      enabled: true,
      interval: 5,
      topic: '',
      payload: '',
      qos: 0,
      retain: false,
    } as TimedReportModel
  }

  private addReport() {
    this.reports.push(this.createReport())
    this.emitChange()
  }

  private removeReport(index: number) {
    this.reports.splice(index, 1)
    this.emitChange()
  }

  private normalizeInterval(report: TimedReportModel) {
    const value = Number(report.interval)
    report.interval = Number.isFinite(value) && value >= 1 ? value : 1
    this.emitChange()
  }

  private emitChange() {
    const cleaned = this.reports
      .filter((report) => (report.topic ?? '').trim() !== '')
      .map((report) => {
        const value = Number(report.interval)
        return {
          ...report,
          interval: Number.isFinite(value) && value >= 1 ? value : 1,
          payload: report.payload ?? '',
        }
      })
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

.timed-report-editor {
  font-size: 13px;
}

.report-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--color-border-default, #ebeef5);
}

.field-pair {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.field-label,
.field-unit {
  color: #909399;
  font-size: 12px;
}

.num-input {
  width: 70px;
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

.row-remove {
  color: #909399;
  margin-left: auto;
}

.add-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-size: 12px;
}

</style>
