<template>
  <div class="variable-definition-editor">
    <div class="definition-grid">
      <label>{{ $t('configs.variableKind') }}</label>
      <el-select v-model="draft.kind" size="mini" class="definition-kind" @change="handleKindChange">
        <el-option v-for="kind in kinds" :key="kind" :label="kindLabel(kind)" :value="kind"></el-option>
      </el-select>

      <!-- constant: the value is a template, resolved on every send -->
      <template v-if="draft.kind === 'constant'">
        <label class="with-help">
          {{ $t('configs.variableValue') }}
          <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
            <div slot="content">{{ $t('configs.variableValueTip') }}</div>
            <a href="javascript:;" class="field-help">
              <i class="el-icon-warning-outline"></i>
            </a>
          </el-tooltip>
        </label>
        <el-input
          v-model="draft.value"
          size="mini"
          clearable
          class="variable-value"
          :placeholder="constantPlaceholder"
          @input="emitChange"
        ></el-input>
      </template>

      <!-- sequence: a counter that moves by `step` on every send -->
      <template v-else-if="draft.kind === 'sequence'">
        <label>{{ $t('configs.variableInitial') }}</label>
        <el-input-number
          v-model="draft.initial"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'0'"
          @change="emitChange"
        ></el-input-number>

        <label class="with-help">
          {{ $t('configs.variableStep') }}
          <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
            <div slot="content">{{ $t('configs.variableStepTip') }}</div>
            <a href="javascript:;" class="field-help">
              <i class="el-icon-warning-outline"></i>
            </a>
          </el-tooltip>
        </label>
        <el-input-number
          v-model="draft.step"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'1'"
          @change="emitChange"
        ></el-input-number>

        <label>{{ $t('configs.variableMin') }}</label>
        <el-input-number
          v-model="draft.min"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'—'"
          @change="emitChange"
        ></el-input-number>

        <label>{{ $t('configs.variableMax') }}</label>
        <el-input-number
          v-model="draft.max"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'—'"
          @change="emitChange"
        ></el-input-number>
      </template>

      <!-- random: a new value from [min, max] on every send -->
      <template v-else-if="draft.kind === 'random'">
        <label>{{ $t('configs.variableMin') }}</label>
        <el-input-number
          v-model="draft.min"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'0'"
          @change="emitChange"
        ></el-input-number>

        <label>{{ $t('configs.variableMax') }}</label>
        <el-input-number
          v-model="draft.max"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'100'"
          @change="emitChange"
        ></el-input-number>

        <label>{{ $t('configs.variablePrecision') }}</label>
        <el-input-number
          v-model="draft.formatPrecision"
          size="mini"
          :controls="false"
          :min="0"
          :max="6"
          :precision="0"
          class="definition-number"
          :placeholder="'—'"
          @change="emitChange"
        ></el-input-number>

        <label>{{ $t('configs.variableSeed') }}</label>
        <el-input-number
          v-model="draft.seed"
          size="mini"
          :controls="false"
          :precision="0"
          class="definition-number"
          :placeholder="'—'"
          @change="emitChange"
        ></el-input-number>
      </template>

      <!-- randomWalk: the value drifts by at most `range` per send -->
      <template v-else-if="draft.kind === 'randomWalk'">
        <label>{{ $t('configs.variableInitial') }}</label>
        <el-input-number
          v-model="draft.initial"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'0'"
          @change="emitChange"
        ></el-input-number>

        <label>{{ $t('configs.variableRange') }}</label>
        <el-input-number
          v-model="draft.range"
          size="mini"
          :controls="false"
          :min="0"
          class="definition-number"
          :placeholder="'1'"
          @change="emitChange"
        ></el-input-number>

        <label>{{ $t('configs.variableMin') }}</label>
        <el-input-number
          v-model="draft.min"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'—'"
          @change="emitChange"
        ></el-input-number>

        <label>{{ $t('configs.variableMax') }}</label>
        <el-input-number
          v-model="draft.max"
          size="mini"
          :controls="false"
          class="definition-number"
          :placeholder="'—'"
          @change="emitChange"
        ></el-input-number>
      </template>

      <!-- choice: draw one of the weighted options -->
      <template v-else-if="draft.kind === 'choice'">
        <label>{{ $t('configs.variableOptions') }}</label>
        <div class="choice-options">
          <div v-for="(option, index) in draft.options" :key="index" class="choice-option">
            <el-input
              v-model="option.value"
              size="mini"
              clearable
              class="choice-value"
              :placeholder="$t('configs.variableOptionValue')"
              @input="emitChange"
            ></el-input>
            <el-input-number
              v-model="option.weight"
              size="mini"
              :controls="false"
              :min="0"
              :precision="0"
              class="choice-weight"
              :placeholder="$t('configs.variableOptionWeight')"
              @change="emitChange"
            ></el-input-number>
            <a href="javascript:;" class="choice-delete" @click="removeOption(index)">
              <i class="el-icon-delete"></i>
            </a>
          </div>
          <el-button type="text" icon="el-icon-plus" class="choice-add" @click="addOption">
            {{ $t('configs.variableAddOption') }}
          </el-button>
        </div>
      </template>

      <!-- session: generated once per connection session -->
      <template v-else-if="draft.kind === 'session'">
        <label>{{ $t('configs.variableGenerator') }}</label>
        <el-radio-group v-model="draft.generator" size="mini" class="generator-radio" @change="emitChange">
          <el-radio-button label="uuid">{{ $t('configs.variableGeneratorUuid') }}</el-radio-button>
          <el-radio-button label="template">{{ $t('configs.variableGeneratorTemplate') }}</el-radio-button>
        </el-radio-group>

        <template v-if="draft.generator === 'template'">
          <label>{{ $t('configs.variableTemplate') }}</label>
          <el-input
            v-model="draft.value"
            size="mini"
            clearable
            class="definition-text"
            placeholder="A-${uuid}"
            @input="emitChange"
          ></el-input>
        </template>
      </template>

      <!-- captured: written by the variable actions of an automatic reply -->
      <template v-else-if="draft.kind === 'captured'">
        <label>{{ $t('configs.variableDefault') }}</label>
        <el-input
          v-model="draft.value"
          size="mini"
          clearable
          class="definition-text"
          :placeholder="capturedPlaceholder"
          @input="emitChange"
        ></el-input>
      </template>
    </div>

    <p v-for="issue in issues" :key="issue" class="definition-error">{{ issueLabel(issue) }}</p>

    <template v-if="draft.kind !== 'constant'">
      <a href="javascript:;" class="advanced-toggle" @click="advancedOpen = !advancedOpen">
        <i :class="advancedOpen ? 'el-icon-arrow-down' : 'el-icon-arrow-right'"></i>
        {{ $t('configs.variableAdvanced') }}
      </a>
      <div v-if="advancedOpen" class="definition-advanced">
        <div v-if="supportsBound" class="advanced-row">
          <span class="advanced-label">{{ $t('configs.variableOnBound') }}</span>
          <el-select v-model="draft.onBound" size="mini" class="bound-select" @change="emitChange">
            <el-option
              v-for="strategy in boundStrategies"
              :key="strategy"
              :label="$t('configs.variableBound' + capitalize(strategy))"
              :value="strategy"
            ></el-option>
          </el-select>
        </div>

        <div v-if="draft.kind === 'randomWalk'" class="advanced-row">
          <span class="advanced-label">{{ $t('configs.variableSeed') }}</span>
          <el-input-number
            v-model="draft.seed"
            size="mini"
            :controls="false"
            :precision="0"
            class="definition-number"
            :placeholder="'—'"
            @change="emitChange"
          ></el-input-number>
        </div>

        <div class="advanced-row">
          <span class="advanced-label">{{ $t('configs.variableResetTriggers') }}</span>
          <div class="reset-triggers">
            <el-checkbox
              :value="hasTrigger('connect')"
              :disabled="draft.kind === 'session'"
              @change="toggleTrigger('connect', $event)"
            >
              {{ $t('configs.variableResetConnect') }}
            </el-checkbox>
            <span v-if="hasTrigger('connect')" class="reconnect-option">
              <el-switch
                v-model="draft.resetOnReconnect"
                active-color="#13ce66"
                inactive-color="#A2A9B0"
                @change="emitChange"
              ></el-switch>
              {{ $t('configs.variableResetOnReconnect') }}
            </span>
            <el-checkbox :value="hasTrigger('disconnect')" @change="toggleTrigger('disconnect', $event)">
              {{ $t('configs.variableResetDisconnect') }}
            </el-checkbox>
            <el-checkbox :value="hasTrigger('appStart')" @change="toggleTrigger('appStart', $event)">
              {{ $t('configs.variableResetAppStart') }}
            </el-checkbox>
            <!-- The manual reset button is always available; it is not a configurable trigger. -->
          </div>
        </div>

        <div class="advanced-row">
          <span class="advanced-label">{{ $t('configs.variableResetEverySec') }}</span>
          <div class="reset-every">
            <el-input-number
              v-model="draft.resetEverySec"
              size="mini"
              :controls="false"
              :min="0"
              :precision="0"
              class="definition-number"
              :placeholder="'—'"
              @change="emitChange"
            ></el-input-number>
            <span class="advanced-unit">{{ $t('common.unitS') }}</span>
          </div>
        </div>

        <div class="advanced-row">
          <span class="advanced-label">{{ $t('configs.variableFormat') }}</span>
          <div class="format-fields">
            <span class="format-label">{{ $t('configs.variablePad') }}</span>
            <el-input-number
              v-model="draft.formatPad"
              size="mini"
              :controls="false"
              :min="0"
              :max="20"
              :precision="0"
              class="definition-number pad-number"
              :placeholder="'—'"
              @change="emitChange"
            ></el-input-number>
            <span class="format-label">{{ $t('configs.variablePrecision') }}</span>
            <el-input-number
              v-model="draft.formatPrecision"
              size="mini"
              :controls="false"
              :min="0"
              :max="6"
              :precision="0"
              class="definition-number pad-number"
              :placeholder="'—'"
              @change="emitChange"
            ></el-input-number>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Model, Vue, Watch } from 'vue-property-decorator'
import { normalizeVariableDefinition, toStoredVariable, validateVariableDefinition } from '@/utils/payloadVariables'
import type { VariableDefinitionIssue } from '@/utils/payloadVariables'

const KINDS: VariableKind[] = ['constant', 'sequence', 'random', 'randomWalk', 'choice', 'session', 'captured']
const BOUND_STRATEGIES: VariableBoundStrategy[] = ['clamp', 'wrap', 'reset', 'keep']

/** The issue codes of `validateVariableDefinition`, translated by the editor. */
const ISSUE_KEYS: { [issue in VariableDefinitionIssue]: string } = {
  initialOutsideRange: 'configs.variableIssueInitialOutsideRange',
  minGreaterThanMax: 'configs.variableIssueMinGreaterThanMax',
  stepZero: 'configs.variableIssueStepZero',
  rangeNegative: 'configs.variableIssueRangeNegative',
  randomRange: 'configs.variableIssueRandomRange',
  choiceOptions: 'configs.variableIssueChoiceOptions',
  precisionRange: 'configs.variableIssuePrecisionRange',
  padRange: 'configs.variableIssuePadRange',
  resetEverySecNegative: 'configs.variableIssueResetEverySecNegative',
  seedNotNumber: 'configs.variableIssueSeedNotNumber',
}

/** The editable shape of one definition; format is flattened so the inputs stay simple. */
interface DefinitionDraft {
  kind: VariableKind
  value: string
  initial?: number
  step?: number
  min?: number
  max?: number
  onBound: VariableBoundStrategy
  resetOn: VariableResetTrigger[]
  resetOnReconnect: boolean
  resetEverySec?: number
  range?: number
  options: Array<{ value: string; weight: number }>
  seed?: number
  generator: 'uuid' | 'template'
  formatPad?: number
  formatPrecision?: number
}

const emptyDraft = (): DefinitionDraft => ({
  kind: 'constant',
  value: '',
  onBound: 'clamp',
  resetOn: [],
  resetOnReconnect: true,
  options: [],
  generator: 'uuid',
})

/**
 * Editor for one payload variable definition.
 *
 * A stored variable is either a constant string or an object describing a stateful kind, and this
 * editor is the only place that knows the fields of every kind: the connection editor, the client
 * preset editor and the global variables dialog all render it, so their definitions cannot drift
 * apart. The fields of a kind are shown directly; the less common ones (bound strategy, reset
 * triggers, periodic reset, formatting) live behind "advanced settings" to keep the row small.
 *
 * The validation rules stay in `validateVariableDefinition` (the core), this component only
 * translates the issue codes.
 */
@Component
export default class VariableDefinitionEditor extends Vue {
  @Model('change', { type: [String, Object] as any })
  private readonly value!: StoredVariable | null | undefined

  private draft: DefinitionDraft = emptyDraft()
  private advancedOpen = false
  private kinds: VariableKind[] = KINDS
  private boundStrategies: VariableBoundStrategy[] = BOUND_STRATEGIES
  /** JSON of the last value this editor emitted, to recognise its own echo. */
  private lastEmitted = ''

  get tooltipEffect(): 'dark' | 'light' {
    const theme = (this as unknown as { $store?: { getters?: { currentTheme?: string } } }).$store?.getters
      ?.currentTheme
    return theme && theme !== 'light' ? 'light' : 'dark'
  }

  get constantPlaceholder(): string {
    return `${'${timestamp}'} / 26.5 / A1`
  }

  get capturedPlaceholder(): string {
    return '26.5'
  }

  /** The bound strategy only applies to the numeric kinds whose value can leave its range. */
  get supportsBound(): boolean {
    return this.draft.kind === 'sequence' || this.draft.kind === 'randomWalk'
  }

  get issues(): VariableDefinitionIssue[] {
    return validateVariableDefinition(
      normalizeVariableDefinition('variable', this.storedConfig(), { scope: 'connection' }),
    )
  }

  @Watch('value', { immediate: true })
  private handleValueChanged(value: StoredVariable | null | undefined) {
    const incoming = JSON.stringify(value ?? '')
    if (incoming === this.lastEmitted) {
      return
    }
    this.draft = this.draftFrom(value)
    this.advancedOpen = this.hasAdvancedSettings(this.draft)
    this.lastEmitted = incoming
  }

  private draftFrom(value: StoredVariable | null | undefined): DefinitionDraft {
    const definition = normalizeVariableDefinition('variable', value ?? '', { scope: 'connection' })
    return {
      kind: definition.kind,
      value: definition.value ?? '',
      initial: definition.initial,
      step: definition.step,
      min: definition.min,
      max: definition.max,
      onBound: definition.onBound,
      resetOn:
        definition.kind === 'session' ? this.withTrigger(definition.resetOn, 'connect') : [...definition.resetOn],
      resetOnReconnect: definition.resetOnReconnect,
      resetEverySec: definition.resetEverySec,
      range: definition.range,
      options: (definition.options ?? []).map((option) => ({ ...option })),
      seed: definition.seed,
      generator: definition.generator,
      formatPad: definition.format?.pad,
      formatPrecision: definition.format?.precision,
    }
  }

  private hasAdvancedSettings(draft: DefinitionDraft): boolean {
    return (
      draft.onBound !== 'clamp' ||
      draft.resetOn.some((trigger) => trigger !== 'connect') ||
      !draft.resetOnReconnect ||
      draft.resetEverySec !== undefined ||
      draft.seed !== undefined ||
      draft.formatPad !== undefined ||
      draft.formatPrecision !== undefined
    )
  }

  /** Whether a field really is a definition, i.e. not a plain constant. */
  private get isStateful(): boolean {
    return this.draft.kind !== 'constant'
  }

  private storedConfig(): VariableDefinitionConfig {
    const format =
      this.draft.formatPad === undefined && this.draft.formatPrecision === undefined
        ? undefined
        : { pad: this.draft.formatPad, precision: this.draft.formatPrecision }
    return {
      kind: this.draft.kind,
      value: this.draft.value === '' ? undefined : this.draft.value,
      initial: this.draft.initial,
      step: this.draft.step,
      min: this.draft.min,
      max: this.draft.max,
      onBound: this.supportsBound ? this.draft.onBound : undefined,
      resetOn: this.draft.resetOn.length ? [...this.draft.resetOn] : undefined,
      resetOnReconnect: this.draft.resetOnReconnect,
      resetEverySec: this.draft.resetEverySec,
      range: this.draft.range,
      options: this.draft.options.length
        ? this.draft.options.map((option) => ({
            value: option.value ?? '',
            weight: Number.isFinite(Number(option.weight)) ? Number(option.weight) : 0,
          }))
        : undefined,
      seed: this.draft.seed,
      generator: this.draft.generator,
      format,
    }
  }

  /** The persisted form of what is currently edited (a bare string for a constant). */
  private storedValue(): StoredVariable {
    if (!this.isStateful) {
      return this.draft.value
    }
    return toStoredVariable(normalizeVariableDefinition('variable', this.storedConfig(), { scope: 'connection' }))
  }

  private emitChange() {
    const stored = this.storedValue()
    this.lastEmitted = JSON.stringify(stored)
    this.$emit('change', stored)
  }

  private handleKindChange(kind: VariableKind) {
    // Switching to a stateful kind seeds the number fields from the constant that was typed, so
    // `value = 200` + kind "sequence" starts at 200 instead of at 0.
    if (kind !== 'constant' && this.draft.initial === undefined) {
      const parsed = Number(this.draft.value.trim())
      this.draft.initial = this.draft.value.trim() !== '' && Number.isFinite(parsed) ? parsed : undefined
    }
    if (kind === 'session') {
      this.draft.resetOn = this.withTrigger(this.draft.resetOn, 'connect')
    }
    if (kind === 'constant') {
      // A constant has no reset triggers or formatting; keep the fields for a later switch back.
      // The numeric editors do not bind `value`, so seed the constant from the initial value again.
      if (this.draft.initial !== undefined) {
        this.draft.value = String(this.draft.initial)
      }
      this.advancedOpen = false
    }
    this.emitChange()
  }

  private withTrigger(triggers: VariableResetTrigger[], trigger: VariableResetTrigger): VariableResetTrigger[] {
    return triggers.includes(trigger) ? [...triggers] : [...triggers, trigger]
  }

  private hasTrigger(trigger: VariableResetTrigger): boolean {
    return this.draft.resetOn.includes(trigger)
  }

  private toggleTrigger(trigger: VariableResetTrigger, checked: boolean) {
    const next = new Set(this.draft.resetOn)
    if (checked) {
      next.add(trigger)
    } else {
      next.delete(trigger)
    }
    this.draft.resetOn = Array.from(next)
    this.emitChange()
  }

  private addOption() {
    this.draft.options.push({ value: '', weight: 1 })
    this.emitChange()
  }

  private removeOption(index: number) {
    this.draft.options.splice(index, 1)
    this.emitChange()
  }

  private kindLabel(kind: VariableKind): string {
    return this.$t('configs.variableKind' + this.capitalize(kind)) as string
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  private issueLabel(issue: VariableDefinitionIssue): string {
    return this.$t(ISSUE_KEYS[issue]) as string
  }
}
</script>

<style lang="scss" scoped>
.variable-definition-editor {
  font-size: 12px;
}

.definition-grid {
  display: grid;
  // 96px is the shared label column of the automation editors, so the inputs
  // line up with 自动回复 and 消息序列 on the same form.
  grid-template-columns: 96px 1fr;
  gap: 8px 10px;
  align-items: start;
  > label {
    min-width: 0;
    color: var(--color-text-default);
    font-size: 12px;
    font-weight: 400;
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

.definition-kind,
.variable-value,
.definition-text {
  width: 100%;
}

.definition-number {
  width: 100%;
}

.generator-radio {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  min-height: 28px;
  // The global mini radio is locked to 90px for the message-type tabs. Session labels such as
  // "每次会话 UUID" do not fit that width, so this group sizes to its text.
  ::v-deep .el-radio-button--mini .el-radio-button__inner {
    width: auto;
    padding: 7px 12px;
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
  }
  ::v-deep .el-radio-button--mini .el-radio-button__orig-radio:checked + .el-radio-button__inner {
    border-color: var(--color-main-green);
    border-left: 1px solid var(--color-main-green);
  }
}

.choice-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.choice-option {
  display: flex;
  align-items: center;
  gap: 6px;
  .choice-value {
    flex: 1;
    min-width: 0;
  }
  .choice-weight.el-input-number {
    width: 84px;
    flex: none;
  }
  .choice-delete {
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

.choice-add {
  align-self: flex-start;
  padding: 0;
  color: var(--color-main-green);
  font-size: 12px;
}

.definition-error {
  margin: 6px 0 0;
  color: var(--color-minor-red);
  font-size: 12px;
  line-height: 1.5;
}

.advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  color: var(--color-main-green);
  font-size: 12px;
  &:hover {
    text-decoration: underline;
  }
}

.definition-advanced {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border-default);
  background: transparent;
}

.advanced-row {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px 10px;
  align-items: start;
  margin-bottom: 8px;
  &:last-child {
    margin-bottom: 0;
  }
}

.advanced-label {
  min-width: 0;
  color: var(--color-text-default);
  font-size: 12px;
  font-weight: 400;
  line-height: 28px;
  overflow-wrap: anywhere;
}

.definition-advanced .advanced-row .bound-select {
  width: 100%;
}

.reset-triggers {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  min-height: 28px;
  // Element's checkbox is 14px and medium weight. These options sit beside 12px field labels,
  // so they use the same size and weight as 「重置时机」.
  ::v-deep .el-checkbox {
    display: inline-flex;
    align-items: center;
    height: 28px;
    margin-right: 0;
    font-size: 12px;
    font-weight: 400;
    color: var(--color-text-default);
    .el-checkbox__input {
      line-height: 1;
    }
    .el-checkbox__label {
      padding-left: 6px;
      font-size: 12px;
      font-weight: 400;
      line-height: 28px;
      color: var(--color-text-default);
    }
  }
  .reconnect-option {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    color: var(--color-text-default);
    font-size: 12px;
    font-weight: 400;
  }
}

.reset-every {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  .definition-number.el-input-number {
    width: 110px;
  }
}

.variable-definition-editor .definition-advanced .reset-every span.advanced-unit {
  color: var(--color-text-light);
  font-size: 12px;
  font-weight: 400;
}

.format-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  min-height: 28px;
  .format-label {
    color: var(--color-text-default);
    font-size: 12px;
    font-weight: 400;
    line-height: 28px;
  }
  .pad-number.el-input-number {
    width: 90px;
    flex: none;
  }
}
</style>
