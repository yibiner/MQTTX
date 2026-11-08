<template>
  <div class="variable-editor">
    <div v-for="(row, index) in rows" :key="row.key" class="variable-row" :class="{ invalid: row.issue }">
      <el-input
        class="name-input"
        size="mini"
        :placeholder="$t('connections.variableNamePlaceholder')"
        v-model="row.name"
        @change="emitChange"
      />
      <span class="equals">=</span>

      <el-select
        v-if="!row.locked"
        class="kind-select"
        size="mini"
        v-model="row.kind"
        @change="onKindChange(row)"
      >
        <el-option :label="$t('connections.variableKindConstant')" value="constant" />
        <el-option :label="$t('connections.variableKindSequence')" value="sequence" />
      </el-select>
      <el-input v-else class="kind-select" size="mini" :value="lockedKindLabel(row.lockedKind)" disabled />

      <template v-if="row.locked && row.lockedKind === 'captured'">
        <el-input
          class="value-input"
          size="mini"
          :placeholder="$t('connections.variableValuePlaceholder')"
          v-model="row.value"
          @change="emitChange"
        />
      </template>
      <template v-else-if="row.locked">
        <span class="locked-value">{{ row.value }}</span>
      </template>
      <template v-else-if="row.kind === 'constant'">
        <el-input
          class="value-input"
          size="mini"
          :placeholder="$t('connections.variableValuePlaceholder')"
          v-model="row.value"
          @change="emitChange"
        />
      </template>

      <template v-else>
        <span class="field-pair">
          <span class="field-label">{{ $t('connections.variableInitial') }}</span>
          <el-input
            class="num-input"
            size="mini"
            type="number"
            v-model.number="row.initial"
            @change="emitChange"
          />
        </span>
        <span class="field-pair">
          <span class="field-label">{{ $t('connections.variableStep') }}</span>
          <el-input class="num-input" size="mini" type="number" v-model.number="row.step" @change="emitChange" />
        </span>
        <span class="field-pair">
          <span class="field-label">{{ $t('connections.variableMin') }}</span>
          <el-input class="num-input" size="mini" type="number" v-model.number="row.min" @change="emitChange" />
        </span>
        <span class="field-pair">
          <span class="field-label">{{ $t('connections.variableMax') }}</span>
          <el-input class="num-input" size="mini" type="number" v-model.number="row.max" @change="emitChange" />
        </span>
      </template>

      <a class="row-remove" href="javascript:;" @click.prevent="removeRow(index)">
        <i class="el-icon-delete"></i>
      </a>

      <p v-if="row.issue" class="row-issue">{{ issueText(row.issue) }}</p>
    </div>

    <div class="editor-actions">
      <a class="add-row" href="javascript:;" @click.prevent="addRow">
        <i class="el-icon-plus"></i>
        <span>{{ $t('connections.variableAdd') }}</span>
      </a>
      <HintIcon :text="hintLines" />
    </div>

  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import { VariableNameIssue } from '@/utils/variables/registry'
import { rowsToVariables, variablesToRows } from '@/utils/variableRows'
import HintIcon from '@/components/HintIcon.vue'

type VariableRow = { key: number } & ReturnType<typeof variablesToRows>[number]

/**
 * Editor for the "客户端变量" of a connection.
 *
 * Two kinds are offered here, the two that matter when simulating a device:
 *
 * - `constant` - a fixed value, e.g. `${productType}` = `gateway`;
 * - `sequence` - a counter that changes on every send, e.g. `${wf116wight}` counting down.
 *
 * Any other definition (captured, random, choice, session, ...) is shown with its own kind and is
 * not offered in the kind list, so it cannot be turned into a counter by mistake. A captured
 * variable still has an editable fallback value; the rest of its definition stays as stored.
 */
@Component({
  components: { HintIcon },
})
export default class VariableListEditor extends Vue {
  @Prop({ default: () => ({}) }) private value!: { [name: string]: StoredVariable }

  private rows: VariableRow[] = []

  private keySeed = 0

  @Watch('value', { immediate: true, deep: true })
  private syncFromParent(val: { [name: string]: StoredVariable }) {
    this.rows = variablesToRows(val).map((row) => ({ key: ++this.keySeed, ...row }))
  }

  private addRow() {
    this.rows.push({
      key: ++this.keySeed,
      name: '',
      kind: 'constant',
      value: '',
      initial: 0,
      step: 1,
      min: 0,
      max: 0,
    })
  }

  private removeRow(index: number) {
    this.rows.splice(index, 1)
    this.emitChange()
  }

  private onKindChange(row: VariableRow) {
    this.emitChange()
  }

  /** Labels for kinds this editor shows but does not create. */
  private lockedKindLabel(kind: VariableKind | undefined): string {
    const labels: { [name: string]: string } = {
      captured: this.$t('configs.variableKindCaptured') as string,
      random: this.$t('configs.variableKindRandom') as string,
      randomWalk: this.$t('configs.variableKindRandomWalk') as string,
      choice: this.$t('configs.variableKindChoice') as string,
      session: this.$t('configs.variableKindSession') as string,
      runStart: this.$t('configs.variableKindRunStart') as string,
    }
    return (kind && labels[kind]) || kind || ''
  }

  /** The hint lists the built-in variables, which are part of the text rather than translated. */
  get hintLines(): string[] {
    return [this.$t('connections.variableHint') as string, '${clientId}  ${username}  ${host}  ${port}']
  }

  private issueText(issue: VariableNameIssue): string {
    const key = `connections.variableIssue${issue.charAt(0).toUpperCase()}${issue.slice(1)}`
    return this.$t(key) as string
  }

  private emitChange() {
    const { variables } = rowsToVariables(this.rows, this.value)
    this.$emit('input', variables)
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

.variable-editor {
  font-size: 13px;
}

.variable-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--color-border-default, #ebeef5);
}

.variable-row.invalid .name-input {
  border-color: #f56c6c;
}

.name-input {
  width: 150px;
}

.equals {
  color: #909399;
}

.kind-select {
  width: 120px;
}

.locked-value {
  color: #909399;
  font-size: 12px;
}

.value-input {
  flex: 1;
  min-width: 140px;
}

.field-pair {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.field-label {
  color: #909399;
  font-size: 12px;
}

.num-input {
  width: 70px;
}

.row-remove {
  color: #909399;
  margin-left: auto;
}

.row-issue {
  flex-basis: 100%;
  margin: 0;
  color: #f56c6c;
  font-size: 12px;
}

.add-row {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-size: 12px;
}


.hint code {
  background: rgba(144, 147, 153, 0.12);
  border-radius: 3px;
  padding: 0 4px;
  font-size: 11px;
}
</style>
