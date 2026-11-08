<template>
  <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
    <div slot="content" class="hint-tooltip">
      <p v-for="(line, index) in lines" :key="index">{{ line }}</p>
    </div>
    <a href="javascript:;" class="hint-icon" @click.prevent>
      <i class="el-icon-warning-outline"></i>
    </a>
  </el-tooltip>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import { Getter } from 'vuex-class'

/**
 * The small "?" icon with a tooltip, the way the desktop app shows every explanation.
 *
 * Why a component instead of repeating the markup: the explanation used to be a paragraph under the
 * editor here, which pushed the form down and read as body text instead of help. The desktop build
 * keeps the same text behind an icon, and both builds should behave alike.
 *
 * `text` is a single string; a caller that has several paragraphs passes an array.
 */
@Component
export default class HintIcon extends Vue {
  @Prop({ required: true }) private text!: string | string[]

  @Getter('currentTheme') private theme!: Theme

  get lines(): string[] {
    return Array.isArray(this.text) ? this.text : [this.text]
  }

  /** Same light/dark choice as the rest of the app, so the tooltip stays readable on dark themes. */
  get tooltipEffect(): 'dark' | 'light' {
    return this.theme && this.theme !== 'light' ? 'light' : 'dark'
  }
}
</script>

<style scoped>
.hint-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-text-light, #909399);
  cursor: help;
  line-height: 1;
  font-size: 14px;
}

.hint-icon:hover {
  color: var(--color-main-green, #00b173);
}

.hint-tooltip p {
  margin: 0 0 4px;
  line-height: 1.5;
}

.hint-tooltip p:last-child {
  margin-bottom: 0;
}
</style>
