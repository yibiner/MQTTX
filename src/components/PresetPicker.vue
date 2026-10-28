<template>
  <el-popover
    v-model="visible"
    :placement="placement"
    :width="360"
    trigger="click"
    popper-class="preset-picker-popper"
    @show="handleShow"
  >
    <div class="preset-picker-panel">
      <div class="preset-picker-head">
        <span>{{ title }}</span>
        <span class="preset-picker-count">{{ items.length }}</span>
      </div>

      <el-input
        v-if="items.length > SEARCH_THRESHOLD"
        ref="search"
        v-model="query"
        size="mini"
        clearable
        class="preset-picker-search"
        :placeholder="searchPlaceholder"
      ></el-input>

      <div v-if="!items.length" class="preset-picker-empty">{{ emptyText }}</div>
      <div v-else-if="!filtered.length" class="preset-picker-empty">{{ $t('configs.presetSearchEmpty') }}</div>
      <div v-else class="preset-picker-list">
        <div
          v-for="item in filtered"
          :key="item.id"
          :class="['preset-picker-item', { selected: item.id === selectedId }]"
          @click="choose(item)"
        >
          <div class="preset-picker-name">{{ item.name }}</div>
          <div v-if="item.summary" class="preset-picker-summary">{{ item.summary }}</div>
        </div>
      </div>

      <div v-if="manageTab" class="preset-picker-footer">
        <a href="javascript:;" @click="manage">{{ $t('configs.managePresets') }}</a>
      </div>
    </div>

    <el-button
      slot="reference"
      size="mini"
      native-type="button"
      :icon="icon"
      :class="['preset-picker-btn', { 'is-icon': !label && !bare, 'is-bare': bare }]"
      :title="label ? undefined : title"
    >
      <span v-if="label">{{ label }}</span>
    </el-button>
  </el-popover>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'

/** One row of the picker: the preset plus the one line that tells similar presets apart. */
export interface PresetOption {
  id: string
  name: string
  /** e.g. the topic of a topic preset, the trigger of a sequence, the match topic of a reply. */
  summary?: string
}

/**
 * The one picker every preset entry point uses: topics, messages, message sequences, reply rules.
 *
 * It exists because the app used to grow a bespoke control per preset kind - a row of buttons for
 * sequences, a fixed icon list for topics, an inline panel for messages - and none of them had a
 * way to find a preset once a user had more than a handful. Here the list is scrollable, searchable
 * once it is long enough to need it, shows a second line per preset, and links to the page that
 * edits them. Callers only supply rows and a title.
 *
 * The reference is either a labelled button or a bare icon, so the same picker fits a form field
 * and a toolbar.
 */
@Component
export default class PresetPicker extends Vue {
  @Prop({ required: true, default: () => [] }) private readonly items!: PresetOption[]
  @Prop({ required: true }) private readonly title!: string
  /** Text on the reference button. Without it the reference is an icon-only button. */
  @Prop({ type: String, default: '' }) private readonly label!: string
  @Prop({ type: String, default: 'el-icon-folder-opened' }) private readonly icon!: string
  @Prop({ required: true }) private readonly emptyText!: string
  @Prop({ type: String, default: '' }) private readonly searchPlaceholder!: string
  /** `/configs?tab=...` target of the "manage" link. Empty hides the link. */
  @Prop({ type: String, default: '' }) private readonly manageTab!: string
  /** Borderless icon, for toolbars whose neighbours have no box of their own. */
  @Prop({ type: Boolean, default: false }) private readonly bare!: boolean
  /** Id of the entry currently in use, highlighted in the list. */
  @Prop({ type: String, default: '' }) private readonly selectedId!: string
  @Prop({ type: String, default: 'bottom-start' }) private readonly placement!: string

  /** Below this many presets a search box is noise. */
  private readonly SEARCH_THRESHOLD = 8

  private visible = false
  private query = ''

  get filtered(): PresetOption[] {
    const query = this.query.trim().toLowerCase()
    if (!query) {
      return this.items
    }
    return this.items.filter(
      (item) => item.name.toLowerCase().includes(query) || (item.summary || '').toLowerCase().includes(query),
    )
  }

  @Watch('visible')
  private handleVisible(visible: boolean) {
    // A fresh search each time it opens: keeping the last query would hide the preset the user
    // came back for.
    if (!visible) {
      this.query = ''
    }
  }

  /** Parents reload their list here, so a preset added in another window shows up. */
  private handleShow() {
    this.query = ''
    this.$emit('show')
  }

  private choose(item: PresetOption) {
    this.$emit('select', item.id)
    this.visible = false
  }

  private manage() {
    this.visible = false
    const router = this.$router
    if (!router || !this.manageTab) {
      return
    }
    router.push({ path: '/configs', query: { tab: this.manageTab } }).catch(() => undefined)
  }
}
</script>

<style lang="scss">
.preset-picker-btn.el-button--mini {
  height: 32px;
  padding: 0 10px;
  color: var(--color-text-default);
  background: var(--color-bg-normal);
  border-color: var(--color-border-default);
  font-size: 12px;

  &:hover,
  &:focus {
    color: var(--color-main-green);
    border-color: var(--color-main-green);
    background: var(--color-bg-normal);
  }

  span {
    margin-left: 4px;
  }

  // Icon-only, next to a mini input or a toolbar button. Those neighbours are 28px; the labelled
  // "insert preset" button above stays 32px so it lines up with a form label.
  &.is-icon {
    width: 28px;
    height: 28px;
    padding: 0;
  }

  &.is-bare {
    width: 28px;
    height: 32px;
    margin-right: 8px;
    padding: 0;
    color: var(--color-text-light);
    background: transparent;
    border-color: transparent;

    &:hover,
    &:focus {
      color: var(--color-main-green);
      background: transparent;
      border-color: transparent;
    }
  }
}

.el-popover.preset-picker-popper {
  -webkit-app-region: no-drag;
  padding: 8px 0;

  .preset-picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 14px 8px;
    color: var(--color-text-default);
    font-size: 12px;
    font-weight: 600;
  }

  .preset-picker-count {
    color: var(--color-text-light);
    font-weight: 400;
  }

  .preset-picker-search {
    width: auto;
    margin: 0 14px 8px;
  }

  .preset-picker-empty {
    padding: 8px 14px 12px;
    color: var(--color-text-light);
    font-size: 12px;
    line-height: 1.5;
  }

  .preset-picker-list {
    max-height: 280px;
    overflow: auto;
  }

  .preset-picker-item {
    padding: 6px 14px;
    cursor: pointer;

    &:hover {
      background: var(--color-bg-leftbar_item);
    }

    &.selected .preset-picker-name {
      color: var(--color-main-green);
    }
  }

  .preset-picker-name {
    color: var(--color-text-default);
    font-size: 13px;
    line-height: 1.4;
  }

  .preset-picker-summary {
    color: var(--color-text-light);
    font-size: 12px;
    line-height: 1.4;
    word-break: break-all;
  }

  .preset-picker-footer {
    padding: 8px 14px 4px;
    border-top: 1px solid var(--color-border-default);
    font-size: 12px;

    a {
      color: var(--color-main-green);
    }
  }
}
</style>
