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
        <el-input
          v-model="row.value"
          class="variable-value"
          size="mini"
          clearable
          :placeholder="$t('configs.variableValue')"
          @input="handleChange"
        />
        <el-button icon="el-icon-delete" class="variable-delete" type="text" @click="handleRemove(index)" />
      </div>
      <p v-if="errorOf(row)" class="variable-error">{{ errorOf(row) }}</p>
    </div>
    <el-button icon="el-icon-plus" class="variable-add" type="text" @click="handleAdd">
      {{ $t('configs.addVariable') }}
    </el-button>
  </div>
</template>

<script lang="ts">
import { Component, Model, Prop, Vue, Watch } from 'vue-property-decorator'
import { isBuiltinPayloadVariable, PAYLOAD_VARIABLE_NAME_PATTERN } from '@/utils/payloadVariables'

interface VariableRow {
  name: string
  value: string
}

/**
 * Editor for a `{ name: value }` map of payload variables.
 *
 * The map is edited as a list of rows, so a variable keeps its place while it is being typed and
 * an invalid name can be pointed out right next to it. Rows without a name are dropped on the way
 * out, i.e. they simply do not exist as variables.
 */
@Component
export default class VariableEditor extends Vue {
  @Prop({ required: false, default: '' }) private title!: string
  @Model('change', { type: Object }) private readonly value!: { [name: string]: string } | null | undefined

  private rows: VariableRow[] = [{ name: '', value: '' }]

  @Watch('value', { immediate: true })
  private handleValueChanged(value: { [name: string]: string } | null | undefined) {
    // The parent only ever holds what this editor emitted, so a rebuild that would not change the
    // rows is skipped: it would drop the row the user is currently typing in.
    if (this.isSameAsRows(value)) {
      return
    }
    const rows = Object.keys(value ?? {}).map((name) => ({ name, value: value?.[name] ?? '' }))
    this.rows = rows.length ? rows : [{ name: '', value: '' }]
  }

  private isSameAsRows(value: { [name: string]: string } | null | undefined): boolean {
    const filled = this.rows.filter((row) => row.name.trim())
    const names = Object.keys(value ?? {})
    if (filled.length !== names.length) {
      return false
    }
    return names.every((name) => filled.some((row) => row.name.trim() === name && row.value === value?.[name]))
  }

  private handleChange() {
    const changed: { [name: string]: string } = {}
    this.rows.forEach((row) => {
      const name = row.name.trim()
      if (name) {
        changed[name] = row.value
      }
    })
    this.$emit('change', changed)
  }

  private handleAdd() {
    this.rows.push({ name: '', value: '' })
  }

  private handleRemove(index: number) {
    this.rows.splice(index, 1)
    if (!this.rows.length) {
      this.rows.push({ name: '', value: '' })
    }
    this.handleChange()
  }

  /** Why the name of this row cannot be used, or an empty string while it is fine. */
  private errorOf(row: VariableRow): string {
    const name = row.name.trim()
    if (!name) {
      return ''
    }
    if (!PAYLOAD_VARIABLE_NAME_PATTERN.test(name)) {
      return this.$t('configs.variableNameInvalid') as string
    }
    if (isBuiltinPayloadVariable(name)) {
      return this.$t('configs.variableNameReserved') as string
    }
    const duplicated = this.rows.filter((item) => item.name.trim() === name).length > 1
    return duplicated ? (this.$t('configs.variableNameDuplicate') as string) : ''
  }
}
</script>

<style lang="scss" scoped>
.variable-editor {
  .variable-row {
    margin-bottom: 6px;
  }
  .variable-row-inputs {
    display: flex;
    align-items: center;
  }
  .variable-name {
    width: 220px;
    margin-right: 8px;
  }
  .variable-value {
    flex: 1;
    margin-right: 4px;
  }
  .variable-delete {
    color: var(--color-minor-red);
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
