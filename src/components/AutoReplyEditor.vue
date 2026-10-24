<template>
  <div class="auto-reply-editor">
    <div class="editor-head">
      <el-button type="text" icon="el-icon-plus" class="rule-add" @click="addRule">
        {{ $t('connections.autoReplyAdd') }}
      </el-button>
      <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
        <div slot="content" class="automation-tip">
          <p>{{ $t('connections.autoReplyDesc') }}</p>
          <p>{{ $t('connections.autoReplyOnceHint') }}</p>
        </div>
        <a href="javascript:;" class="editor-help">
          <i class="el-icon-warning-outline"></i>
        </a>
      </el-tooltip>
    </div>

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
          <el-tooltip :content="$t('connections.autoReplyEnableRule')" placement="top" :effect="tooltipEffect">
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
          <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
            <div slot="content" class="automation-tip">
              <p>{{ $t('connections.autoReplyConditionHint') }}</p>
            </div>
            <a href="javascript:;" class="field-help">
              <i class="el-icon-warning-outline"></i>
            </a>
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
          <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
            <div slot="content" class="automation-tip">
              <p>
                {{
                  rule.reply.mode === 'echo'
                    ? $t('connections.autoReplyPayloadEchoHint')
                    : $t('connections.autoReplyPayloadFixedHint')
                }}
              </p>
            </div>
            <a href="javascript:;" class="field-help">
              <i class="el-icon-warning-outline"></i>
            </a>
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

      <!-- Variable actions of the rule: reset some definitions and/or write received fields into
           them, so a later message of the same conversation carries the captured state. -->
      <div class="rule-actions">
        <div class="actions-head">
          <span class="actions-title">{{ $t('connections.autoReplyActions') }}</span>
          <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
            <div slot="content" class="automation-tip">
              <p>{{ $t('connections.autoReplyActionsHint') }}</p>
            </div>
            <a href="javascript:;" class="field-help">
              <i class="el-icon-warning-outline"></i>
            </a>
          </el-tooltip>
        </div>
        <div class="actions-grid">
          <label>{{ $t('connections.autoReplyResetVariables') }}</label>
          <el-select
            v-model="rule.actions.resetVariables"
            size="mini"
            multiple
            filterable
            allow-create
            default-first-option
            class="reset-variables"
            :placeholder="$t('connections.autoReplyResetVariablesPlaceholder')"
            @change="emitChange"
          >
            <el-option v-for="name in variableNames" :key="name" :label="name" :value="name"></el-option>
          </el-select>

          <label>{{ $t('connections.autoReplySetVariables') }}</label>
          <div class="set-variables">
            <div v-for="(item, setIndex) in rule.actions.setVariables" :key="setIndex" class="set-variable-row">
              <el-input
                v-model="item.name"
                size="mini"
                class="set-variable-name"
                :placeholder="$t('connections.autoReplySetVariableName')"
                @input="emitChange"
              ></el-input>
              <el-input
                v-model="item.value"
                size="mini"
                class="set-variable-value"
                :placeholder="$t('connections.autoReplySetVariableValue')"
                @input="emitChange"
              ></el-input>
              <a href="javascript:;" class="set-variable-delete" @click="removeSetVariable(rule, setIndex)">
                <i class="el-icon-delete"></i>
              </a>
            </div>
            <el-button type="text" icon="el-icon-plus" class="set-variable-add" @click="addSetVariable(rule)">
              {{ $t('connections.autoReplyAddSetVariable') }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Model, Prop, Vue, Watch } from 'vue-property-decorator'
import { isValidCondition } from '@/utils/jmesPathCondition'

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createActions = (): AutoReplyActionsModel => ({ resetVariables: [], setVariables: [] })

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
  actions: createActions(),
})

/**
 * Editor for the automatic replies of a connection / client preset.
 *
 * A rule answers a received message without a script: the topic filter and the JMESPath condition
 * decide what it answers, `echo` merges the configured fields into the received message, and
 * `${msg.path}` / `${variable}` make the reply topic and body refer to the request.
 *
 * A rule may also change the stateful variables: reset some of them to their initial value and/or
 * write a field of the received message into one (`actions`), which is how a captured device state
 * travels from one reply to the next.
 */
@Component
export default class AutoReplyEditor extends Vue {
  @Model('change', { type: Array }) private readonly value!: AutoReplyRuleModel[] | null | undefined
  /** Known variable names, offered by the reset picker (free text is still accepted). */
  @Prop({ required: false, default: () => [] }) private readonly variableNames!: string[]

  /** Rows being edited, incomplete ones included: they are drafts until the user types into them. */
  private rules: AutoReplyRuleModel[] = []
  /** JSON of the last value this editor emitted, to recognise its own echo (see the watcher). */
  private lastEmitted = ''
  private quickDelays: number[] = [0, 100, 500, 1000]
  private qosList: QoS[] = [0, 1, 2]

  get conditionPlaceholder(): string {
    return "cmd == 'WIFI_RECONNECT_SERVICE'"
  }

  /** Same light/dark choice as the other hints of the app (the tooltip must stay readable). */
  get tooltipEffect(): 'dark' | 'light' {
    const theme = (this as unknown as { $store?: { getters?: { currentTheme?: string } } }).$store?.getters
      ?.currentTheme
    return theme && theme !== 'light' ? 'light' : 'dark'
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
      actions: {
        resetVariables: [...(rule.actions?.resetVariables ?? [])],
        setVariables: (rule.actions?.setVariables ?? []).map((item) => ({ ...item })),
      },
    }))
  }

  private isSameAsRules(value: AutoReplyRuleModel[] | null | undefined): boolean {
    return JSON.stringify(value ?? []) === JSON.stringify(this.rules ?? [])
  }

  private isConditionInvalid(rule: AutoReplyRuleModel): boolean {
    return !isValidCondition(rule.matchCondition)
  }

  /** The saved form of the variable actions: trimmed, de-duplicated and without empty drafts. */
  private cleanActions(rule: AutoReplyRuleModel): AutoReplyActionsModel | undefined {
    const resetVariables = (rule.actions?.resetVariables ?? [])
      .map((name) => String(name ?? '').trim())
      .filter((name, index, all) => name !== '' && all.indexOf(name) === index)
    const setVariables = (rule.actions?.setVariables ?? [])
      .map((item) => ({ name: String(item.name ?? '').trim(), value: item.value ?? '' }))
      .filter((item) => item.name !== '')
    if (!resetVariables.length && !setVariables.length) {
      return undefined
    }
    return { resetVariables, setVariables }
  }

  private emitChange() {
    // The stripped copy is only what is *saved*; the editor keeps incomplete drafts visible so the
    // user can finish typing them.
    const cleaned = this.rules
      .map((rule) => {
        const actions = this.cleanActions(rule)
        return {
          ...rule,
          reply: { ...rule.reply, delayMs: Math.max(0, Number(rule.reply?.delayMs) || 0) },
          ...(actions ? { actions } : { actions: undefined }),
        }
      })
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

  private addSetVariable(rule: AutoReplyRuleModel) {
    rule.actions?.setVariables?.push({ name: '', value: '' })
    this.emitChange()
  }

  private removeSetVariable(rule: AutoReplyRuleModel, index: number) {
    rule.actions?.setVariables?.splice(index, 1)
    this.emitChange()
  }
}
</script>

<style lang="scss">
.auto-reply-editor {
  font-size: 12px;

  // The head row holds the add button and the hint icon. Its height matches a form label
  // (`el-form-item__label` is 32px and centres its text), so the button sits on the same line as the
  // section label in the preset dialog instead of floating above it.
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

  .reply-rule {
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px solid var(--color-border-default);
    border-radius: 4px;
    background: var(--color-bg-normal);
  }

  .rule-header {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 28px;
    margin-bottom: 10px;
    .rule-name {
      flex: 1;
      max-width: 260px;
    }
    .rule-options {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
      flex: none;
      height: 28px;
      .rule-delete {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        color: var(--color-minor-red);
        line-height: 1;
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

  .cell-error {
    margin: 2px 0 0;
    color: var(--color-minor-red);
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
    min-height: 28px;
    .delay-input.el-input-number--mini {
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
    .reply-flags {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
      height: 28px;
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
      .qos-select.el-select {
        width: 88px;
      }
    }
  }

  .reply-options span.unit {
    color: var(--color-text-light);
    line-height: 28px;
  }

  // Variable actions of the rule, visually separated from the reply configuration.
  .rule-actions {
    padding-top: 10px;
    margin-top: 10px;
    border-top: 1px dashed var(--color-border-default);
  }

  .actions-head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    .actions-title {
      color: var(--color-text-default);
      font-weight: 600;
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

  .actions-grid {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 8px 10px;
    align-items: start;
    label {
      min-width: 0;
      color: var(--color-text-default);
      line-height: 28px;
      overflow-wrap: anywhere;
    }
  }

  .reset-variables {
    width: 100%;
  }

  .set-variables {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .set-variable-row {
    display: flex;
    align-items: center;
    gap: 6px;
    .set-variable-name {
      width: 140px;
      flex: none;
    }
    .set-variable-value {
      flex: 1;
    }
    .set-variable-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      flex: none;
      color: var(--color-minor-red);
      line-height: 1;
    }
  }

  .set-variable-add {
    align-self: flex-start;
    padding: 0;
    color: var(--color-main-green);
    font-size: 12px;
  }

  .rule-add.el-button--text {
    height: 32px;
    padding: 0;
    font-size: 12px;
    line-height: 32px;
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
