<template>
  <el-popover
    v-model="visible"
    class="topic-preset-picker"
    placement="bottom-end"
    :width="340"
    trigger="click"
    popper-class="topic-preset-popper"
    @show="load"
  >
    <div class="topic-preset-panel">
      <div class="topic-preset-head">
        <span>{{ $t('configs.topicPresets') }}</span>
        <span class="topic-preset-count">{{ presets.length }}</span>
      </div>
      <div v-if="presets.length === 0" class="topic-preset-empty">{{ $t('configs.topicPresetsEmpty') }}</div>
      <div v-else class="topic-preset-list">
        <div v-for="preset in presets" :key="preset.id" class="topic-preset-item" @click="choose(preset)">
          <div class="topic-preset-name">{{ preset.name }}</div>
          <div class="topic-preset-topic">{{ preset.topic }}</div>
        </div>
      </div>
      <div class="topic-preset-footer">
        <a href="javascript:;" @click="manage">{{ $t('configs.managePresets') }}</a>
      </div>
    </div>
    <el-button
      slot="reference"
      size="mini"
      native-type="button"
      :class="['topic-preset-btn', bare ? 'is-bare' : '']"
      icon="el-icon-price-tag"
      :title="$t('configs.selectTopicPreset')"
    ></el-button>
  </el-popover>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import { getTopicPresets } from '@/utils/configProfiles'

/**
 * Picks a saved topic template and emits the stored string. Placeholders stay unresolved: the field
 * that receives the topic fills them when the message is sent or matched.
 */
@Component
export default class TopicPresetPicker extends Vue {
  /** Borderless icon, for the publish row whose topic input has no box of its own. */
  @Prop({ type: Boolean, default: false }) private bare!: boolean

  private visible = false
  private presets: TopicPresetModel[] = []

  private load() {
    this.presets = getTopicPresets()
  }

  private choose(preset: TopicPresetModel) {
    this.$emit('select', preset.topic)
    this.visible = false
  }

  private manage() {
    this.visible = false
    const router = this.$router
    if (!router) {
      return
    }
    router.push({ path: '/configs', query: { tab: 'topic' } }).catch(() => undefined)
  }
}
</script>

<style lang="scss">
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

.topic-preset-btn.el-button--mini {
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--color-text-default);
  background: var(--color-bg-normal);
  border-color: var(--color-border-default);

  &.is-bare {
    width: 28px;
    height: 32px;
    margin-right: 8px;
    color: var(--color-text-light);
    background: transparent;
    border-color: transparent;
  }

  &:hover,
  &:focus {
    color: var(--color-main-green);
    border-color: var(--color-main-green);
    background: var(--color-bg-normal);
  }

  &.is-bare:hover,
  &.is-bare:focus {
    background: transparent;
    border-color: transparent;
  }
}

.el-popover.topic-preset-popper {
  -webkit-app-region: no-drag;
  padding: 8px 0;

  .topic-preset-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 14px 8px;
    color: var(--color-text-default);
    font-size: 12px;
    font-weight: 600;
  }

  .topic-preset-count {
    color: var(--color-text-light);
    font-weight: 400;
  }

  .topic-preset-empty {
    padding: 8px 14px 12px;
    color: var(--color-text-light);
    font-size: 12px;
    line-height: 1.5;
  }

  .topic-preset-list {
    max-height: 240px;
    overflow: auto;
  }

  .topic-preset-item {
    padding: 6px 14px;
    cursor: pointer;

    &:hover {
      background: var(--color-bg-leftbar_item);
    }
  }

  .topic-preset-name {
    color: var(--color-text-default);
    font-size: 13px;
    line-height: 1.4;
  }

  .topic-preset-topic {
    color: var(--color-text-light);
    font-size: 12px;
    line-height: 1.4;
    word-break: break-all;
  }

  .topic-preset-footer {
    padding: 8px 14px 4px;
    border-top: 1px solid var(--color-border-default);
    font-size: 12px;

    a {
      color: var(--color-main-green);
    }
  }
}
</style>
