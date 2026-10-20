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

    <p v-if="!groups.length" class="empty-hint">{{ $t('connections.autoSubscribeEmpty') }}</p>

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

  .editor-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  // Same hint affordance as elsewhere in the app (settings, connection form): a "!" icon that
  // opens the explanation on hover.
  .editor-help {
    color: var(--color-text-default);
    cursor: help;
    line-height: 1;
    font-size: 15px;
    &:hover {
      color: var(--color-main-green);
    }
  }

  .auto-subscribe-group {
    padding: 10px 12px 4px;
    margin-bottom: 10px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    background: #fafbfc;
  }

  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }

  .group-delay {
    display: flex;
    align-items: center;
    .field-label {
      margin-right: 6px;
      color: #606266;
    }
    .delay-input {
      width: 76px;
    }
    .field-unit {
      margin: 0 8px 0 4px;
      color: #909399;
    }
  }

  .quick-delays {
    display: flex;
    align-items: center;
    gap: 2px;
    .quick-delay {
      padding: 0 5px;
      color: #409eff;
      border-radius: 3px;
      &.active {
        color: #fff;
        background: #409eff;
      }
    }
  }

  .group-options {
    display: flex;
    align-items: center;
    gap: 10px;
    .merge-checkbox {
      margin-right: 0;
    }
    .group-delete {
      color: #f56c6c;
    }
  }

  .topic-row {
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    gap: 8px;
    .topic-input {
      flex: 1;
    }
    .topic-qos {
      width: 88px;
      flex: none;
    }
    .topic-delete {
      color: #f56c6c;
      flex: none;
    }
  }

  .topic-add,
  .group-add {
    padding: 0;
    font-size: 12px;
  }

  .topic-add {
    margin-bottom: 4px;
  }

  .empty-hint {
    margin: 0;
    color: #909399;
    font-size: 12px;
    line-height: 1.6;
  }
}
</style>
