<template>
  <div class="auto-subscribe-editor">
    <div class="editor-head">
      <el-button type="text" icon="el-icon-plus" class="group-add" @click="addGroup">
        {{ $t('connections.autoSubscribeAddGroup') }}
      </el-button>
      <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
        <div slot="content" class="automation-tip">
          <p>{{ $t('connections.autoSubscribeDesc') }}</p>
          <p>{{ $t('connections.autoSubscribeMergeHint') }}</p>
        </div>
        <a href="javascript:;" class="editor-help">
          <i class="el-icon-warning-outline"></i>
        </a>
      </el-tooltip>
    </div>

    <div v-for="(group, index) in groups" :key="group.id" class="auto-subscribe-group">
      <div class="group-header">
        <div class="group-delay">
          <span class="field-label">{{ $t('connections.autoSubscribeDelay') }}</span>
          <el-input-number
            v-model="group.delayMs"
            size="mini"
            :min="0"
            :step="500"
            :controls="false"
            class="delay-input"
            @change="emitChange"
          ></el-input-number>
          <span class="field-unit">ms</span>
          <span class="quick-delays">
            <a
              v-for="quick in quickDelays"
              :key="quick"
              href="javascript:;"
              :class="['quick-delay', { active: Number(group.delayMs) === quick }]"
              @click="setDelay(index, quick)"
            >
              {{ quick }}
            </a>
          </span>
        </div>
        <div class="group-options">
          <el-checkbox v-model="group.merge" class="merge-checkbox" @change="emitChange">
            {{ $t('connections.autoSubscribeMerge') }}
          </el-checkbox>
          <el-tooltip :content="$t('connections.autoSubscribeEnableGroup')" placement="top" :effect="tooltipEffect">
            <el-switch
              v-model="group.enabled"
              active-color="#13ce66"
              inactive-color="#A2A9B0"
              @change="emitChange"
            ></el-switch>
          </el-tooltip>
          <a href="javascript:;" class="group-delete" @click="removeGroup(index)">
            <i class="el-icon-delete"></i>
          </a>
        </div>
      </div>

      <div v-for="(topic, topicIndex) in group.topics" :key="topicIndex" class="topic-row">
        <el-input
          v-model="topic.topic"
          size="mini"
          class="topic-input"
          :placeholder="topicPlaceholder"
          @input="emitChange"
        ></el-input>
        <el-select v-model="topic.qos" size="mini" class="topic-qos" @change="emitChange">
          <el-option v-for="qos in qosList" :key="qos" :label="'QoS ' + qos" :value="qos"></el-option>
        </el-select>
        <a href="javascript:;" class="topic-delete" @click="removeTopic(index, topicIndex)">
          <i class="el-icon-delete"></i>
        </a>
      </div>

      <el-button type="text" icon="el-icon-plus" class="topic-add" @click="addTopic(index)">
        {{ $t('connections.autoSubscribeAddTopic') }}
      </el-button>
    </div>
  </div>
</template>

<script lang="ts">
import { Component, Model, Vue, Watch } from 'vue-property-decorator'

const createId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const createTopic = (): AutoSubscribeTopicModel => ({ topic: '', qos: 0 })

const createGroup = (): AutoSubscribeGroupModel => ({
  id: createId(),
  delayMs: 0,
  merge: true,
  enabled: true,
  topics: [createTopic()],
})

/**
 * Editor for the automatic subscriptions of a connection / client preset.
 *
 * One group is "wait this long after the connection succeeded, then subscribe these topics". When
 * `merge` is set the topics of the group go out in a single SUBSCRIBE packet; a second group (with
 * its own delay, or with merge switched off) is sent separately, which is how a device is simulated
 * that first listens on one topic and only later on another.
 */
@Component
export default class AutoSubscribeEditor extends Vue {
  @Model('change', { type: Array }) private readonly value!: AutoSubscribeGroupModel[] | null | undefined

  /** Rows being edited, empty ones included: they are drafts until the user types into them. */
  private groups: AutoSubscribeGroupModel[] = []
  /** JSON of the last value this editor emitted, to recognise its own echo (see the watcher). */
  private lastEmitted = ''
  private quickDelays: number[] = [0, 500, 1000, 2000]
  private qosList: QoS[] = [0, 1, 2]

  get topicPlaceholder(): string {
    return this.$t('connections.autoSubscribeTopicPlaceholder') as string
  }

  /** Same light/dark choice as the other hints of the app (the tooltip must stay readable). */
  get tooltipEffect(): 'dark' | 'light' {
    const theme = (this as unknown as { $store?: { getters?: { currentTheme?: string } } }).$store?.getters
      ?.currentTheme
    return theme && theme !== 'light' ? 'light' : 'dark'
  }

  @Watch('value', { immediate: true })
  private handleValueChanged(value: AutoSubscribeGroupModel[] | null | undefined) {
    // The value that comes back is the *cleaned* copy this editor emitted: the row the user just
    // added is still empty, so it was stripped from it. Rebuilding the rows from that copy would
    // delete the row under the user's cursor the moment it is created, which made "添加一组" and
    // "添加 topic" look like dead buttons.
    const incoming = JSON.stringify(value ?? [])
    if (incoming === this.lastEmitted || incoming === JSON.stringify(this.groups ?? [])) {
      return
    }
    this.groups = this.clone(value ?? [])
    this.lastEmitted = incoming
  }

  private clone(groups: AutoSubscribeGroupModel[]): AutoSubscribeGroupModel[] {
    return JSON.parse(JSON.stringify(groups ?? []))
  }

  private isSameAsGroups(value: AutoSubscribeGroupModel[] | null | undefined): boolean {
    return JSON.stringify(value ?? []) === JSON.stringify(this.groups ?? [])
  }

  private emitChange() {
    // Strip the empty rows before they reach the connection record: a topic without a name is not
    // a subscription the user meant to configure. The stripped copy is only what is *saved*; the
    // editor keeps its drafts so a row that is still empty stays visible and editable.
    const cleaned = this.groups
      .map((group) => ({
        ...group,
        topics: (group.topics ?? []).filter((topic) => (topic.topic ?? '').trim() !== ''),
      }))
      .filter((group) => group.topics.length > 0)
    this.lastEmitted = JSON.stringify(cleaned)
    this.$emit('change', cleaned)
  }

  private setDelay(index: number, delayMs: number) {
    this.groups[index].delayMs = delayMs
    this.emitChange()
  }

  private addGroup() {
    this.groups.push(createGroup())
    this.emitChange()
  }

  private removeGroup(index: number) {
    this.groups.splice(index, 1)
    this.emitChange()
  }

  private addTopic(groupIndex: number) {
    this.groups[groupIndex].topics.push(createTopic())
    this.emitChange()
  }

  private removeTopic(groupIndex: number, topicIndex: number) {
    const topics = this.groups[groupIndex].topics
    topics.splice(topicIndex, 1)
    if (!topics.length) {
      // Keep the group: its delay and merge flag are configuration the user set, and deleting the
      // last row of a group should not silently drop them. An empty row keeps the group editable,
      // and the group itself is removed with its own delete button.
      topics.push(createTopic())
    }
    this.emitChange()
  }
}
</script>

<style lang="scss">
.auto-subscribe-editor {
  font-size: 12px;

  // The head row holds the add button and the hint. 32px matches a small form label, so in the
  // preset dialog the button sits on the same line as 「自动订阅」 instead of dropping below it.
  // The hint stays next to the button; pushing it to the far edge left it detached from both.
  .editor-head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    margin-bottom: 8px;
  }

  .editor-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 32px;
    color: var(--color-text-default);
    cursor: help;
    line-height: 1;
    font-size: 15px;
    &:hover {
      color: var(--color-main-green);
    }
  }

  .auto-subscribe-group {
    padding: 10px 12px;
    margin-bottom: 10px;
    border: 1px solid var(--color-border-default);
    border-radius: 4px;
    background: var(--color-bg-normal);
  }

  .group-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin-bottom: 8px;
  }

  .group-delay {
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    gap: 6px;
    min-height: 28px;
    .field-label {
      flex: none;
      width: 96px;
      margin-right: 4px;
      color: var(--color-text-default);
      line-height: 28px;
    }
    .delay-input.el-input-number--mini {
      width: 88px;
      flex: none;
      line-height: 26px;
      .el-input__inner {
        height: 28px;
        line-height: 28px;
        padding-left: 8px;
        padding-right: 8px;
      }
    }
  }

  .group-header .group-delay span.field-unit {
    flex: none;
    margin: 0;
    color: var(--color-text-light);
    line-height: 28px;
  }

  .quick-delays {
    display: inline-flex;
    align-items: center;
    flex: none;
    gap: 2px;
    height: 28px;
    .quick-delay {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 6px;
      color: var(--color-main-green);
      border-radius: 3px;
      line-height: 1;
      &.active {
        color: var(--color-text-active);
        background: var(--color-main-green);
      }
    }
  }

  .group-options {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
    flex: none;
    height: 28px;
    .merge-checkbox {
      display: inline-flex;
      align-items: center;
      height: 28px;
      margin-right: 0;
      font-size: 12px;
      font-weight: 400;
      color: var(--color-text-default);
      .el-checkbox__label {
        padding-left: 6px;
        font-size: 12px;
        font-weight: 400;
        line-height: 28px;
        color: var(--color-text-default);
      }
    }
    .group-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      color: var(--color-minor-red);
      line-height: 1;
    }
  }

  .topic-row {
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    gap: 8px;
    .topic-input {
      flex: 1;
      min-width: 0;
    }
    .topic-qos.el-select {
      width: 88px;
      flex: none;
    }
    .topic-delete {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      color: var(--color-minor-red);
      flex: none;
      line-height: 1;
    }
  }

  .topic-add,
  .group-add.el-button--text {
    height: 32px;
    padding: 0;
    font-size: 12px;
    line-height: 32px;
  }

  .topic-add {
    margin-bottom: 0;
  }
}
</style>
