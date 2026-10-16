<template>
  <span class="message-preview" :class="{ blank: !preview }">{{ preview || $t('configs.blankPayload') }}</span>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import { toSingleLinePreview } from '@/utils/data'

/**
 * A message shown inside a one-line table cell, as used by the message preset list.
 *
 * Messages saved from a formatted editor start with an indentation or a line break, and a table
 * cell only shows its first line: the row then looked empty and the message seemed not to be
 * configured at all. The preview is therefore collapsed to a single line, and a message without
 * any visible content gets an explicit placeholder instead of an empty cell.
 */
@Component
export default class MessagePreview extends Vue {
  @Prop({ default: '' }) public payload!: string

  get preview(): string {
    return toSingleLinePreview(this.payload)
  }
}
</script>

<style lang="scss">
.message-preview {
  display: block;
  overflow: hidden;
  // The cells using this component are `show-overflow-tooltip`, which clips them to one line: the
  // preview must not wrap either, otherwise only the (often blank) first line stays visible.
  white-space: nowrap;
  text-overflow: ellipsis;

  &.blank {
    color: var(--color-text-tips);
    font-style: italic;
  }
}
</style>
