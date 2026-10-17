<template>
  <span class="variables-help">
    <el-tooltip v-if="tooltip" placement="top" :open-delay="200" popper-class="variables-help-popper">
      <div slot="content" class="variables-help-tooltip">{{ tooltip }}</div>
      <a href="javascript:;" class="variables-help-icon"><i class="el-icon-question"></i></a>
    </el-tooltip>
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
import { Component, Prop, Vue } from 'vue-property-decorator'

/**
 * Reference for the payload variables, opened from the place where they are managed: the built-in
 * variables, which variables apply where (the scopes), and how a placeholder is resolved.
 *
 * A page that would need a paragraph to explain its variables passes `tooltip` instead: the text
 * then stays behind a small question mark and is shown on hover, which keeps the page itself quiet.
 */
@Component
export default class VariablesHelp extends Vue {
  // Text shown on hover of the question mark. Without it only the "view tips" link is rendered
  @Prop({ default: '' }) public tooltip!: string

  private showDialog = false
}
</script>

<style lang="scss" scoped>
.variables-help {
  margin-left: 6px;
  white-space: nowrap;
}

.variables-help-icon {
  margin-right: 8px;
  color: var(--color-text-tips);
  font-size: 14px;
  vertical-align: middle;
  &:hover {
    color: var(--color-main-green);
  }
}

.variables-help-trigger {
  font-size: 12px;
  color: var(--color-main-green);
  &:hover {
    text-decoration: underline;
  }
}

.variables-help-popper {
  max-width: 380px;
  line-height: 1.8;

  .variables-help-tooltip {
    white-space: pre-line;
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
