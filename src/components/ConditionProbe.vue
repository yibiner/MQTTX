<template>
  <div class="condition-probe">
    <el-button type="text" class="probe-toggle" native-type="button" @click="open = !open">
      {{ $t('connections.conditionProbeToggle') }}
    </el-button>
    <div v-if="open" class="probe-panel">
      <el-input
        v-if="checkTopic"
        v-model="sampleTopic"
        class="probe-topic"
        :placeholder="$t('connections.conditionProbeTopicSample')"
        @input="rerun"
      ></el-input>
      <el-input
        v-model="payload"
        type="textarea"
        class="probe-payload"
        :autosize="{ minRows: 2, maxRows: 8 }"
        :placeholder="$t('connections.conditionProbeSample')"
        @input="rerun"
      ></el-input>
      <div class="probe-row">
        <el-button size="mini" native-type="button" @click="run">{{ $t('connections.conditionProbeRun') }}</el-button>
        <el-checkbox v-model="checkTopic" class="probe-check">{{ $t('connections.conditionProbeCheckTopic') }}</el-checkbox>
        <span v-if="verdict && verdictText" :class="['probe-verdict', verdict]">{{ verdictText }}</span>
      </div>
      <p v-for="(line, index) in hints" :key="index" class="probe-hint">{{ line }}</p>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import { probePayloadCondition } from '@/utils/jmesPathCondition'
import { matchTopicMethod } from '@/utils/topicMatch'

type Verdict = 'ok' | 'no' | 'bad' | 'ask'

/**
 * Tries the current condition against one JSON payload, and optionally the topic filter too.
 *
 * The sample stays in the editor and is not saved with the rule. Topic matching uses the filter as
 * written, so a `${}` placeholder is not filled in. Clearing the checkbox judges the condition only.
 */
@Component
export default class ConditionProbe extends Vue {
  @Prop({ required: false, default: '' }) private readonly expression!: string

  /** The rule's topic filter, including `+` and `#`. */
  @Prop({ required: false, default: '' }) private readonly topic!: string

  private open = false
  private checkTopic = true
  private sampleTopic = ''
  private payload = ''
  private tested = false
  private verdict: Verdict | '' = ''
  private hints: string[] = []

  get verdictText(): string {
    if (this.verdict === 'ask') {
      return this.$t('connections.conditionProbeNeedTopic') as string
    }
    const conditionOnly = !this.checkTopic
    if (this.verdict === 'ok' && !(this.expression || '').trim()) {
      const key = conditionOnly ? 'connections.conditionProbeEmptyCondition' : 'connections.conditionProbeEmpty'
      return this.$t(key) as string
    }
    if (this.verdict === 'ok') {
      const key = conditionOnly ? 'connections.conditionProbeConditionMatched' : 'connections.conditionProbeMatched'
      return this.$t(key) as string
    }
    if (this.verdict === 'no') {
      const key = conditionOnly ? 'connections.conditionProbeConditionMissed' : 'connections.conditionProbeMissed'
      return this.$t(key) as string
    }
    return ''
  }

  @Watch('expression')
  @Watch('topic')
  @Watch('checkTopic')
  private onRuleChanged() {
    this.rerun()
  }

  /** Keeps the last result current after the payload or the sample topic changes. */
  private rerun() {
    if (this.tested) {
      this.run()
    }
  }

  private run() {
    this.tested = true
    this.hints = []
    const result = probePayloadCondition(this.expression, this.payload)
    if (result.error === 'payload') {
      this.verdict = 'bad'
      this.hints = [this.$t('connections.conditionProbeBadPayload') as string]
      return
    }
    if (result.error === 'expression') {
      this.verdict = 'bad'
      this.hints = [this.$t('connections.conditionProbeBadExpression') as string]
      return
    }
    const literalHints = result.literals.map((item) => {
      const key = item.form === 'backtick' ? 'connections.conditionProbeBacktickHint' : 'connections.conditionProbeQuoteHint'
      return this.$t(key, { field: item.field, literal: item.literal }) as string
    })
    if (!this.checkTopic) {
      this.verdict = result.matched ? 'ok' : 'no'
      this.hints = literalHints
      return
    }
    const filter = (this.topic || '').trim()
    const incoming = this.sampleTopic.trim()
    if (!incoming) {
      this.verdict = 'ask'
      this.hints = literalHints
      return
    }
    if (!filter) {
      this.verdict = 'no'
      this.hints = [this.$t('connections.conditionProbeTopicEmpty') as string, ...literalHints]
      return
    }
    if (!matchTopicMethod(filter, incoming)) {
      const topicHints = [this.$t('connections.conditionProbeTopicMissed') as string]
      if (filter.includes('${')) {
        topicHints.push(this.$t('connections.conditionProbeTopicVariable') as string)
      }
      this.verdict = 'no'
      this.hints = [...topicHints, ...literalHints]
      return
    }
    this.verdict = result.matched ? 'ok' : 'no'
    this.hints = literalHints
  }
}
</script>

<style lang="scss" scoped>
.condition-probe {
  margin-top: 6px;
}

.probe-toggle.el-button--text {
  height: 24px;
  padding: 0;
  font-size: 12px;
  line-height: 24px;
  color: var(--color-main-green);
}

.probe-panel {
  margin-top: 6px;
}

.probe-topic {
  margin-bottom: 6px;
}

.probe-check {
  display: inline-flex;
  align-items: center;
  height: 28px;
  margin-right: 0;
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-default);
}

::v-deep .probe-check .el-checkbox__label {
  padding-left: 6px;
  font-size: 12px;
  font-weight: 400;
  line-height: 28px;
  color: var(--color-text-default);
}

.probe-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.probe-verdict {
  font-size: 12px;
  line-height: 28px;
  &.ok {
    color: var(--color-main-green);
  }
  &.no,
  &.bad {
    color: var(--color-minor-red);
  }
  &.ask {
    color: var(--color-text-light);
  }
}

.probe-hint {
  margin: 4px 0 0;
  color: var(--color-text-default);
  font-size: 12px;
  line-height: 1.5;
}

::v-deep .probe-payload textarea {
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
</style>
