<template>
  <span class="variables-help">
    <a href="javascript:;" class="variables-help-trigger" @click="showDialog = true">
      {{ $t('configs.variablesHelp') }}
    </a>
    <el-dialog
      :title="$t('configs.variablesHelpTitle')"
      :visible.sync="showDialog"
      :width="'640px'"
      append-to-body
      custom-class="variables-help-dialog"
    >
      <div class="variables-help-body">
        <h4>{{ $t('configs.variablesHelpScopeTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpScope') }}</p>
        <h4>{{ $t('configs.variablesHelpBuiltinsTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpBuiltins') }}</p>
        <h4>{{ $t('configs.variablesHelpRulesTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpRules') }}</p>
        <h4>{{ $t('configs.variablesHelpExampleTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpExample') }}</p>
      </div>
      <span slot="footer">
        <el-button size="mini" type="primary" class="variables-help-close" @click="showDialog = false">
          {{ $t('common.confirm') }}
        </el-button>
      </span>
    </el-dialog>
  </span>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'

/**
 * Reference for the payload variables, opened from the place where they are managed: the built-in
 * variables, which variables apply where (the scopes), and how a placeholder is resolved.
 */
@Component
export default class VariablesHelp extends Vue {
  private showDialog = false
}
</script>

<style lang="scss" scoped>
.variables-help {
  margin-left: 6px;
}

.variables-help-trigger {
  color: var(--color-main-green);
  &:hover {
    text-decoration: underline;
  }
}

.variables-help-body {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 8px;
  h4 {
    margin: 18px 0 8px;
    color: var(--color-text-default);
    font-size: 13px;
    font-weight: 600;
    &:first-child {
      margin-top: 0;
    }
  }
  p {
    margin: 0;
    color: var(--color-text-default);
    font-size: 12px;
    line-height: 1.9;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
</style>
