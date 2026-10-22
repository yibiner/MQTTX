<template>
  <my-dialog
    :title="$t('connections.automationTitle')"
    :visible.sync="dialogVisible"
    width="720px"
    :top="'8vh'"
    :confirm-btn-text="$t('common.save')"
    @open="handleOpen"
    @confirm="handleConfirm"
  >
    <div class="automation-dialog">
      <p v-if="connected" class="automation-dialog-hint">{{ $t('connections.automationConnectedHint') }}</p>
      <el-tabs v-model="activeTab" class="automation-tabs">
        <el-tab-pane :label="$t('connections.autoSubscribe')" name="subscribe">
          <AutoSubscribeEditor v-model="draft.autoSubscriptions" />
          <p class="automation-dialog-note">{{ $t('connections.automationSubscribeNote') }}</p>
        </el-tab-pane>
        <el-tab-pane :label="$t('connections.autoReply')" name="reply">
          <AutoReplyEditor v-model="draft.autoReplies" :variable-names="variableNames" />

          <!-- Debug panel: feed a message the connection would receive and look at what the rules
               answer, without publishing anything. -->
          <div class="automation-preview">
            <div class="automation-preview-title">{{ $t('connections.autoReplyPreviewTitle') }}</div>
            <div class="automation-preview-grid">
              <label>{{ $t('connections.autoReplyPreviewTopic') }}</label>
              <el-input v-model="previewTopic" size="mini" placeholder="app/ACME900/xxx/device/ntp/sub" />
              <label>{{ $t('connections.autoReplyPreviewPayload') }}</label>
              <el-input
                v-model="previewPayload"
                type="textarea"
                size="mini"
                :autosize="{ minRows: 3, maxRows: 8 }"
                placeholder='{"cmd": "NTP_SYNC", "ts": 1792486795034}'
              ></el-input>
            </div>
            <div class="automation-preview-actions">
              <el-button size="mini" type="primary" plain @click="runPreview">
                {{ $t('connections.autoReplyPreviewRun') }}
              </el-button>
            </div>
            <div v-if="previewResult" class="automation-preview-result">
              <p v-if="previewResult.kind === 'error'" class="automation-preview-error">
                {{ previewResult.message }}
              </p>
              <p v-else-if="previewResult.kind === 'none'" class="automation-preview-empty">
                {{ $t('connections.autoReplyPreviewNoMatch') }}
              </p>
              <template v-else>
                <p class="automation-preview-line">
                  {{ $t('connections.autoReplyPreviewRule') }}:
                  <span class="automation-preview-rule">{{ previewResult.ruleName }}</span>
                </p>
                <p class="automation-preview-line">
                  {{ $t('connections.autoReplyPreviewReplyTopic') }}:
                  <span class="automation-preview-topic">{{ previewResult.topic }}</span>
                </p>
                <p class="automation-preview-line">{{ $t('connections.autoReplyPayload') }}:</p>
                <pre class="automation-preview-payload">{{ previewResult.payload }}</pre>
              </template>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </my-dialog>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import MyDialog from '@/components/MyDialog.vue'
import AutoSubscribeEditor from '@/components/AutoSubscribeEditor.vue'
import AutoReplyEditor from '@/components/AutoReplyEditor.vue'
import { planAutoReplies } from '@/utils/autoReply'
import { formatJsonText } from '@/utils/jmesPathCondition'
import { getGlobalVariables } from '@/utils/configProfiles'
import { connectionVariableOptions } from '@/utils/payloadVariables'

interface AutomationDraft {
  autoSubscriptions: AutoSubscribeGroupModel[]
  autoReplies: AutoReplyRuleModel[]
}

type PreviewResult =
  | { kind: 'error'; message: string }
  | { kind: 'none' }
  | { kind: 'reply'; ruleName: string; topic: string; payload: string }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? ([] as unknown as T)))

/**
 * Automation of a connection, editable while it is connected.
 *
 * The connection settings themselves need a disconnect, but the rules that describe the device (what
 * it subscribes to and how it answers) are what one tunes against a live broker, so they live in their
 * own dialog. Saving applies them immediately: the reply engine and the next connect use the new rules
 * without reconnecting.
 *
 * The reply tab has a small debug panel: paste a message the device would receive, press test, and it
 * shows which rule matches and the payload that would be sent - nothing is published.
 */
@Component({ components: { MyDialog, AutoSubscribeEditor, AutoReplyEditor } })
export default class AutomationDialog extends Vue {
  @Prop({ default: false }) public visible!: boolean
  @Prop({ required: true }) public record!: ConnectionModel
  @Prop({ default: false }) public connected!: boolean

  private activeTab: 'subscribe' | 'reply' = 'reply'
  private draft: AutomationDraft = { autoSubscriptions: [], autoReplies: [] }
  private previewTopic = ''
  private previewPayload = ''
  private previewResult: PreviewResult | null = null

  get dialogVisible(): boolean {
    return this.visible
  }

  set dialogVisible(value: boolean) {
    this.$emit('update:visible', value)
  }

  @Watch('visible')
  private onVisibleChanged(value: boolean) {
    if (value) {
      this.handleOpen()
    }
  }

  /** Variable names the reply actions can target: the connection's own and the global ones. */
  private get variableNames(): string[] {
    const names = Object.keys(this.record?.variables ?? {})
    getGlobalVariables().forEach((variable) => {
      if (variable.name && !names.includes(variable.name)) {
        names.push(variable.name)
      }
    })
    return names
  }

  private handleOpen() {
    this.draft = clone({
      autoSubscriptions: this.record?.autoSubscriptions ?? [],
      autoReplies: this.record?.autoReplies ?? [],
    })
    this.previewResult = null
  }

  private handleConfirm() {
    this.$emit('save', clone(this.draft))
  }

  /** Runs the rules against the simulated message, without touching the broker. */
  private runPreview() {
    const topic = this.previewTopic.trim()
    if (!topic) {
      this.previewResult = { kind: 'error', message: this.$t('connections.autoReplyPreviewTopicRequired') as string }
      return
    }
    const replies = planAutoReplies(this.draft.autoReplies, {
      topic,
      payload: this.previewPayload,
      ...connectionVariableOptions(this.record),
      // A preview only shows what would be sent: it must not advance a stateful variable.
      commitCounters: false,
    })
    if (!replies.length) {
      this.previewResult = { kind: 'none' }
      return
    }
    // A rule that failed earlier in the list must not hide the reply the user is previewing.
    const reply = replies.find((item) => !item.error) ?? replies[0]
    const ruleName = this.draft.autoReplies.find((rule) => rule.id === reply.ruleId)?.name || reply.ruleId
    if (reply.error) {
      this.previewResult = {
        kind: 'error',
        message: `${this.$t('connections.autoReplyPreviewRuleError') as string}: ${reply.error}`,
      }
      return
    }
    this.previewResult = {
      kind: 'reply',
      ruleName,
      topic: reply.topic,
      payload: this.prettyPayload(reply.payload),
    }
  }

  /**
   * Shows the reply as it will be sent. It is formatted without parsing it, because `JSON.parse` would
   * round a 64-bit integer of the message (see `formatJsonText`).
   */
  private prettyPayload(payload: string): string {
    return formatJsonText(payload)
  }
}
</script>

<style lang="scss">
.automation-dialog {
  font-size: 12px;

  .automation-dialog-hint {
    margin: 0 0 10px;
    padding: 6px 10px;
    border-radius: 4px;
    background: var(--color-bg-item, #f5f7fa);
    color: var(--color-text-tips, #909399);
    line-height: 1.6;
  }

  .automation-dialog-note {
    margin: 8px 0 0;
    color: var(--color-text-tips, #909399);
    line-height: 1.6;
  }

  .automation-preview {
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px dashed var(--color-border-default);
  }

  .automation-preview-title {
    margin-bottom: 8px;
    color: var(--color-text-title);
    font-size: 13px;
  }

  .automation-preview-grid {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 8px 10px;
    align-items: center;
    label {
      color: var(--color-text-default);
      line-height: 28px;
      white-space: nowrap;
    }
  }

  .automation-preview-actions {
    margin-top: 10px;
  }

  .automation-preview-result {
    margin-top: 10px;
    .automation-preview-line {
      margin: 0 0 4px;
      color: var(--color-text-default);
    }
    .automation-preview-rule {
      color: var(--color-main-green);
    }
    .automation-preview-topic {
      color: var(--color-text-title);
      word-break: break-all;
    }
    .automation-preview-empty {
      margin: 0;
      color: var(--color-text-tips, #909399);
    }
    .automation-preview-error {
      margin: 0;
      color: var(--color-minor-red);
    }
    .automation-preview-payload {
      margin: 0;
      padding: 8px 10px;
      max-height: 220px;
      overflow: auto;
      border-radius: 4px;
      background: var(--color-bg-item, #f5f7fa);
      color: var(--color-text-default);
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }
}
</style>
