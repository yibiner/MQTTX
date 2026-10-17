<template>
  <div class="auto-reply-editor">
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

        <label>{{ $t('connections.autoReplyCondition') }}</label>
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

        <label>{{ $t('connections.autoReplyPayload') }}</label>
        <div>
          <el-input
            v-model="rule.reply.payload"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            class="payload-input"
            :placeholder="rule.reply.mode === 'echo' ? '{&quot;code&quot;: 0, &quot;msg&quot;: null}' : ''"
            @input="emitChange"
          ></el-input>
          <p class="cell-hint">
            {{
              rule.reply.mode === 'echo'
                ? $t('connections.autoReplyPayloadEchoHint')
                : $t('connections.autoReplyPayloadFixedHint')
            }}
          </p>
        </div>

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

    <el-button type="text" icon="el-icon-plus" class="rule-add" @click="addRule">
      {{ $t('connections.autoReplyAdd') }}
    </el-button>
    <p v-if="!rules.length" class="empty-hint">{{ $t('connections.autoReplyEmpty') }}</p>
    <p v-else class="rule-hint">{{ $t('connections.autoReplyOnceHint') }}</p>
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

  private rules: AutoReplyRuleModel[] = []
  private quickDelays: number[] = [0, 100, 500, 1000]
  private qosList: QoS[] = [0, 1, 2]

  get conditionPlaceholder(): string {
    return "cmd == 'WIFI_RECONNECT_SERVICE'"
  }

  @Watch('value', { immediate: true })
  private handleValueChanged(value: AutoReplyRuleModel[] | null | undefined) {
    if (this.isSameAsRules(value)) {
      return
    }
    this.rules = this.clone(value ?? [])
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
    const cleaned = this.rules
      .map((rule) => ({
        ...rule,
        reply: { ...rule.reply, delayMs: Math.max(0, Number(rule.reply?.delayMs) || 0) },
      }))
      .filter((rule) => (rule.matchTopic ?? '').trim() !== '' || (rule.name ?? '').trim() !== '')
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

  .reply-rule {
    padding: 8px 10px;
    margin-bottom: 10px;
    border: 1px solid #eceff2;
    border-radius: 4px;
    background: #fafbfc;
  }

  .rule-header {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    .rule-name {
      flex: 1;
      max-width: 260px;
    }
    .rule-options {
      display: flex;
      align-items: center;
      margin-left: 12px;
      .rule-delete {
        margin-left: 10px;
        color: #f56c6c;
      }
    }
  }

  .rule-grid {
    display: grid;
    grid-template-columns: 104px 1fr;
    gap: 6px 10px;
    align-items: center;
    label {
      color: #606266;
      line-height: 28px;
    }
  }

  .cell-error {
    margin: 2px 0 0;
    color: #f56c6c;
    font-size: 12px;
  }

  .cell-hint {
    margin: 4px 0 0;
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
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
    .delay-input {
      width: 80px;
    }
    .unit {
      margin: 0 8px 0 4px;
      color: #909399;
    }
    .quick-delay {
      margin-right: 6px;
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
      margin-left: 8px;
      .qos-select {
        width: 84px;
        margin-left: 6px;
      }
    }
  }

  .rule-add {
    padding: 0;
    font-size: 12px;
  }

  .empty-hint,
  .rule-hint {
    margin: 6px 0 0;
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
  }
}
</style>
