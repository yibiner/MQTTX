<template>
  <div class="auto-reply-editor">
    <div v-for="(rule, index) in rules" :key="rule.id" class="rule-card">
      <div class="rule-header">
        <el-switch v-model="rule.enabled" @change="emitChange" />
        <el-input class="name-input" size="mini" :placeholder="$t('connections.autoReplyNamePlaceholder')" v-model="rule.name" @change="emitChange" />
        <a class="rule-remove" href="javascript:;" @click.prevent="removeRule(index)">
          <i class="el-icon-delete"></i>
        </a>
      </div>

      <div class="rule-line">
        <span class="field-label">{{ $t('connections.autoReplyMatchTopic') }}</span>
        <el-input
          class="grow"
          size="mini"
          :placeholder="$t('connections.autoReplyMatchTopicPlaceholder')"
          v-model="rule.matchTopic"
          @change="emitChange"
        />
      </div>

      <div class="rule-line">
        <span class="field-label">{{ $t('connections.autoReplyMatchCondition') }}</span>
        <el-input
          class="grow"
          size="mini"
          :placeholder="$t('connections.autoReplyMatchConditionPlaceholder')"
          v-model="rule.matchCondition"
          @change="emitChange"
        />
      </div>

      <div class="rule-line">
        <span class="field-label">{{ $t('connections.autoReplyReplyMode') }}</span>
        <el-select class="mode-select" size="mini" v-model="rule.reply.mode" @change="emitChange">
          <el-option :label="$t('connections.autoReplyModeEcho')" value="echo" />
          <el-option :label="$t('connections.autoReplyModeFixed')" value="fixed" />
        </el-select>
        <el-select class="qos-select" size="mini" v-model.number="rule.reply.qos" @change="emitChange">
          <el-option :label="'QoS 0'" :value="0" />
          <el-option :label="'QoS 1'" :value="1" />
          <el-option :label="'QoS 2'" :value="2" />
        </el-select>
        <el-checkbox v-model="rule.reply.retain" @change="emitChange">{{ $t('connections.autoReplyRetain') }}</el-checkbox>
        <span class="field-pair">
          <span class="field-label">{{ $t('connections.autoReplyDelay') }}</span>
          <el-input
            class="num-input"
            size="mini"
            type="number"
            :min="0"
            v-model.number="rule.reply.delayMs"
            @change="emitChange"
          />
          <span class="field-unit">ms</span>
        </span>
      </div>

      <div class="rule-line">
        <span class="field-label">{{ $t('connections.autoReplyReplyTopic') }}</span>
        <el-input
          class="grow"
          size="mini"
          :placeholder="$t('connections.autoReplyReplyTopicPlaceholder')"
          v-model="rule.reply.topic"
          @change="emitChange"
        />
      </div>

      <div class="rule-line">
        <span class="field-label">{{ $t('connections.autoReplyReplyPayload') }}</span>
        <el-input
          class="grow"
          size="mini"
          type="textarea"
          :rows="2"
          :placeholder="$t('connections.autoReplyReplyPayloadPlaceholder')"
          v-model="rule.reply.payload"
          @change="emitChange"
        />
      </div>
    </div>

    <div class="rule-actions">
      <a class="add-rule" href="javascript:;" @click.prevent="addRule">
        <i class="el-icon-plus"></i>
        <span>{{ $t('connections.autoReplyAdd') }}</span>
      </a>
      <el-select
        v-if="allowPreset && presets.length"
        class="preset-select"
        size="mini"
        clearable
        :value="null"
        :placeholder="$t('connections.presetLoad')"
        @change="loadPreset"
      >
        <el-option v-for="preset in presets" :key="preset.id" :label="preset.name" :value="preset.id" />
      </el-select>
      <HintIcon :text="$t('connections.autoReplyHint')" />
    </div>

  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import { v4 as uuidv4 } from 'uuid'
import { getAutoReplyPresets } from '@/utils/configProfiles'
import HintIcon from '@/components/HintIcon.vue'

/**
 * Editor for the automatic reply rules of a connection ("自动回复").
 *
 * A rule answers messages that match a topic filter and, optionally, a JMESPath condition on the
 * payload. The reply is either `echo` (the received JSON object merged with the template, which is
 * how a device acknowledges a command) or `fixed` (the template as written).
 */
@Component({
  components: { HintIcon },
})
export default class AutoReplyEditor extends Vue {
  @Prop({ default: () => [] }) private value!: AutoReplyRuleModel[]

  /** Whether "load from preset" is offered; see the note in MessageSequenceEditor. */
  @Prop({ default: true }) private allowPreset!: boolean

  private rules: AutoReplyRuleModel[] = []

  /** Reply presets ("自动回复预设") the user can load into this connection. */
  private presets: AutoReplyPresetModel[] = []

  /**
   * Distinguishes the list we just emitted from a list the parent loaded. The emitted list omits
   * rules that are still being typed, and the parent writes that list straight back; without this
   * the watch would delete the row the user just added.
   */
  private echoToken = 0

  private pendingEcho = -1

  @Watch('value', { immediate: true })
  private syncFromParent(val: AutoReplyRuleModel[]) {
    const incoming = (val ?? []).map((rule) => ({
      ...rule,
      reply: { ...rule.reply },
    }))
    const isEcho = this.pendingEcho === this.echoToken && this.echoToken !== 0
    this.pendingEcho = -1
    if (!isEcho) {
      this.rules = incoming
      return
    }
    const incomingIds = new Set(incoming.map((rule) => rule.id))
    const drafts = this.rules.filter(
      (rule) => String(rule.matchTopic ?? '').trim() === '' && !incomingIds.has(rule.id),
    )
    this.rules = [...incoming, ...drafts]
  }

  private loadPresets() {
    this.presets = getAutoReplyPresets()
  }

  /** Appends the rules of a preset, each with a new id so it is independent of the stored preset. */
  private loadPreset(presetId: string) {
    if (!presetId) {
      return
    }
    this.loadPresets()
    const preset = this.presets.find((item) => item.id === presetId)
    if (!preset) {
      return
    }
    const source = preset.rules && preset.rules.length ? preset.rules : preset.rule ? [preset.rule] : []
    source.forEach((rule) => {
      this.rules.push({ ...JSON.parse(JSON.stringify(rule)), id: uuidv4() })
    })
    this.emitChange()
  }

  private created() {
    this.loadPresets()
  }

  private createRule(): AutoReplyRuleModel {
    return {
      id: uuidv4(),
      name: '',
      enabled: true,
      matchTopic: '',
      matchCondition: '',
      reply: {
        topic: '',
        mode: 'echo',
        payload: '',
        qos: 0,
        retain: false,
        delayMs: 0,
      },
    } as AutoReplyRuleModel
  }

  private addRule() {
    this.rules.push(this.createRule())
    this.emitChange()
  }

  private removeRule(index: number) {
    this.rules.splice(index, 1)
    this.emitChange()
  }

  private emitChange() {
    // A rule with neither a match topic nor a reply topic is still being written: keep it on screen,
    // keep it out of what is saved.
    const cleaned = this.rules
      .filter((rule) => (rule.matchTopic ?? '').trim() !== '')
      .map((rule) => ({
        ...rule,
        name: (rule.name ?? '').trim(),
        reply: {
          ...rule.reply,
          delayMs: Number.isFinite(rule.reply.delayMs) ? Math.max(0, Number(rule.reply.delayMs)) : 0,
        },
      }))
    this.pendingEcho = ++this.echoToken
    this.$emit('input', cleaned)
  }
}
</script>

<style scoped>
.auto-reply-editor {
  font-size: 13px;
}

.rule-card {
  border: 1px solid var(--color-border-default, #dcdfe6);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.name-input {
  width: 180px;
}

.rule-remove {
  color: #909399;
  margin-left: auto;
}

.rule-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 4px;
}

.field-label {
  color: #909399;
  font-size: 12px;
  min-width: 64px;
}

.field-pair {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.field-unit {
  color: #909399;
  font-size: 12px;
}

.grow {
  flex: 1;
  min-width: 160px;
}

.mode-select {
  width: 110px;
}

.qos-select {
  width: 90px;
}

.num-input {
  width: 70px;
}

.rule-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preset-select {
  width: 160px;
}

.add-rule {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-size: 12px;
}

</style>
