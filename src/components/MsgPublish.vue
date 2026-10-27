<template>
  <div class="msg-publish message" v-click-outside="handleClickOutSide">
    <div class="publish-top">
      <transition name="el-zoom-in-bottom">
        <div v-if="showMetaCard">
          <el-card class="meta-card">
            <el-form ref="form" label-width="185px" label-position="left" :model="MQTT5PropsForm" :rules="rules">
              <el-row class="form-row" :gutter="20">
                <el-col :span="24">
                  <KeyValueEditor
                    :title="$t('connections.userProperties')"
                    v-model="MQTT5PropsForm.userProperties"
                    maxHeight="140px"
                  />
                </el-col>
                <el-col :span="24">
                  <el-form-item :label="$t('connections.contentType')" prop="contentType">
                    <el-input size="mini" v-model="MQTT5PropsForm.contentType"></el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item :label="$t('connections.payloadFormatIndicator')" prop="payloadFormatIndicator">
                    <el-switch
                      size="mini"
                      v-model="MQTT5PropsForm.payloadFormatIndicator"
                      active-color="#13ce66"
                      inactive-color="#A2A9B0"
                    ></el-switch>
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item
                    :label="`${$t('connections.messageExpiryInterval')}(${$t('common.unitS')})`"
                    prop="messageExpiryInterval"
                  >
                    <el-input
                      v-model.number="MQTT5PropsForm.messageExpiryInterval"
                      size="mini"
                      :min="0"
                      type="number"
                    />
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item :label="$t('connections.topicAlias')" prop="topicAlias">
                    <el-input v-model.number="MQTT5PropsForm.topicAlias" size="mini" :min="1" type="number" />
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item :label="$t('connections.responseTopic')" prop="responseTopic">
                    <div class="topic-preset-field">
                      <el-input size="mini" v-model="MQTT5PropsForm.responseTopic" type="text" />
                      <TopicPresetPicker @select="applyResponseTopic" />
                    </div>
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item :label="$t('connections.correlationData')" prop="correlationData">
                    <el-input size="mini" v-model="MQTT5PropsForm.correlationData" type="text" />
                  </el-form-item>
                </el-col>
                <el-col :span="24">
                  <el-form-item :label="$t('connections.subscriptionIdentifier')" prop="subscriptionIdentifier">
                    <el-input size="mini" type="number" v-model.number="MQTT5PropsForm.subscriptionIdentifier">
                    </el-input>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
            <div class="dropdown-btn">
              <el-button size="mini" class="dropdown-btn-reset" type="text" @click="showMetaCard = false">{{
                $t('common.cancel')
              }}</el-button>
              <el-button
                size="mini"
                class="dropdown-btn-submit"
                type="text"
                :loading="saveMetaLoading"
                @click="saveMeta"
                >{{ $t('common.save') }}</el-button
              >
            </div>
          </el-card>
        </div>
      </transition>
    </div>
    <div class="publish-header">
      <div class="publish-metadata">
        <el-select class="payload-select" size="mini" v-model="payloadType">
          <el-option-group :label="$t('connections.publishPayloadEncodedBy')">
            <el-option v-for="(type, index) in payloadOptions" :key="index" :label="type" :value="type"> </el-option>
          </el-option-group>
        </el-select>
        <el-select class="qos-select" size="mini" v-model="msgRecord.qos">
          <el-option v-for="qos in [0, 1, 2]" :key="qos" :label="`QoS ${qos}`" :value="qos">
            <span style="float: left">{{ qos }}</span>
            <span style="float: right; color: #8492a6; margin-left: 12px">{{ $t(`connections.qos${qos}`) }}</span>
          </el-option>
        </el-select>
        <el-tooltip
          placement="top"
          :open-delay="500"
          :effect="currentTheme !== 'light' ? 'light' : 'dark'"
          :content="$t('configs.selectMessagePreset')"
        >
          <el-popover
            v-model="msgPresetPanelVisible"
            placement="bottom-end"
            :width="300"
            trigger="click"
            popper-class="msg-preset--popper"
            @show="loadMessagePresets"
          >
            <div class="msg-preset-panel">
              <div class="msg-preset-panel-head">
                <span>{{ $t('configs.messagePresets') }}</span>
                <span class="msg-preset-panel-count">{{ messagePresets.length }}</span>
              </div>
              <div v-if="messagePresets.length === 0" class="msg-preset-panel-empty">
                {{ $t('configs.empty') }}
              </div>
              <div
                v-for="preset in messagePresets"
                :key="preset.id"
                class="msg-preset-panel-item"
                @click="applyMessagePreset(preset)"
              >
                <i class="el-icon-collection msg-preset-panel-icon"></i>
                <div class="msg-preset-panel-info">
                  <div class="msg-preset-panel-name">{{ preset.name }}</div>
                  <div class="msg-preset-panel-topic">{{ preset.topic }}</div>
                </div>
              </div>
              <div class="msg-preset-panel-footer">
                <a href="javascript:;" @click="gotoManagePresets">{{ $t('configs.managePresets') }}</a>
              </div>
            </div>
            <el-button
              slot="reference"
              size="mini"
              class="dropdown-btn msg-preset-btn"
              icon="el-icon-collection"
              :class="{ 'dropdown-btn-active': msgPresetPanelVisible }"
            >
            </el-button>
          </el-popover>
        </el-tooltip>
        <el-tooltip
          placement="top"
          :open-delay="500"
          :effect="currentTheme !== 'light' ? 'light' : 'dark'"
          :content="$t('connections.timedMessage')"
        >
          <el-badge :value="timedMessages.length" :hidden="timedMessages.length === 0" class="timed-badge">
            <el-popover
              ref="timedPanel"
              placement="bottom-end"
              :width="320"
              trigger="click"
              popper-class="timed-panel--popper"
              @show="timedPanelVisible = true"
              @hide="timedPanelVisible = false"
            >
              <div class="timed-panel">
                <div class="timed-panel-head">
                  <span>{{ $t('connections.timedMessage') }}</span>
                  <span class="timed-panel-count">{{ timedMessages.length }}</span>
                </div>
                <div v-if="timedMessages.length === 0" class="timed-panel-empty">
                  {{ $t('connections.timedMessageEmpty') }}
                </div>
                <div v-for="item in timedMessages" :key="item.id" class="timed-panel-item">
                  <i class="iconfont icon-timed-message timed-panel-icon"></i>
                  <div class="timed-panel-item-info">
                    <div class="timed-panel-item-interval">
                      {{ $t('connections.timedMessageEvery', { n: item.interval }) }}
                      <span class="timed-panel-item-next">
                        {{ $t('connections.timedMessageNext', { time: nextSendTime(item.nextSendAt) }) }}
                      </span>
                    </div>
                    <div class="timed-panel-item-topic" :title="item.topic">{{ item.topic }}</div>
                    <!-- Paused: this task needs the connection page (script / schema / properties). -->
                    <div v-if="item.degraded" class="timed-panel-item-paused">
                      {{ $t('connections.timedMessagePaused') }}
                    </div>
                  </div>
                  <i
                    class="el-icon-close timed-panel-stop"
                    :title="$t('connections.stopTimedMessage')"
                    @click.stop="$emit('handleStopTimedMessage', item.id)"
                  ></i>
                </div>
                <div class="timed-panel-footer">
                  <el-input-number
                    v-model="newTimedInterval"
                    class="timed-panel-input"
                    size="mini"
                    controls-position="right"
                    :min="1"
                  />
                  <el-button size="mini" type="primary" :disabled="!clientConnected" @click="handleStartTimedMessage">
                    {{ $t('connections.timedMessageStart') }}
                  </el-button>
                </div>
                <div class="timed-panel-hint">{{ $t('connections.timedMessageHint') }}</div>
              </div>
              <el-button
                slot="reference"
                size="mini"
                class="dropdown-btn timed-btn"
                :class="{ 'dropdown-btn-active': timedPanelVisible || timedMessages.length > 0 }"
                icon="iconfont icon-timed-message"
              >
              </el-button>
            </el-popover>
          </el-badge>
        </el-tooltip>
        <el-dropdown class="actions-dropdown" placement="top-end" trigger="click" @command="handleActionCommand">
          <el-button class="dropdown-btn actions-btn" type="outline" plain size="mini" icon="el-icon-more"> </el-button>
          <el-dropdown-menu class="connection-oper-item" slot="dropdown">
            <el-dropdown-item command="toggleRetain">
              <i :class="msgRecord.retain ? 'el-icon-check retain-on' : 'el-icon-close retain-off'"></i>Retain
            </el-dropdown-item>
            <el-dropdown-item command="meta" :disabled="!mqtt5PropsEnable">
              <i class="el-icon-setting"></i>Meta
            </el-dropdown-item>
            <el-dropdown-item command="clearRetainedMessage" :disabled="!clientConnected">
              <i class="iconfont icon-delete"></i>{{ $t('connections.clearRetainedMessage') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </el-dropdown>
        <div class="history-button-group">
          <el-tooltip
            :content="$t('connections.previousPayload')"
            placement="top"
            :open-delay="500"
            :effect="currentTheme !== 'light' ? 'light' : 'dark'"
          >
            <el-button
              :disabled="historyIndex <= 0"
              size="mini"
              icon="el-icon-arrow-left"
              class="history-btn history-btn-left"
              @click="decrease"
            ></el-button>
          </el-tooltip>
          <el-tooltip
            :content="$t('connections.payloadHistory')"
            placement="top"
            :open-delay="500"
            :effect="currentTheme !== 'light' ? 'light' : 'dark'"
          >
            <el-popover
              placement="bottom-end"
              :width="historyPanelWidth"
              trigger="click"
              popper-class="history-panel--popper"
              @show="handleHistoryPanelShow"
              @hide="handleHistoryPanelHide"
            >
              <div class="history-panel">
                <div v-if="historyRecords.length === 0" class="history-panel-empty">0/0</div>
                <!--
                  Only built while the panel is open: every record's payload would otherwise live
                  in the DOM (and in memory) even though the popover is merely hidden with v-show.
                -->
                <template v-if="historyPanelVisible">
                  <div
                    v-for="(item, index) in historyRecords"
                    :key="item.id"
                    :class="['history-panel-item', { active: index === historyIndex }]"
                    @click="handleHistoryItemClick(item, index)"
                  >
                    <div class="history-panel-item-main">
                      <span class="history-panel-topic" :title="item.topic">{{ item.topic }}</span>
                      <span class="history-panel-meta">QoS:{{ item.qos }}</span>
                      <span class="history-panel-meta">retain:{{ item.retain ? '1' : '0' }}</span>
                      <i
                        class="el-icon-close history-panel-delete"
                        :title="$t('common.delete')"
                        @click.stop.prevent="handleDeleteHistoryHeader(item)"
                      ></i>
                    </div>
                    <div class="history-panel-item-sub">
                      <span class="history-panel-payload" :class="{ empty: !item.payload }">{{
                        historyPayloadTexts[index]
                      }}</span>
                    </div>
                  </div>
                </template>
              </div>
              <el-button
                slot="reference"
                size="mini"
                class="history-btn history-btn-center"
                :class="{ 'history-btn-active': historyPanelVisible }"
              >
                <span>{{
                  historyIndex === -1 || historyRecords.length === 0
                    ? '0/0'
                    : historyIndex + 1 + '/' + historyRecords.length
                }}</span>
                <i class="el-icon-arrow-down history-btn-caret"></i>
              </el-button>
            </el-popover>
          </el-tooltip>
          <el-tooltip
            :content="$t('connections.nextPayload')"
            placement="top"
            :open-delay="500"
            :effect="currentTheme !== 'light' ? 'light' : 'dark'"
          >
            <el-button
              :disabled="historyIndex >= historyRecords.length - 1 || historyIndex === -1"
              size="mini"
              icon="el-icon-arrow-right"
              class="history-btn history-btn-right"
              @click="increase"
            ></el-button>
          </el-tooltip>
        </div>
      </div>
      <div :class="['topic-input-container', topicRequired ? 'required' : '']">
        <el-input
          class="publish-topic-input"
          placeholder="Topic"
          v-model="msgRecord.topic"
          @focus="handleInputFocus"
          @blur="handleInputBlur"
        >
        </el-input>
        <TopicPresetPicker bare @select="applyTopicPreset" />
      </div>
    </div>
    <div class="editor-container">
      <div
        class="publish-footer"
        :style="{
          height: `${editorHeight}px`,
        }"
      >
        <Editor
          ref="payloadEditor"
          id="payload"
          :lang="payloadLang"
          v-model="msgRecord.payload"
          :useShadows="true"
          @enter-event="send"
          @format="formatJsonValue"
        />
      </div>
      <a href="javascript:;" class="send-btn" @click="send">
        <i class="iconfont icon-send"></i>
      </a>
    </div>
    <div v-if="disabled" class="disabled-mask" @click.stop></div>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator'
import { ipcRenderer, IpcRendererEvent } from 'electron'
import { Getter } from 'vuex-class'
import ClickOutside from 'vue-click-outside'
import Editor from '@/components/Editor.vue'
import KeyValueEditor from '@/components/KeyValueEditor.vue'
import TopicPresetPicker from '@/components/TopicPresetPicker.vue'
import convertPayload from '@/utils/convertPayload'
import { getMessageId } from '@/utils/idGenerator'
import _ from 'lodash'
import validFormatJson from '@/utils/validFormatJson'
import useServices from '@/database/useServices'
import time from '@/utils/time'
import { emptyToNull } from '@/utils/handleString'
import { getMessagePresets } from '@/utils/configProfiles'

@Component({
  components: {
    Editor,
    KeyValueEditor,
    TopicPresetPicker,
  },
  directives: {
    ClickOutside,
  },
})
export default class MsgPublish extends Vue {
  @Prop({ required: true }) public editorHeight!: number
  @Prop({ default: false }) public disabled!: boolean
  @Prop({ default: false }) public mqtt5PropsEnable!: boolean
  @Prop({ default: false }) public clientConnected!: boolean
  @Prop({ default: () => [] }) public timedMessages!: TimedMessageRuntime[]

  @Getter('currentTheme') private currentTheme!: Theme

  private MQTT5PropsForm: PushPropertiesModel = {}

  private MQTT5PropsSend: PushPropertiesModel = {}

  private showMetaCard = false

  private saveMetaLoading = false

  private topicRequired = false

  private timedPanelVisible = false

  private newTimedInterval: number | undefined = 10

  private msgPresetPanelVisible = false

  private messagePresets: MessagePresetModel[] = []

  private isValidProp(value: any) {
    return value !== null && value !== undefined && value !== false
  }

  private getHasMqtt5PropState() {
    return Object.values(this.MQTT5PropsForm).some(this.isValidProp)
  }

  private async saveMeta() {
    this.saveMetaLoading = true
    await this.updatePushProp()
    this.saveMetaLoading = false
    this.showMetaCard = false
    this.hasMqtt5Prop = this.getHasMqtt5PropState()
  }

  private changeVisable() {
    this.showMetaCard = !this.showMetaCard
  }

  get rules() {
    return {}
  }

  private hasMqtt5Prop = false

  private historyRecords: HistoryMessageHeaderModel[] = []
  private historyIndex = -1
  // Set right before a history record is applied, so the payloadType watcher does not
  // "convert" a payload that already is in the stored format.
  private suppressPayloadTypeConversion = false
  private defaultMsgRecord: MessageModel = {
    createAt: time.getNowDate(),
    out: true,
    qos: 0,
    retain: false,
    topic: '',
    payload: JSON.stringify({ msg: 'hello' }, null, 2),
  }
  public msgRecord: MessageModel = _.cloneDeep(this.defaultMsgRecord)
  private payloadLang = 'json'
  private payloadType: PayloadType = 'JSON'
  private payloadOptions: PayloadType[] = ['Plaintext', 'JSON', 'Base64', 'Hex', 'CBOR', 'MsgPack']
  private historyPanelVisible = false
  private historyPanelWidth = 360

  @Watch('editorHeight')
  private handleHeightChanged() {
    this.handleLayout()
  }
  @Watch('payloadType')
  private handleTypeChange(val: PayloadType, oldVal: PayloadType) {
    const { payload } = this.msgRecord
    if (['CBOR', 'JSON', 'MsgPack'].includes(val)) {
      this.payloadLang = 'json'
    } else {
      this.payloadLang = 'plaintext'
    }
    if (this.suppressPayloadTypeConversion) {
      // The payload was just restored from a history record and already is in this format.
      this.suppressPayloadTypeConversion = false
      return
    }
    if (payload === '') {
      return
    }
    convertPayload(payload.toString(), val, oldVal)
      .then((res) => {
        this.msgRecord.payload = res
      })
      .catch((error: Error) => {
        const errorMsg = error.toString()
        this.$message.error(errorMsg)
        this.payloadType = oldVal
      })
  }
  @Watch('disabled', { immediate: true, deep: true })
  private handleDisabledChange(val: boolean) {
    if (val) {
      ipcRenderer.removeAllListeners('sendPayload')
    }
  }
  @Watch('historyIndex', { immediate: true, deep: true })
  private handleHistoryIndexChange(val: number, lastval: number) {
    if (lastval !== val && val >= 0 && val < this.historyRecords.length) {
      this.applyHistoryRecord(this.historyRecords[val])
    }
  }

  /**
   * Applies a history record to the publish form: the topic *and* the message are restored
   * together, which is the whole point of storing them as one record.
   */
  private applyHistoryRecord(record: HistoryMessageHeaderModel) {
    if (!record) {
      return
    }
    const { retain, topic, qos, payload, payloadType } = record

    // Only overwrite the editor content when the record actually carries a message, so legacy
    // records (and records saved with "save message" disabled) keep the current payload.
    if (payload !== undefined && payload !== null) {
      this.msgRecord.payload = payload
      const nextType = (payloadType ?? this.payloadType) as PayloadType
      if (nextType !== this.payloadType) {
        this.suppressPayloadTypeConversion = true
        this.payloadType = nextType
      }
    }

    Object.assign(this.msgRecord, { retain, topic, qos })
  }

  /**
   * The payload is shown in full, never truncated. All consecutive whitespace (including JSON
   * line breaks and indentation) is collapsed into a single space, so every record stays one
   * compact paragraph; long lines simply wrap.
   *
   * Computed once per record list instead of once per render: collapsing megabytes of payload on
   * every keystroke (each re-render re-evaluated the whole list) froze the publish panel.
   * Indexed by position, mirroring the order of `historyRecords`.
   */
  private get historyPayloadTexts(): string[] {
    return this.historyRecords.map((record) => {
      const payload = record.payload
      return payload === undefined || payload === null || payload === ''
        ? (this.$t('connections.historyNoMessage') as string)
        : String(payload).replace(/\s+/g, ' ').trim()
    })
  }

  /**
   * Notice:
   *
   * When we switch between the `creation page` and `connection page`, the Monaco editor is not initialized or destroyed.
   * Instead, we use `v-show` to hide the `MsgPublish` component.
   * Therefore, we need to manually create and destroy the editor by listening to the route.
   *
   * Relevant PRs:
   * - https://github.com/emqx/MQTTX/pull/518
   * - https://github.com/emqx/MQTTX/pull/446
   */
  @Watch('$route.params.id', { immediate: true, deep: true })
  private async handleIdChanged(to: string, from: string) {
    const editorRef = this.$refs.payloadEditor as Editor
    if (to && from === '0' && to !== '0') {
      // Initialize the editor when the route jumps from the creation page
      editorRef.initEditor()
    } else if (from && from !== '0' && to === '0') {
      // Destroy the editor when the route jumps to the creation page
      editorRef.destroyEditor()
    }
    this.loadProperties()
  }

  @Watch('mqtt5PropsEnable')
  private async handleMqtt5Enable(val: boolean) {
    if (val) {
      this.loadProperties()
    }
  }

  /**
   * The history panel is as wide as the message window and hugs its right edge, so even long
   * topics and payloads stay readable. Recomputed while open so it stays adaptive.
   */
  private handleHistoryPanelShow() {
    this.historyPanelVisible = true
    this.updateHistoryPanelWidth()
    window.addEventListener('resize', this.updateHistoryPanelWidth)
  }

  private handleHistoryPanelHide() {
    this.historyPanelVisible = false
    window.removeEventListener('resize', this.updateHistoryPanelWidth)
  }

  private updateHistoryPanelWidth() {
    const root = this.$el as HTMLElement | undefined
    if (!root) {
      return
    }
    const width = Math.round(root.getBoundingClientRect().width)
    if (width > 0) {
      this.historyPanelWidth = width
    }
  }

  private handleHistoryItemClick(item: HistoryMessageHeaderModel, index: number) {
    this.applyHistoryRecord(item)
    this.historyIndex = index
    // The panel deliberately stays open: picking another record right away is the common case.
  }

  private async handleDeleteHistoryHeader(item: HistoryMessageHeaderModel) {
    if (!item.id) {
      return
    }
    const { historyMessageHeaderService } = useServices()
    await historyMessageHeaderService.delete(item.id)
    await this.loadHistoryData()
  }

  /**
   * Manually create and destroy the editor for the parent component.
   * Note: This function destroys the editor instance.
   */
  public editorDestory() {
    const editorRef = this.$refs.payloadEditor as Editor
    editorRef.destroyEditor()
  }

  public editorInit() {
    const editorRef = this.$refs.payloadEditor as Editor
    editorRef.initEditor()
  }

  private async updatePushProp() {
    this.MQTT5PropsForm = emptyToNull(this.MQTT5PropsForm)
    this.MQTT5PropsSend = _.cloneDeep(this.MQTT5PropsForm)
    const propRecords = Object.entries(this.MQTT5PropsForm).filter(([_, v]) => v !== null && v !== undefined && v !== 0)
    const props = Object.fromEntries(propRecords)
    const { connectionService } = useServices()
    return await connectionService.addPushProp(props, this.$route.params.id)
  }

  private async send() {
    this.msgRecord.id = getMessageId()
    this.msgRecord.createAt = time.getNowDate()
    this.mqtt5PropsEnable && (this.msgRecord.properties = this.MQTT5PropsSend)
    if (!this.clientConnected) {
      this.$notify({
        title: this.$tc('connections.notConnect'),
        message: '',
        type: 'error',
        duration: 3000,
        offset: 30,
      })
      return
    }
    if (!this.msgRecord.topic && !this.msgRecord?.properties?.topicAlias) {
      this.topicRequired = true
      this.$notify({
        title: this.$tc('connections.topicRequired'),
        message: '',
        type: 'warning',
        duration: 3000,
        offset: 30,
      })
      return
    }
    if (this.msgRecord.topic.includes('+') || this.msgRecord.topic.includes('#')) {
      this.$notify({
        title: this.$tc('connections.topicCannotContain'),
        message: '',
        type: 'warning',
        duration: 3000,
        offset: 30,
      })
      return
    }
    this.$emit('handleSend', this.msgRecord, this.payloadType, this.handleAfterPublish)
  }

  private handleInputFocus() {
    if (this.topicRequired) {
      this.topicRequired = false
    }
    ipcRenderer.on('sendPayload', () => {
      this.send()
    })
    this.$emit('focus')
  }

  private handleInputBlur() {
    if (this.topicRequired) {
      this.topicRequired = false
    }
    ipcRenderer.removeAllListeners('sendPayload')
  }

  private handleLayout() {
    const editorRef = this.$refs.payloadEditor as Editor
    editorRef.editorLayout()
  }

  /**
   * Refreshes the stored records.
   *
   * @param isNewPayload unused by the refresh itself, kept for the after-send callback contract
   * @param isLoadData true while (re)mounting, so the latest record's payload type is adopted
   * @param focusRecordId the record that was just written; when given, the history cursor moves
   *                      to exactly that record instead of blindly to the last row. The last row
   *                      is not necessarily the newest record, and applying the wrong one used to
   *                      replace the topic and message the user had just published.
   */
  private async loadHistoryData(isNewPayload?: boolean, isLoadData?: boolean, focusRecordId?: string | null) {
    const { historyMessageHeaderService } = useServices()
    const historyRecords = (await historyMessageHeaderService.getAll()) ?? []
    const latestRecord = historyRecords[historyRecords.length - 1]
    if (latestRecord && isLoadData && latestRecord.payloadType && latestRecord.payloadType !== this.payloadType) {
      // The payload of the latest record is applied right after this call, so it must not be
      // re-encoded by the payloadType watcher.
      this.suppressPayloadTypeConversion = true
      this.payloadType = latestRecord.payloadType as PayloadType
    }
    this.historyRecords = historyRecords

    const focusedIndex = focusRecordId ? historyRecords.findIndex((record) => record.id === focusRecordId) : -1
    if (focusedIndex !== -1) {
      this.historyIndex = focusedIndex
    } else if (this.historyIndex > this.historyRecords.length - 1) {
      // Keep the index valid after records were deleted or trimmed.
      this.historyIndex = this.historyRecords.length - 1
    }
  }

  /**
   * Called by the connection view once a publish finished: refresh the list and keep the cursor
   * on the record that was written (which is the one currently in the editor).
   */
  private handleAfterPublish(isNewPayload: boolean, recordId?: string | null) {
    this.loadHistoryData(isNewPayload, false, recordId)
  }

  private async loadData() {
    await this.loadHistoryData(false, true)
    this.historyIndex = this.historyRecords.length - 1
    const latestRecord = this.historyRecords[this.historyRecords.length - 1]
    Object.assign(this.msgRecord, this.defaultMsgRecord)
    if (latestRecord) {
      this.applyHistoryRecord(latestRecord)
    }
    this.loadProperties()
  }

  private async loadProperties() {
    this.MQTT5PropsForm = {}
    if (this.mqtt5PropsEnable) {
      const { connectionService } = useServices()
      const pushProps = await connectionService.getPushProp(this.$route.params.id)
      if (pushProps) {
        this.MQTT5PropsForm = pushProps
        this.MQTT5PropsSend = _.cloneDeep(this.MQTT5PropsForm)
        this.hasMqtt5Prop = this.getHasMqtt5PropState()
      }
    }
  }

  private formatJsonValue() {
    try {
      let jsonValue: string | undefined = validFormatJson(this.msgRecord.payload.toString())
      if (jsonValue) {
        this.msgRecord.payload = jsonValue
      }
    } catch (error) {
      this.$message.error((error as Error).toString())
    }
  }

  private decrease() {
    this.historyIndex = this.historyIndex - 1 >= 0 ? this.historyIndex - 1 : 0
  }

  private increase() {
    this.historyIndex =
      this.historyIndex + 1 <= this.historyRecords.length - 1 ? this.historyIndex + 1 : this.historyRecords.length - 1
  }

  private handleClickOutSide() {
    this.showMetaCard = false
  }

  private handleActionCommand(command: string) {
    if (command === 'clearRetainedMessage') {
      this.onClearRetainedMsgPublish()
    } else if (command === 'toggleRetain') {
      this.msgRecord.retain = !this.msgRecord.retain
    } else if (command === 'meta') {
      this.changeVisable()
    }
  }

  /**
   * Starts a timed message from the panel: the current editor content (topic, payload, QoS,
   * retain and payload type) is snapshotted and published every `interval` seconds. Payload
   * variables like ${timestamp} are refilled on every tick.
   */
  private handleStartTimedMessage() {
    const interval = this.newTimedInterval
    if (!interval || interval < 1) {
      return
    }
    if (!this.msgRecord.topic) {
      this.topicRequired = true
      this.$message.warning(this.$tc('connections.topicRequired'))
      return
    }
    this.$emit('handleStartTimedMessage', interval, { ...this.msgRecord }, this.payloadType)
  }

  /** Opens the timed-message panel (used by the topbar menu command). */
  public openTimedPanel() {
    // el-popover owns its open state: setting the flag alone left the panel closed.
    const panel = this.$refs.timedPanel as { doShow?: () => void } | undefined
    if (panel?.doShow) {
      panel.doShow()
      return
    }
    this.timedPanelVisible = true
  }

  /** Reloads the message preset list (also used as the popover's @show hook). */
  private loadMessagePresets() {
    this.messagePresets = getMessagePresets()
  }

  /** Fills only the topic. The stored template is copied as written, including `${name}`. */
  private applyTopicPreset(topic: string) {
    this.msgRecord.topic = topic
    this.topicRequired = false
  }

  private applyResponseTopic(topic: string) {
    this.MQTT5PropsForm.responseTopic = topic
  }

  /** Fills topic + message from a preset. QoS/retain/payloadType stay as chosen by the user. */
  private applyMessagePreset(preset: MessagePresetModel) {
    this.msgRecord.topic = preset.topic
    this.msgRecord.payload = preset.payload
    this.msgPresetPanelVisible = false
    this.$message.success(`${this.$t('configs.selectMessagePreset')}: ${preset.name}`)
  }

  private gotoManagePresets() {
    this.msgPresetPanelVisible = false
    this.$router.push('/configs')
  }

  /** Local "HH:mm:ss" of the next scheduled send of a timed message. */
  private nextSendTime(nextSendAt: number): string {
    return time.toFormat(new Date(nextSendAt)).slice(11, 19)
  }

  private onClearRetainedMsgPublish() {
    this.$confirm(
      `${this.$tc('connections.clearRetainedMessageConfirm')} "${this.msgRecord.topic}"`,
      this.$tc('common.warning'),
      {
        type: 'warning',
      },
    )
      .then(() => {
        this.msgRecord.payload = ''
        this.msgRecord.retain = true
        this.send()
      })
      .catch(() => {
        // The user canceled the action
      })
  }

  private created() {
    this.loadData()
  }

  private mounted() {
    ipcRenderer.on('insertCodeToEditor', (event: IpcRendererEvent, code: string) => {
      if (code) {
        this.msgRecord.payload = code
        this.$emit('onInsertedCode')
      }
    })
  }

  private beforeDestroy() {
    window.removeEventListener('resize', this.updateHistoryPanelWidth)
    ipcRenderer.removeAllListeners('sendPayload')
    ipcRenderer.removeAllListeners('insertCodeToEditor')
  }
}
</script>

<style lang="scss">
@import '~@/assets/scss/variable.scss';
@import '~@/assets/scss/mixins.scss';

.msg-publish {
  position: relative;
  background: var(--color-bg-normal);
  transition: 0.3s height;
  border-top: 1px solid var(--color-border-default);
  box-shadow: #00000010 0px -1px 4px;
  z-index: 10;
  .publish-top {
    position: absolute;
    transform: translate(0, -100%);
    width: 100%;
    .el-card.meta-card {
      padding: 10px;
      padding-bottom: 0px;
      margin: 4px;
      user-select: none;
      .dropdown-btn {
        margin-top: 10px;
        text-align: right;
        .dropdown-btn-reset {
          color: var(--color-text-default);
          &:hover {
            color: var(--color-main-green);
          }
        }
        .dropdown-btn-submit {
          margin-right: 8px;
        }
      }
      .el-card__body {
        padding: 4px 4px 6px 4px;
        .form-row {
          display: flex;
          flex-wrap: wrap;
          position: relative;
          .el-form-item {
            margin-bottom: 0;
            .el-form-item__label {
              padding-bottom: 0;
            }
          }
        }
      }
    }
  }
  .topic-input-container {
    position: relative;
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    &.required {
      .el-input.publish-topic-input {
        .el-input__inner {
          border: 1px solid var(--color-minor-red) !important;
        }
      }
    }
  }
  .publish-topic-input.el-input {
    flex: 1 1 0;
    min-width: 0;
    width: auto;
    display: block;
    @include topic-input__inner;
    .el-input__inner {
      padding: 0px 16px;
    }
  }
  .editor-container {
    padding: 0 6px;
    display: flex;
    justify-content: space-around;
    .publish-footer {
      width: 100%;
      flex: 1 1 auto;
    }
    .send-btn {
      position: fixed;
      right: 16px;
      bottom: 10px;
      background: var(--color-bg-btn-gradient);
      border-radius: 50%;
      text-align: center;
      box-shadow: #00000011 0px 1px 3px, #0000002e 0px 1px 2px;
      width: 28px;
      height: 28px;
      line-height: 29px;
      .icon-send {
        font-size: 16px;
        color: var(--color-text-active);
      }
      &:active {
        box-shadow: none;
      }
    }
  }
  .publish-metadata {
    background: var(--color-bg-normal);
    padding: 0 13px;
    margin-top: 6px;
    margin-bottom: 2px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .el-input__inner {
      padding: 4px 10px;
    }
    .publish-label {
      color: var(--color-text-default);
      margin-right: 0px;
    }
    .payload-select {
      width: 88px;
      margin-right: 4px;
    }
    .qos-select {
      width: 76px;
      margin-right: 4px;
    }
    .dropdown-btn {
      margin-right: 4px;
      border-radius: 4px;
      &.el-button.is-disabled {
        background-color: transparent;
        border: 1px solid var(--color-border-default);
        color: var(--color-text-historybtn_disabled);
      }
      &:not(.is-disabled) {
        border-color: var(--color-border-default);
        color: var(--color-text-default);
      }
      &.dropdown-btn-active {
        color: var(--color-main-green);
        border-color: var(--color-main-green);
      }
    }
    .timed-badge {
      margin-right: 4px;
      .el-badge__content {
        top: -7px;
        right: 9px;
        transform: none;
        border: none;
      }
    }
    .actions-dropdown {
      display: inline;
      margin-right: 4px;
      .retain-on {
        color: var(--color-main-green);
      }
      .retain-off {
        color: #c0c4cc;
      }
    }
    .history-button-group {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 4px;

      .history-btn {
        height: 28px;
        padding: 0 10px;
        margin: 0;
        border-radius: 4px;
        border: 1px solid var(--color-border-default);
        background-color: transparent;
        color: var(--color-text-default);
        font-size: 14px;

        &:hover:not(.is-disabled) {
          color: var(--color-main-green);
          border-color: var(--color-main-green);
          background-color: var(--color-bg-hover);
        }

        &.is-disabled {
          background-color: transparent;
          border-color: var(--color-border-default);
          color: var(--color-text-historybtn_disabled);
        }
      }

      // Large hit targets with clearly visible arrows (the old 18px ghost buttons were neither).
      .history-btn-left,
      .history-btn-right {
        width: 40px;
        padding: 0;
        font-size: 16px;
        font-weight: 600;
      }

      .history-btn-center {
        min-width: 64px;

        .history-btn-caret {
          margin-left: 4px;
          font-size: 12px;
          transition: transform 0.15s ease;
        }

        &.history-btn-active {
          color: var(--color-main-green);
          border-color: var(--color-main-green);

          .history-btn-caret {
            transform: rotate(180deg);
          }
        }
      }
    }
  }
  .disabled-mask {
    position: absolute;
    width: 100%;
    height: 100%;
    background-color: var(--color-bg-primary);
    opacity: 0.5;
    cursor: not-allowed;
    z-index: 9;
    top: 0;
  }
}
.el-popover.history-panel--popper {
  // Width is set from the component (as wide as the message window); padding stays compact.
  padding: 6px 4px;

  .history-panel {
    max-height: 340px;
    overflow: auto;
  }

  .history-panel-empty {
    padding: 16px 0;
    text-align: center;
    font-size: 12px;
    color: #8492a6;
  }

  .history-panel-item {
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background-color: var(--color-bg-hover);
    }

    &.active {
      background-color: var(--color-bg-hover);
      box-shadow: inset 2px 0 0 var(--color-main-green);
    }
  }

  .history-panel-item-main {
    display: flex;
    align-items: center;
  }

  .history-panel-topic {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    unicode-bidi: plaintext;
    text-align: left;
    font-weight: 600;
  }

  .history-panel-meta {
    flex-shrink: 0;
    margin-left: 8px;
    color: #8492a6;
    font-size: 12px;
  }

  .history-panel-item-sub {
    margin-top: 3px;
  }

  .history-panel-payload {
    display: block;
    // Full payload, never truncated; whitespace is collapsed upstream, long lines wrap.
    word-break: break-all;
    color: #8e9fac;
    font-size: 12px;
    line-height: 1.5;

    // Only a scroll guard for extreme payloads (e.g. pasted files), so one huge record
    // cannot push the whole list away; nothing is cut off, it stays scrollable.
    max-height: 220px;
    overflow: auto;

    &.empty {
      color: #b4bcc6;
    }
  }

  .history-panel-delete {
    flex-shrink: 0;
    margin-left: 8px;
    color: #8492a6;
    font-size: 14px;
    cursor: pointer;

    &:hover {
      color: var(--color-minor-red);
    }
  }
}

.el-popover.msg-preset--popper {
  padding: 8px 0;

  .msg-preset-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 14px 8px;
    font-weight: 600;
    .msg-preset-panel-count {
      color: var(--color-text-default);
      font-size: 12px;
    }
  }
  .msg-preset-panel-empty {
    padding: 8px 14px 12px;
    color: var(--color-text-default);
    font-size: 12px;
  }
  .msg-preset-panel-item {
    display: flex;
    align-items: center;
    padding: 7px 14px;
    cursor: pointer;
    &:hover {
      background: var(--color-bg-leftbar_item);
    }
    .msg-preset-panel-icon {
      margin-right: 8px;
      color: var(--color-main-green);
    }
    .msg-preset-panel-info {
      flex: 1;
      min-width: 0;
      .msg-preset-panel-name {
        font-size: 13px;
      }
      .msg-preset-panel-topic {
        color: var(--color-text-default);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
  .msg-preset-panel-footer {
    border-top: 1px solid var(--color-border-rightbar);
    margin-top: 6px;
    padding: 8px 14px 4px;
    text-align: right;
    a {
      font-size: 12px;
      color: var(--color-main-green);
    }
  }
}

.el-popover.timed-panel--popper {
  padding: 8px;

  .timed-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px 6px;
    border-bottom: 1px solid #ebeef5;
    font-weight: 600;
  }

  .timed-panel-count {
    color: #8492a6;
    font-size: 12px;
  }

  .timed-panel-empty {
    padding: 16px 0 8px;
    text-align: center;
    font-size: 12px;
    color: #8492a6;
  }

  .timed-panel-item {
    display: flex;
    align-items: center;
    padding: 6px 4px;
    border-radius: 4px;

    &:hover {
      background-color: var(--color-bg-hover);
    }
  }

  .timed-panel-icon {
    flex-shrink: 0;
    margin-right: 6px;
    color: var(--color-main-green);
    font-size: 14px;
  }

  .timed-panel-item-info {
    flex: 1;
    min-width: 0;
  }

  .timed-panel-item-interval {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-default);
  }

  .timed-panel-item-next {
    margin-left: 4px;
    font-size: 11px;
    font-weight: 400;
    color: #8492a6;
  }

  .timed-panel-item-topic {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    unicode-bidi: plaintext;
    text-align: left;
    font-size: 12px;
    color: #8492a6;
  }

  /* Shown when a task waits for its connection page (script / schema / MQTT 5 properties). */
  .timed-panel-item-paused {
    margin-top: 2px;
    font-size: 11px;
    line-height: 1.4;
    color: #e6a23c;
    white-space: normal;
  }

  .timed-panel-stop {
    flex-shrink: 0;
    margin-left: 8px;
    color: #8492a6;
    font-size: 14px;
    cursor: pointer;

    &:hover {
      color: var(--color-minor-red);
    }
  }

  .timed-panel-footer {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid #ebeef5;

    .timed-panel-input {
      flex: 1;
    }
  }

  .timed-panel-hint {
    margin-top: 6px;
    font-size: 11px;
    line-height: 1.4;
    color: #a8b2bb;
  }
}
</style>
