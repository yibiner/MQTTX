<template>
  <div class="variable-editor">
    <div v-if="title" class="editor-header">
      <span class="editor-title">{{ title }}</span>
    </div>
    <div v-for="(row, index) in rows" :key="index" class="variable-row">
      <div class="variable-row-inputs">
        <el-input
          v-model="row.name"
          class="variable-name"
          size="mini"
          clearable
          :placeholder="$t('configs.variableName')"
          @input="handleChange"
        />
        <span class="variable-type">{{ kindLabel(row) }}</span>
        <span v-if="summaryOf(row)" class="variable-summary" :title="summaryOf(row)">{{ summaryOf(row) }}</span>
        <template v-if="showRuntime && isStatefulRow(row)">
          <span class="variable-current" :title="$t('configs.variableCurrentValue')">
            <span class="variable-current-label">{{ $t('configs.variableCurrentValue') }}</span>
            <code class="variable-current-value">{{ currentValueOf(row) }}</code>
          </span>
          <el-tooltip :content="$t('configs.variableReset')" placement="top">
            <a href="javascript:;" class="variable-reset" @click="handleReset(index)">
              <i class="el-icon-refresh"></i>
            </a>
          </el-tooltip>
          <el-tooltip :content="$t('configs.variableSetValue')" placement="top">
            <a href="javascript:;" class="variable-set" @click="startSetValue(index)">
              <i class="el-icon-edit"></i>
            </a>
          </el-tooltip>
        </template>
        <el-tooltip :content="$t('configs.variableEditDefinition')" placement="top">
          <a href="javascript:;" class="variable-expand" @click="toggle(index)">
            <i :class="expandedIndex === index ? 'el-icon-arrow-down' : 'el-icon-setting'"></i>
          </a>
        </el-tooltip>
        <el-button icon="el-icon-delete" class="variable-delete" type="text" @click="handleRemove(index)" />
      </div>
      <div v-if="editingValueIndex === index" class="variable-set-row">
        <span class="variable-set-label">{{ $t('configs.variableSetValue') }}</span>
        <el-input
          v-model="editingValue"
          size="mini"
          class="variable-set-input"
          :placeholder="$t('configs.variableSetValuePrompt', { name: row.name.trim() })"
          @keyup.enter.native="confirmSetValue(index)"
        />
        <a href="javascript:;" class="variable-set-confirm" @click="confirmSetValue(index)">
          <i class="el-icon-check"></i>
        </a>
        <a href="javascript:;" class="variable-set-cancel" @click="cancelSetValue">
          <i class="el-icon-close"></i>
        </a>
      </div>
      <p v-if="errorOf(row)" class="variable-error">{{ errorOf(row) }}</p>
      <div v-if="expandedIndex === index" class="variable-definition">
        <VariableDefinitionEditor :value="row.stored" @change="handleDefinitionChange(row, $event)" />
      </div>
    </div>
    <el-button icon="el-icon-plus" class="variable-add" type="text" @click="handleAdd">
      {{ $t('configs.addVariable') }}
    </el-button>
  </div>
</template>

<script lang="ts">
import { Component, Model, Prop, Vue, Watch } from 'vue-property-decorator'
import {
  isStatefulKind,
  normalizeVariableDefinition,
  peekDefinitionValue,
  resetVariable,
  setVariableValue,
  validateVariableName,
} from '@/utils/payloadVariables'
import VariableDefinitionEditor from './VariableDefinitionEditor.vue'

interface VariableRow {
  name: string
  stored: StoredVariable
}

/**
 * Editor for a `{ name: value }` map of payload variables.
 *
 * The map is edited as a list of rows, so a variable keeps its place while it is being typed and
 * an invalid name can be pointed out right next to it. A row stays compact: it shows the name, the
 * kind and a one line summary; the definition itself is edited by expanding the row (the client
 * preset editor and the global variables dialog show the same `VariableDefinitionEditor`).
 *
 * When the editor knows the connection (`connectionId`), a stateful variable also shows its current
 * value with the reset / manual set actions. Without it (a client preset, which is a template that
 * can be applied to many connections) the runtime parts are hidden: there is no value to show yet.
 *
 * Rows without a name are dropped on the way out, i.e. they simply do not exist as variables.
 */
@Component({ components: { VariableDefinitionEditor } })
export default class VariableEditor extends Vue {
  @Prop({ required: false, default: '' }) private title!: string
  /**
   * The connection whose runtime state the row actions work on. Absent for the client preset editor:
   * a preset is copied into a connection, so it has no current values of its own.
   */
  @Prop({ required: false, default: '' }) private connectionId!: string
  @Model('change', { type: Object }) private readonly value!: { [name: string]: StoredVariable } | null | undefined

  private rows: VariableRow[] = [{ name: '', stored: '' }]
  /** The row whose definition is expanded, or null when every row is compact. */
  private expandedIndex: number | null = 0
  /** The row whose current value is being edited, or null. */
  private editingValueIndex: number | null = null
  private editingValue = ''

  /** The runtime parts only make sense once the editor knows the connection of the values. */
  get showRuntime(): boolean {
    return Boolean(this.connectionId)
  }

  @Watch('value', { immediate: true })
  private handleValueChanged(value: { [name: string]: StoredVariable } | null | undefined) {
    // The parent only ever holds what this editor emitted, so a rebuild that would not change the
    // rows is skipped: it would drop the row the user is currently typing in.
    if (this.isSameAsRows(value)) {
      return
    }
    const rows = Object.keys(value ?? {}).map((name) => ({ name, stored: value?.[name] ?? '' }))
    this.rows = rows.length ? rows : [{ name: '', stored: '' }]
    if (this.expandedIndex !== null) {
      this.expandedIndex = Math.min(this.expandedIndex, this.rows.length - 1)
    }
    this.editingValueIndex = null
  }

  private isSameAsRows(value: { [name: string]: StoredVariable } | null | undefined): boolean {
    const filled = this.rows.filter((row) => row.name.trim())
    const names = Object.keys(value ?? {})
    if (filled.length !== names.length) {
      return false
    }
    return names.every((name, index) => {
      const row = filled[index]
      return row.name.trim() === name && JSON.stringify(row.stored) === JSON.stringify(value?.[name] ?? '')
    })
  }

  private handleChange() {
    const changed: { [name: string]: StoredVariable } = {}
    this.rows.forEach((row) => {
      const name = row.name.trim()
      if (name) {
        changed[name] = row.stored
      }
    })
    this.$emit('change', changed)
  }

  private handleDefinitionChange(row: VariableRow, stored: StoredVariable) {
    row.stored = stored
    this.handleChange()
  }

  private handleAdd() {
    this.rows.push({ name: '', stored: '' })
    this.expandedIndex = this.rows.length - 1
    this.editingValueIndex = null
    this.handleChange()
  }

  private handleRemove(index: number) {
    this.rows.splice(index, 1)
    if (!this.rows.length) {
      this.rows.push({ name: '', stored: '' })
    }
    if (this.expandedIndex !== null) {
      this.expandedIndex = this.expandedIndex === index ? null : Math.min(this.expandedIndex, this.rows.length - 1)
    }
    if (this.editingValueIndex !== null) {
      this.editingValueIndex =
        this.editingValueIndex === index ? null : Math.min(this.editingValueIndex, this.rows.length - 1)
    }
    this.handleChange()
  }

  private toggle(index: number) {
    this.expandedIndex = this.expandedIndex === index ? null : index
    this.editingValueIndex = null
  }

  /** The normalized definition of a named row; a draft row has no definition yet. */
  private definitionOf(row: VariableRow) {
    const name = row.name.trim()
    if (!name) {
      return undefined
    }
    return normalizeVariableDefinition(name, row.stored, { scope: 'connection', connectionId: this.connectionId })
  }

  private kindOf(row: VariableRow): VariableKind {
    if (typeof row.stored === 'string') {
      return 'constant'
    }
    return row.stored.kind ?? 'constant'
  }

  private isStatefulRow(row: VariableRow): boolean {
    return isStatefulKind(this.kindOf(row))
  }

  private kindLabel(row: VariableRow): string {
    const kind = this.kindOf(row)
    return this.$t('configs.variableKind' + kind.charAt(0).toUpperCase() + kind.slice(1)) as string
  }

  /** A compact, language independent preview of what the definition does. */
  private summaryOf(row: VariableRow): string {
    const stored = row.stored
    const config = typeof stored === 'string' ? undefined : stored
    switch (this.kindOf(row)) {
      case 'constant':
        return typeof stored === 'string' ? stored : stored.value ?? ''
      case 'sequence': {
        const initial = config?.initial ?? 0
        const step = config?.step ?? 1
        return [initial, initial + step, initial + step * 2].map(String).join(' → ')
      }
      case 'random':
        return `${config?.min ?? 0}..${config?.max ?? 100}`
      case 'randomWalk':
        return `±${config?.range ?? 1}`
      case 'choice': {
        const options = (config?.options ?? []).map((option) => option.value).filter((value) => value !== '')
        return options.length ? options.slice(0, 3).join(' / ') + (options.length > 3 ? ' …' : '') : '-'
      }
      case 'session':
        return config?.generator === 'template' ? config.value ?? '' : 'UUID'
      case 'captured':
        return config?.value || '-'
      default:
        return ''
    }
  }

  /** The current value of a stateful row, or a placeholder while it was never used. */
  private currentValueOf(row: VariableRow): string {
    const definition = this.definitionOf(row)
    if (!definition) {
      return '-'
    }
    const current = peekDefinitionValue(definition)
    return current === undefined || String(current) === '' ? '-' : String(current)
  }

  private handleReset(index: number) {
    const row = this.rows[index]
    const definition = row ? this.definitionOf(row) : undefined
    if (!definition) {
      return
    }
    if (resetVariable(definition)) {
      this.$message.success(this.$t('configs.variableResetDone', { name: row.name.trim() }) as string)
      this.$forceUpdate()
    }
  }

  private startSetValue(index: number) {
    this.editingValueIndex = index
    const row = this.rows[index]
    this.editingValue = row ? this.currentValueOf(row).replace(/^-$/, '') : ''
    this.$nextTick(() => {
      const root = this.$el as HTMLElement | undefined
      const input = root?.querySelector('.variable-set-input input') as HTMLInputElement | null
      input?.focus()
    })
  }

  private confirmSetValue(index: number) {
    const row = this.rows[index]
    const definition = row ? this.definitionOf(row) : undefined
    if (!definition) {
      this.editingValueIndex = null
      return
    }
    const text = this.editingValue.trim()
    if (text === '') {
      // Clearing the value is the same as resetting it to the definition's default.
      resetVariable(definition)
      this.$message.success(this.$t('configs.variableResetDone', { name: row.name.trim() }) as string)
      this.editingValueIndex = null
      this.$forceUpdate()
      return
    }
    const value = /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : this.editingValue
    if (setVariableValue(definition, value)) {
      this.$message.success(this.$t('configs.variableSetValueDone', { name: row.name.trim() }) as string)
    } else {
      this.$message.error(this.$t('configs.variableSetValueFailed') as string)
    }
    this.editingValueIndex = null
    this.$forceUpdate()
  }

  private cancelSetValue() {
    this.editingValueIndex = null
    this.editingValue = ''
  }

  /** Why the name of this row cannot be used, or an empty string while it is fine. */
  private errorOf(row: VariableRow): string {
    const name = row.name.trim()
    if (!name) {
      return ''
    }
    const takenNames = this.rows.filter((item) => item !== row).map((item) => item.name.trim())
    const issue = validateVariableName(
      name,
      takenNames.filter((taken) => taken !== ''),
    )
    if (issue === 'invalid') {
      return this.$t('configs.variableNameInvalid') as string
    }
    if (issue === 'reserved') {
      return this.$t('configs.variableNameReserved') as string
    }
    return issue === 'duplicate' ? (this.$t('configs.variableNameDuplicate') as string) : ''
  }
}
</script>

<style lang="scss" scoped>
.variable-editor {
  .variable-row {
    margin-bottom: 8px;
  }
  .variable-row-inputs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .variable-name {
    width: 200px;
  }
  .variable-type {
    flex: none;
    padding: 0 6px;
    color: var(--color-text-default);
    background: var(--color-bg-code);
    border-radius: 3px;
    font-size: 12px;
    line-height: 20px;
  }
  .variable-summary {
    max-width: 220px;
    overflow: hidden;
    color: var(--color-text-light);
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .variable-current {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-text-default);
    font-size: 12px;
    .variable-current-value {
      color: var(--color-main-green);
      font-family: Menlo, Monaco, Consolas, monospace;
    }
  }
  .variable-current-label {
    color: var(--color-text-light);
  }
  .variable-reset,
  .variable-set,
  .variable-expand {
    color: var(--color-text-default);
    font-size: 14px;
    &:hover {
      color: var(--color-main-green);
    }
  }
  .variable-delete {
    color: var(--color-minor-red);
  }
  .variable-set-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    padding: 4px 6px;
    border-radius: 4px;
    // Same light green the rest of the app uses for a highlighted/editable surface
    // (`--color-light-green`), instead of the blue-grey card background.
    background: var(--color-light-green);
    .variable-set-label {
      color: var(--color-main-green);
      white-space: nowrap;
    }
    .variable-set-input {
      width: 200px;
    }
    .variable-set-confirm {
      color: var(--color-main-green);
    }
    .variable-set-cancel {
      color: var(--color-main-green);
      opacity: 0.75;
    }
  }
  .variable-definition {
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--color-border-default);
    border-radius: 4px;
    background: var(--color-bg-card-normal);
  }
  .variable-error {
    margin: 2px 0 0;
    color: var(--color-minor-red);
    font-size: 12px;
    line-height: 1.5;
  }
  .variable-add {
    padding: 4px 0;
    color: var(--color-main-green);
  }
}
</style>
