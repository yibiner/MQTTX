<template>
  <PresetPicker
    class="topic-preset-picker"
    :items="options"
    :title="$t('configs.topicPresets')"
    icon="el-icon-price-tag"
    :bare="bare"
    placement="bottom-end"
    :empty-text="$t('configs.topicPresetsEmpty')"
    :search-placeholder="$t('configs.presetSearchPlaceholder')"
    manage-tab="topic"
    @show="load"
    @select="choose"
  />
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import PresetPicker from '@/components/PresetPicker.vue'
import type { PresetOption } from '@/components/PresetPicker.vue'
import { getTopicPresets } from '@/utils/configProfiles'

/**
 * Picks a saved topic template and emits the stored string. Placeholders stay unresolved: the field
 * that receives the topic fills them when the message is sent or matched.
 *
 * The list, the search and the "manage" link come from the shared `PresetPicker`; this wrapper only
 * maps a topic preset onto a row and turns the picked id back into the template every caller wants.
 */
@Component({ components: { PresetPicker } })
export default class TopicPresetPicker extends Vue {
  /** Borderless icon, for the publish row whose topic input has no box of its own. */
  @Prop({ type: Boolean, default: false }) private bare!: boolean

  private presets: TopicPresetModel[] = []

  get options(): PresetOption[] {
    return this.presets.map((preset) => ({ id: preset.id, name: preset.name, summary: preset.topic }))
  }

  private load() {
    this.presets = getTopicPresets()
  }

  private choose(id: string) {
    const preset = this.presets.find((item) => item.id === id)
    if (preset) {
      this.$emit('select', preset.topic)
    }
  }
}
</script>

<style lang="scss">
/*
 * The row that holds a topic input and its preset button. Ten call sites use it, so it lives here
 * as a global rule (this component's style block is not scoped) instead of being repeated.
 */
.topic-preset-picker {
  flex: none;
  line-height: 1;
}

.topic-preset-field {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;

  > .el-input,
  > .el-textarea {
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
  }

  &.is-area {
    align-items: flex-start;
  }
}

.el-form-item .topic-preset-field > .el-input,
.el-form-item .topic-preset-field > .el-textarea {
  width: auto;
}
</style>
