<template>
  <div class="auto-reply-editor">
    <div class="editor-head">
      <el-button type="text" icon="el-icon-plus" class="rule-add" @click="addRule">
        {{ $t('connections.autoReplyAdd') }}
      </el-button>
      <el-tooltip placement="top" :open-delay="150">
        <div slot="content" class="automation-tip">
          <p>{{ $t('connections.autoReplyDesc') }}</p>
          <p>{{ $t('connections.autoReplyOnceHint') }}</p>
        </div>
        <span class="editor-help"><i class="el-icon-question"></i></span>
      </el-tooltip>
    </div>

    <p v-if="!rules.length" class="empty-hint">{{ $t('connections.autoReplyEmpty') }}</p>

    <div v-for="(rule, index) in rules" :key="rule.id" class="reply-rule">
      <div class="rule-header">
        <el-input
          v-model="rule.name"
          size="mini"
          class="rule-name"
          :placeholder="$t('connections.autoReplyName')"
          @input="emitChange"
        ></el-input>
        <div class="rule-options">
          <el-tooltip :content="$t('connections.autoReplyEnableRule')" placement="top">
            <el-switch
              v-model="rule.enabled"
              active-color="#13ce66"
              inactive-color="#A2A9B0"
              @change="emitChange"
            ></el-switch>
          </el-tooltip>
          <a href="javascript:;" class="rule-delete" @click="removeRule(index)">
            <i class="el-icon-delete"></i>
          </a>
        </div>
      </div>

      <div class="rule-grid">
        <label>{{ $t('connections.autoReplyMatchTopic') }}</label>
        <el-input
          v-model="rule.matchTopic"
          size="mini"
          placeholder="app/+/+/device/system/post"
          @input="emitChange"
        ></el-input>

        <label class="with-help">
          {{ $t('connections.autoReplyCondition') }}
          <el-tooltip placement="top" :open-delay="150">
            <div slot="content" class="automation-tip">
              <p>{{ $t('connections.autoReplyConditionHint') }}</p>
            </div>
            <i class="el-icon-question field-help"></i>
          </el-tooltip>
        </label>
        <div>
          <el-input
            v-model="rule.matchCondition"
            size="mini"
            :placeholder="conditionPlaceholder"
            @input="emitChange"
          ></el-input>
          <p v-if="isConditionInvalid(rule)" class="cell-error">{{ $t('connections.autoReplyConditionInvalid') }}</p>
        </div>

        <label>{{ $t('connections.autoReplyMode') }}</label>
        <el-radio-group v-model="rule.reply.mode" size="mini" @change="emitChange">
          <el-radio-button label="echo">{{ $t('connections.autoReplyModeEcho') }}</el-radio-button>
          <el-radio-button label="fixed">{{ $t('connections.autoReplyModeFixed') }}</el-radio-button>
        </el-radio-group>

        <label class="with-help">
          {{ $t('connections.autoReplyPayload') }}
          <el-tooltip placement="top" :open-delay="150">
            <div slot="content" class="automation-tip">
              <p>
                {{
                  rule.reply.mode === 'echo'
                    ? $t('connections.autoReplyPayloadEchoHint')
                    : $t('connections.autoReplyPayloadFixedHint')
                }}
              </p>
            </div>
            <i class="el-icon-question field-help"></i>
          </el-tooltip>
        </label>
        <el-input
          v-model="rule.reply.payload"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 6 }"
          class="payload-input"
          :placeholder="rule.reply.mode === 'echo' ? '{&quot;code&quot;: 0, &quot;msg&quot;: null}' : ''"
          @input="emitChange"
        ></el-input>

        <label>{{ $t('connections.autoReplyReplyTopic') }}</label>
        <el-input
          v-model="rule.reply.topic"
          size="mini"
          placeholder="app/${productType}/${clientId}/device/system/reply"
          @input="emitChange"
        ></el-input>

        <label>{{ $t('connections.autoReplyDelay') }}</label>
        <div class="reply-options">
          <el-input-number
            v-model="rule.reply.delayMs"
            size="mini"
            :min="0"
            :step="100"
            :controls="false"
            class="delay-input"
            @change="emitChange"
          ></el-input-number>
          <span class="unit">ms</span>
          <a
            v-for="quick in quickDelays"
            :key="quick"
            href="javascript:;"
            :class="['quick-delay', { active: Number(rule.reply.delayMs) === quick }]"
            @click="setDelay(index, quick)"
          >
            {{ quick }}
          </a>
          <span class="reply-flags">
            <el-checkbox v-model="rule.reply.retain" @change="emitChange">
              {{ $t('connections.autoReplyRetain') }}
            </el-checkbox>
            <el-select v-model="rule.reply.qos" size="mini" class="qos-select" @change="emitChange">
              <el-option v-for="qos in qosList" :key="qos" :label="'QoS ' + qos" :value="qos"></el-option>
            </el-select>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Model, Vue, Watch } from 'vue-property-decorator'
import { isValidCondition } from '@/utils/jmesPathCondition'

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createRule = (): AutoReplyRuleModel => ({
  id: createId(),
  name: '',
  enabled: true,
  matchTopic: '',
  matchCondition: '',
  reply: {
    topic: '',
    mode: 'echo',
    payload: '{\n  "code": 0,\n  "msg": null\n}',
    qos: 0,
    retain: false,
    delayMs: 0,
  },
})

/**
 * Editor for the automatic replies of a connection / client preset.
 *
 * A rule answers a received message without a script: the topic filter and the JMESPath condition
 * decide what it answers, `echo` merges the configured fields into the received message, and
 * `${msg.path}` / `${variable}` make the reply topic and body refer to the request.
 */
@Component
export default class AutoReplyEditor extends Vue {
  @Model('change', { type: Array }) private readonly value!: AutoReplyRuleModel[] | null | undefined

  /** Rows being edited, incomplete ones included: they are drafts until the user types into them. */
  private rules: AutoReplyRuleModel[] = []
  /** JSON of the last value this editor emitted, to recognise its own echo (see the watcher). */
  private lastEmitted = ''
  private quickDelays: number[] = [0, 100, 500, 1000]
  private qosList: QoS[] = [0, 1, 2]

  get conditionPlaceholder(): string {
    return "cmd == 'WIFI_RECONNECT_SERVICE'"
  }

  @Watch('value', { immediate: true })
  private handleValueChanged(value: AutoReplyRuleModel[] | null | undefined) {
    // The value that comes back is the *cleaned* copy this editor emitted: a rule the user just
    // added has no name and no topic filter yet, so it was stripped from it. Rebuilding the rules
    // from that copy would delete the rule under the user's cursor the moment it is created, which
    // made "添加回复规则" look like a dead button.
    const incoming = JSON.stringify(value ?? [])
    if (incoming === this.lastEmitted || incoming === JSON.stringify(this.rules ?? [])) {
      return
    }
    this.rules = this.clone(value ?? [])
    this.lastEmitted = incoming
  }

  private clone(rules: AutoReplyRuleModel[]): AutoReplyRuleModel[] {
    return JSON.parse(JSON.stringify(rules ?? [])).map((rule: AutoReplyRuleModel) => ({
      ...createRule(),
      ...rule,
      reply: { ...createRule().reply, ...(rule.reply ?? {}) },
    }))
  }

  private isSameAsRules(value: AutoReplyRuleModel[] | null | undefined): boolean {
    return JSON.stringify(value ?? []) === JSON.stringify(this.rules ?? [])
  }

  private isConditionInvalid(rule: AutoReplyRuleModel): boolean {
    return !isValidCondition(rule.matchCondition)
  }

  private emitChange() {
    // The stripped copy is only what is *saved*; the editor keeps incomplete drafts visible so the
    // user can finish typing them.
    const cleaned = this.rules
      .map((rule) => ({
        ...rule,
        reply: { ...rule.reply, delayMs: Math.max(0, Number(rule.reply?.delayMs) || 0) },
      }))
      .filter((rule) => (rule.matchTopic ?? '').trim() !== '' || (rule.name ?? '').trim() !== '')
    this.lastEmitted = JSON.stringify(cleaned)
    this.$emit('change', cleaned)
  }

  private setDelay(index: number, delayMs: number) {
    this.rules[index].reply.delayMs = delayMs
    this.emitChange()
  }

  private addRule() {
    this.rules.push(createRule())
    this.emitChange()
  }

  private removeRule(index: number) {
    this.rules.splice(index, 1)
    this.emitChange()
  }
}
</script>

<style lang="scss">
.auto-reply-editor {
  font-size: 12px;

  .editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .editor-help {
    color: #909399;
    cursor: help;
    font-size: 14px;
    line-height: 1;
    &:hover {
      color: #409eff;
    }
  }

  .reply-rule {
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    background: #fafbfc;
  }

  .rule-header {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    .rule-name {
      flex: 1;
      max-width: 260px;
    }
    .rule-options {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: 12px;
      .rule-delete {
        color: #f56c6c;
      }
    }
  }

  // The mode switch has long labels ("回显原消息 + 合并字段"), while the global element reset fixes
  // every mini radio button to 90px so the message filter tabs line up. Only the width is relaxed
  // here: the buttons keep Element's joined segmented look, which is what the rest of the app uses.
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

  // In a joined group Element removes the left border of every button but the first and closes the
  // seam of the selected one with a box-shadow of its own; the global element reset drops that shadow,
  // so the selected button was outlined on three sides only. Draw the seam instead.
  .el-radio-button--mini .el-radio-button__orig-radio:checked + .el-radio-button__inner {
    border-color: var(--color-main-green);
    border-left: 1px solid var(--color-main-green);
  }

  .rule-grid {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 8px 10px;
    align-items: center;
    label {
      color: #606266;
      line-height: 28px;
      white-space: nowrap;
    }
    .with-help {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .field-help {
      color: #c0c4cc;
      cursor: help;
      font-size: 12px;
      &:hover {
        color: #409eff;
      }
    }
  }

  .cell-error {
    margin: 2px 0 0;
    color: #f56c6c;
    font-size: 12px;
  }

  .payload-input {
    textarea {
      font-family: Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
    }
  }

  .reply-options {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 6px;
    .delay-input {
      width: 76px;
    }
    .unit {
      color: #909399;
    }
    .quick-delay {
      padding: 0 5px;
      color: #409eff;
      border-radius: 3px;
      &.active {
        color: #fff;
        background: #409eff;
      }
    }
    .reply-flags {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: 6px;
      .qos-select {
        width: 84px;
      }
    }
  }

  .rule-add {
    padding: 0;
    font-size: 12px;
  }

  .empty-hint {
    margin: 0;
    color: #909399;
    font-size: 12px;
    line-height: 1.6;
  }
}

// Tooltip content is rendered in a popper attached to the body, so it cannot be nested in the editor.
.automation-tip p {
  margin: 0 0 4px;
  max-width: 340px;
  line-height: 1.6;
  &:last-child {
    margin-bottom: 0;
  }
}
</style>
