<template>
  <div class="auto-subscribe-editor">
    <div v-for="(group, groupIndex) in groups" :key="group.id" class="group-card">
      <div class="group-header">
        <el-switch v-model="group.enabled" @change="emitChange" />
        <span class="group-title">{{ $t('connections.autoSubscribeGroupTitle') }} {{ groupIndex + 1 }}</span>

        <span class="group-field">
          <span class="field-label">{{ $t('connections.autoSubscribeDelay') }}</span>
          <el-input
            class="field-input"
            size="mini"
            type="number"
            :min="0"
            v-model.number="group.delayMs"
            @change="emitChange"
          />
          <span class="field-unit">ms</span>
        </span>

        <span class="group-field">
          <el-checkbox v-model="group.merge" @change="emitChange">
            {{ $t('connections.autoSubscribeMergeIntoOne') }}
          </el-checkbox>
        </span>

        <a class="group-remove" href="javascript:;" @click.prevent="removeGroup(groupIndex)">
          <i class="el-icon-delete"></i>
        </a>
      </div>

      <div v-for="(topic, topicIndex) in group.topics" :key="topicIndex" class="topic-row">
        <el-input
          class="topic-input"
          size="mini"
          :placeholder="$t('connections.autoSubscribeTopicPlaceholder')"
          v-model="topic.topic"
          @change="emitChange"
        />
        <el-select class="qos-select" size="mini" v-model.number="topic.qos" @change="emitChange">
          <el-option :label="'QoS 0'" :value="0" />
          <el-option :label="'QoS 1'" :value="1" />
          <el-option :label="'QoS 2'" :value="2" />
        </el-select>
        <a class="topic-remove" href="javascript:;" @click.prevent="removeTopic(group, topicIndex)">
          <i class="el-icon-close"></i>
        </a>
      </div>

      <a class="add-topic" href="javascript:;" @click.prevent="addTopic(group)">
        <i class="el-icon-plus"></i>
        <span>{{ $t('connections.autoSubscribeAddTopic') }}</span>
      </a>
    </div>

    <div class="editor-actions">
      <a class="add-group" href="javascript:;" @click.prevent="addGroup">
        <i class="el-icon-plus"></i>
        <span>{{ $t('connections.autoSubscribeAddGroup') }}</span>
      </a>
      <HintIcon :text="$t('connections.autoSubscribeHint')" />
    </div>

  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import { v4 as uuidv4 } from 'uuid'
import HintIcon from '@/components/HintIcon.vue'

/**
 * Editor for the automatic subscriptions of a connection ("自动订阅").
 *
 * The groups are stored on the connection itself and executed after connecting, so a device can be
 * simulated that comes online and only then starts listening. Every group has its own delay, which
 * is what makes several devices appear gradually instead of all at once.
 *
 * Kept independent of the connection record: the parent passes the list in and receives a new list
 * back, so the same editor can be reused from a preset or a behaviour template later.
 */
@Component({
  components: { HintIcon },
})
export default class AutoSubscribeEditor extends Vue {
  @Prop({ default: () => [] }) private value!: AutoSubscribeGroupModel[]

  private groups: AutoSubscribeGroupModel[] = []

  /**
   * The list just emitted drops topics that are still empty. The parent writes that list back, and
   * this token keeps those half-typed rows instead of treating the write-back as a new load.
   */
  private echoToken = 0

  private pendingEcho = -1

  @Watch('value', { immediate: true })
  private syncFromParent(val: AutoSubscribeGroupModel[]) {
    const incoming = (val ?? []).map((group) => ({
      ...group,
      topics: (group.topics ?? []).map((topic) => ({ ...topic })),
    }))
    const isEcho = this.pendingEcho === this.echoToken && this.echoToken !== 0
    this.pendingEcho = -1
    if (!isEcho) {
      this.groups = incoming
      return
    }
    this.groups = incoming.map((group) => {
      const local = this.groups.find((item) => item.id === group.id)
      const drafts = (local?.topics ?? []).filter((topic) => (topic.topic ?? '').trim() === '')
      return { ...group, topics: [...group.topics, ...drafts] }
    })
  }

  private createTopic(): AutoSubscribeTopicModel {
    return { topic: '', qos: 0 } as AutoSubscribeTopicModel
  }

  private createGroup(): AutoSubscribeGroupModel {
    return {
      id: uuidv4(),
      enabled: true,
      delayMs: 0,
      merge: false,
      topics: [this.createTopic()],
    } as AutoSubscribeGroupModel
  }

  private addGroup() {
    this.groups.push(this.createGroup())
    this.emitChange()
  }

  private removeGroup(index: number) {
    this.groups.splice(index, 1)
    this.emitChange()
  }

  private addTopic(group: AutoSubscribeGroupModel) {
    group.topics.push(this.createTopic())
    this.emitChange()
  }

  private removeTopic(group: AutoSubscribeGroupModel, index: number) {
    group.topics.splice(index, 1)
    this.emitChange()
  }

  private emitChange() {
    // A topic row with an empty topic is a half-typed row: keep it in the editor, drop it from what
    // is saved, so planConnectSubscriptions never sees a subscription to "".
    const cleaned = this.groups.map((group) => ({
      ...group,
      delayMs: Number.isFinite(group.delayMs) ? Math.max(0, Number(group.delayMs)) : 0,
      topics: (group.topics ?? []).filter((topic) => (topic.topic ?? '').trim() !== ''),
    }))
    this.pendingEcho = ++this.echoToken
    this.$emit('input', cleaned)
  }
}
</script>

<style scoped>
.editor-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.auto-subscribe-editor {
  font-size: 13px;
}

.group-card {
  border: 1px solid var(--color-border-default, #dcdfe6);
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 8px;
}

.group-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 6px;
}

.group-title {
  font-weight: 600;
}

.group-field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.field-label,
.field-unit {
  color: #909399;
  font-size: 12px;
}

.field-input {
  width: 90px;
}

.group-remove,
.topic-remove {
  color: #909399;
  margin-left: auto;
}

.topic-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.topic-input {
  flex: 1;
}

.qos-select {
  width: 90px;
}

.add-topic,
.add-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #409eff;
  font-size: 12px;
}

.add-group {
  margin-top: 4px;
}

</style>
