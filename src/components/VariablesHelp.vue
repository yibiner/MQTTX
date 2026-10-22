<template>
  <span class="variables-help">
    <a href="javascript:;" class="variables-help-trigger" @click="handleOpen">
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
        <template v-if="guideSections.length">
          <h4>{{ $t('configs.variablesGuideTitle') }}</h4>
          <div v-for="section in guideSections" :key="section.group" class="variables-guide-group">
            <h5 class="variables-guide-group-title">{{ $t(section.titleKey) }}</h5>
            <div class="variables-guide-entries">
              <code v-for="name in section.names" :key="name" class="variables-guide-entry">{{ name }}</code>
            </div>
            <!-- The built-in explanations belong to the built-in names above, not to a second section. -->
            <p v-if="section.group === 'builtin'" class="variables-guide-note">
              {{ $t('configs.variablesHelpBuiltins') }}
            </p>
          </div>
        </template>
        <h4>{{ $t('configs.variablesHelpDefinitionsTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpDefinitions') }}</p>
        <h4>{{ $t('configs.variablesHelpStateTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpState') }}</p>
        <h4>{{ $t('configs.variablesHelpSessionTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpSession') }}</p>
        <h4>{{ $t('configs.variablesHelpResetTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpReset') }}</p>
        <h4>{{ $t('configs.variablesHelpFormatTitle') }}</h4>
        <p>{{ $t('configs.variablesHelpFormat') }}</p>
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
import { getVariableGuide } from '@/utils/payloadVariables'
import type { VariableGuideGroup } from '@/utils/payloadVariables'

/** The groups of the guide and their headings, in the order the dialog lists them. */
const GUIDE_GROUPS: ReadonlyArray<{ group: VariableGuideGroup; titleKey: string }> = [
  { group: 'builtin', titleKey: 'configs.variablesGuideGroupBuiltin' },
  { group: 'context', titleKey: 'configs.variablesGuideGroupContext' },
  { group: 'connection', titleKey: 'configs.variablesGuideGroupConnection' },
]

interface GuideSection {
  group: VariableGuideGroup
  titleKey: string
  names: string[]
}

/**
 * Reference for the payload variables, opened from the place where they are managed: the built-in
 * variables, which variables apply where (the scopes), and how a placeholder is resolved.
 *
 * The "available variables" section comes from the provider registry (`getVariableGuide`), so a new
 * provider or a new built-in documents itself here; the dialog only translates the group headings.
 */
@Component
export default class VariablesHelp extends Vue {
  private showDialog = false
  private guideSections: GuideSection[] = []

  /** Rebuilt on every open, so a provider registered while the app runs is listed as well. */
  private handleOpen() {
    const guide = getVariableGuide()
    this.guideSections = GUIDE_GROUPS.map(({ group, titleKey }) => ({
      group,
      titleKey,
      names: guide.filter((entry) => entry.group === group).map((entry) => entry.name),
    })).filter((section) => section.names.length > 0)
    this.showDialog = true
  }
}
</script>

<style lang="scss" scoped>
.variables-help {
  margin-left: 6px;
  white-space: nowrap;
}

.variables-help-trigger {
  font-size: 12px;
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

.variables-guide-group {
  margin-bottom: 10px;
  &:last-child {
    margin-bottom: 0;
  }
}

.variables-guide-group-title {
  margin: 0 0 6px;
  color: var(--color-text-default);
  font-size: 12px;
  font-weight: 600;
}

.variables-guide-entries {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.variables-guide-note {
  margin-top: 8px;
}

.variables-help-note {
  padding: 6px 8px;
  margin-top: 6px !important;
  // The app accent for highlighted surfaces (same light green as the rest of the UI).
  background: var(--color-light-green);
  color: var(--color-main-green);
  border-radius: 4px;
}

.variables-guide-entry {
  padding: 1px 6px;
  color: var(--color-main-green);
  background-color: var(--color-light-green);
  border-radius: 3px;
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
  word-break: break-word;
}
</style>
