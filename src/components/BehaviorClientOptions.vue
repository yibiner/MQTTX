<template>
  <div class="behavior-client-options">
    <div class="options-section-head">
      <span class="options-section-title">{{ $t('settings.advanced') }}</span>
      <a
        v-if="parentLinked && sessionOwned"
        href="javascript:;"
        class="options-follow"
        @click="followParent('session')"
      >
        {{ $t('configs.credentialInherit') }}
      </a>
      <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
        <div slot="content" class="automation-tip">
          <p>{{ $t('configs.behaviorClientHint') }}</p>
        </div>
        <a href="javascript:;" class="editor-help">
          <i class="el-icon-warning-outline"></i>
        </a>
      </el-tooltip>
    </div>
    <el-form-item label-width="160px" :label="$t('connections.mqttVersion')">
      <el-select size="mini" :value="sessionField('mqttVersion', '5.0')" @change="setSession({ mqttVersion: $event })">
        <el-option value="3.1" label="3.1"></el-option>
        <el-option value="3.1.1" label="3.1.1"></el-option>
        <el-option value="5.0" label="5.0"></el-option>
      </el-select>
    </el-form-item>
    <el-form-item label-width="160px" :label="$t('connections.connectionTimeout')">
      <el-input-number
        size="mini"
        :min="0"
        controls-position="right"
        class="options-number"
        :value="sessionNumber('connectTimeout', 10)"
        @change="setSessionNumber('connectTimeout', $event)"
      ></el-input-number>
      <span class="options-unit">({{ $t('common.unitS') }})</span>
    </el-form-item>
    <el-form-item label-width="160px" label="Keep Alive">
      <el-input-number
        size="mini"
        :min="0"
        controls-position="right"
        class="options-number"
        :value="sessionNumber('keepalive', 60)"
        @change="setSessionNumber('keepalive', $event)"
      ></el-input-number>
      <span class="options-unit">({{ $t('common.unitS') }})</span>
    </el-form-item>
    <el-form-item label-width="160px" :label="$t('connections.autoReconnect')">
      <el-switch
        :value="sessionField('reconnect', true)"
        active-color="#13ce66"
        inactive-color="#A2A9B0"
        @change="setSession({ reconnect: $event })"
      ></el-switch>
    </el-form-item>
    <el-form-item v-if="sessionField('reconnect', true)" label-width="160px" :label="$t('connections.reconnectPeriod')">
      <el-input-number
        size="mini"
        :min="1"
        controls-position="right"
        class="options-number"
        :value="sessionNumber('reconnectPeriod', 4000)"
        @change="setSessionNumber('reconnectPeriod', $event)"
      ></el-input-number>
      <span class="options-unit">({{ $t('common.unitMS') }})</span>
    </el-form-item>
    <el-form-item label-width="160px" :label="mqtt5 ? 'Clean Start' : 'Clean Session'">
      <el-switch
        :value="sessionField('clean', true)"
        active-color="#13ce66"
        inactive-color="#A2A9B0"
        @change="setClean"
      ></el-switch>
    </el-form-item>
    <template v-if="mqtt5">
      <el-form-item label-width="160px" :label="$t('connections.sessionExpiryInterval')">
        <el-input
          size="mini"
          type="number"
          :min="0"
          clearable
          :placeholder="$t('common.neverExpire')"
          :value="sessionProp('sessionExpiryInterval')"
          @input="setSessionProp('sessionExpiryInterval', $event)"
        ></el-input>
        <span class="options-unit">({{ $t('common.unitS') }})</span>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.receiveMaximum')">
        <el-input
          size="mini"
          type="number"
          clearable
          :value="sessionProp('receiveMaximum')"
          @input="setSessionProp('receiveMaximum', $event)"
        ></el-input>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.maximumPacketSize')">
        <el-input
          size="mini"
          type="number"
          clearable
          :value="sessionProp('maximumPacketSize')"
          @input="setSessionProp('maximumPacketSize', $event)"
        ></el-input>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.topicAliasMaximum')">
        <el-input
          size="mini"
          type="number"
          clearable
          :value="sessionProp('topicAliasMaximum')"
          @input="setSessionProp('topicAliasMaximum', $event)"
        ></el-input>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.requestResponseInformation')">
        <el-switch
          :value="!!sessionProp('requestResponseInformation')"
          active-color="#13ce66"
          inactive-color="#A2A9B0"
          @change="setSessionProp('requestResponseInformation', $event)"
        ></el-switch>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.requestProblemInformation')">
        <el-switch
          :value="!!sessionProp('requestProblemInformation')"
          active-color="#13ce66"
          inactive-color="#A2A9B0"
          @change="setSessionProp('requestProblemInformation', $event)"
        ></el-switch>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.authenticationMethod')">
        <el-select
          size="mini"
          clearable
          :value="sessionProp('authenticationMethod') || ''"
          @change="setSessionText('authenticationMethod', $event)"
        >
          <el-option label="SCRAM-SHA-1" value="SCRAM-SHA-1"></el-option>
          <el-option label="SCRAM-SHA-256" value="SCRAM-SHA-256"></el-option>
          <el-option label="SCRAM-SHA-512" value="SCRAM-SHA-512"></el-option>
        </el-select>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.userProperties')">
        <KeyValueEditor :value="userProperties" @change="setSessionProp('userProperties', $event)" />
      </el-form-item>
    </template>

    <div class="options-section-head">
      <span class="options-section-title">{{ $t('connections.willMessage') }}</span>
      <a v-if="parentLinked && willOwned" href="javascript:;" class="options-follow" @click="followParent('will')">
        {{ $t('configs.credentialInherit') }}
      </a>
    </div>
    <el-form-item label-width="160px" :label="$t('connections.willTopic')">
      <div class="topic-preset-field">
        <el-input
          size="mini"
          :value="willField('lastWillTopic', '')"
          @input="setWill({ lastWillTopic: $event })"
        ></el-input>
        <TopicPresetPicker @select="setWill({ lastWillTopic: $event })" />
      </div>
    </el-form-item>
    <el-form-item label-width="160px" :label="$t('connections.willQos')">
      <el-radio-group :value="willField('lastWillQos', 0)" @input="setWill({ lastWillQos: $event })">
        <el-radio :label="0"></el-radio>
        <el-radio :label="1"></el-radio>
        <el-radio :label="2"></el-radio>
      </el-radio-group>
    </el-form-item>
    <el-form-item label-width="160px" :label="$t('connections.willRetain')">
      <el-switch
        :value="willField('lastWillRetain', false)"
        active-color="#13ce66"
        inactive-color="#A2A9B0"
        @change="setWill({ lastWillRetain: $event })"
      ></el-switch>
    </el-form-item>
    <el-form-item label-width="160px" :label="$t('connections.willPayload')">
      <el-input
        type="textarea"
        :rows="4"
        size="mini"
        :value="willField('lastWillPayload', '')"
        @input="setWill({ lastWillPayload: $event })"
      ></el-input>
    </el-form-item>
    <template v-if="mqtt5">
      <el-form-item label-width="160px" :label="$t('connections.payloadFormatIndicator')">
        <el-switch
          :value="!!willProp('payloadFormatIndicator')"
          active-color="#13ce66"
          inactive-color="#A2A9B0"
          @change="setWillProp('payloadFormatIndicator', $event)"
        ></el-switch>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.willDelayInterval')">
        <el-input
          size="mini"
          type="number"
          clearable
          :value="willProp('willDelayInterval')"
          @input="setWillProp('willDelayInterval', $event)"
        ></el-input>
        <span class="options-unit">({{ $t('common.unitS') }})</span>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.messageExpiryInterval')">
        <el-input
          size="mini"
          type="number"
          clearable
          :value="willProp('messageExpiryInterval')"
          @input="setWillProp('messageExpiryInterval', $event)"
        ></el-input>
        <span class="options-unit">({{ $t('common.unitS') }})</span>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.contentType')">
        <el-input
          size="mini"
          clearable
          :value="willProp('contentType') || ''"
          @input="setWillText('contentType', $event)"
        ></el-input>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.responseTopic')">
        <div class="topic-preset-field">
          <el-input
            size="mini"
            clearable
            :value="willProp('responseTopic') || ''"
            @input="setWillText('responseTopic', $event)"
          ></el-input>
          <TopicPresetPicker @select="setWillText('responseTopic', $event)" />
        </div>
      </el-form-item>
      <el-form-item label-width="160px" :label="$t('connections.correlationData')">
        <el-input
          size="mini"
          clearable
          :value="willProp('correlationData') || ''"
          @input="setWillText('correlationData', $event)"
        ></el-input>
      </el-form-item>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'
import KeyValueEditor from '@/components/KeyValueEditor.vue'
import TopicPresetPicker from '@/components/TopicPresetPicker.vue'

type OptionsValue = {
  session?: BehaviorSessionConfig | null
  will?: BehaviorWillConfig | null
}

const hasKeys = (value: Record<string, unknown> | null | undefined): boolean =>
  !!value &&
  Object.keys(value).some((key) => {
    if (key === 'properties') {
      const properties = value.properties as Record<string, unknown> | null | undefined
      return !!properties && Object.keys(properties).length > 0
    }
    return value[key] !== undefined
  })

/**
 * Advanced and last-will fields of a behaviour template.
 *
 * The controls show the parent's value until this template sets the same field.
 * Editing one field stores only that field, so the rest keep following the parent.
 */
@Component({ components: { KeyValueEditor, TopicPresetPicker } })
export default class BehaviorClientOptions extends Vue {
  @Prop({ default: () => ({}) }) private readonly value!: OptionsValue
  @Prop({ default: () => ({}) }) private readonly inheritedSession!: BehaviorSessionConfig
  @Prop({ default: () => ({}) }) private readonly inheritedWill!: BehaviorWillConfig
  @Prop({ default: false }) private readonly parentLinked!: boolean

  get tooltipEffect(): 'dark' | 'light' {
    const theme = (this as unknown as { $store?: { getters?: { currentTheme?: string } } }).$store?.getters
      ?.currentTheme
    return theme && theme !== 'light' ? 'light' : 'dark'
  }

  get mqtt5(): boolean {
    return this.sessionField('mqttVersion', '5.0') === '5.0'
  }

  get sessionOwned(): boolean {
    return hasKeys(this.value?.session as Record<string, unknown> | null | undefined)
  }

  get willOwned(): boolean {
    return hasKeys(this.value?.will as Record<string, unknown> | null | undefined)
  }

  get userProperties(): { [key: string]: string | string[] } | null {
    const stored = this.sessionProp('userProperties')
    return stored ? (JSON.parse(JSON.stringify(stored)) as { [key: string]: string | string[] }) : null
  }

  private sessionField<K extends keyof BehaviorSessionConfig>(key: K, fallback: BehaviorSessionConfig[K]) {
    return this.pick(this.value?.session, this.inheritedSession, key, fallback)
  }

  /**
   * A number this template cleared is null. Show that as an empty box, not the parent value.
   * Element UI's number input treats null as 0, so the empty state has to be undefined.
   */
  private sessionNumber(key: 'connectTimeout' | 'keepalive' | 'reconnectPeriod', fallback: number): number | undefined {
    const own = this.value?.session
    if (own && Object.prototype.hasOwnProperty.call(own, key) && own[key] === null) {
      return undefined
    }
    const value = this.sessionField(key, fallback)
    return typeof value === 'number' ? value : fallback
  }

  private sessionProp(key: string): unknown {
    return this.pick(this.value?.session?.properties, this.inheritedSession?.properties, key, '')
  }

  private willField<K extends keyof BehaviorWillConfig>(key: K, fallback: BehaviorWillConfig[K]) {
    return this.pick(this.value?.will, this.inheritedWill, key, fallback)
  }

  private willProp(key: string): unknown {
    return this.pick(this.value?.will?.properties, this.inheritedWill?.properties, key, '')
  }

  private pick<T>(own: T | null | undefined, inherited: T | null | undefined, key: string, fallback: unknown) {
    if (own && Object.prototype.hasOwnProperty.call(own, key)) {
      const value = (own as { [name: string]: unknown })[key]
      if (value !== undefined) {
        return value
      }
    }
    if (inherited && Object.prototype.hasOwnProperty.call(inherited, key)) {
      const value = (inherited as { [name: string]: unknown })[key]
      if (value !== undefined && value !== null) {
        return value
      }
    }
    return fallback
  }

  private emitOptions(next: OptionsValue) {
    this.$emit('change', next)
  }

  private setSession(partial: Partial<BehaviorSessionConfig>) {
    this.emitOptions({
      session: { ...(this.value?.session ?? {}), ...partial },
      will: this.value?.will ?? null,
    })
  }

  /** Clearing the box stores null, which overrides the parent instead of falling back to it. */
  private setSessionNumber(key: 'connectTimeout' | 'keepalive' | 'reconnectPeriod', raw: number | undefined) {
    const value = raw === undefined || raw === null || Number.isNaN(Number(raw)) ? null : Number(raw)
    this.setSession({ [key]: value })
  }

  private setSessionProp(key: string, raw: unknown) {
    this.setSession({
      properties: { ...(this.value?.session?.properties ?? {}), [key]: this.normalize(raw) },
    })
  }

  private setSessionText(key: string, raw: unknown) {
    this.setSession({
      properties: { ...(this.value?.session?.properties ?? {}), [key]: this.asText(raw) },
    })
  }

  private setWillProp(key: string, raw: unknown) {
    this.setWill({
      properties: { ...(this.value?.will?.properties ?? {}), [key]: this.normalize(raw) },
    })
  }

  private setWillText(key: string, raw: unknown) {
    this.setWill({
      properties: { ...(this.value?.will?.properties ?? {}), [key]: this.asText(raw) },
    })
  }

  private asText(raw: unknown): string | null {
    if (raw === '' || raw === undefined || raw === null) {
      return null
    }
    return String(raw)
  }

  private setClean(clean: boolean) {
    if (this.mqtt5) {
      this.setSession({
        clean,
        properties: {
          ...(this.value?.session?.properties ?? {}),
          sessionExpiryInterval: clean ? 0 : 7200,
        },
      })
      return
    }
    this.setSession({ clean })
  }

  private setWill(partial: Partial<BehaviorWillConfig>) {
    this.emitOptions({
      session: this.value?.session ?? null,
      will: { ...(this.value?.will ?? {}), ...partial },
    })
  }

  /** An emptied number is stored as null, which clears the parent's value. Text is left as text. */
  private normalize(raw: unknown): unknown {
    if (raw === '' || raw === undefined || raw === null) {
      return null
    }
    if (typeof raw === 'boolean' || typeof raw === 'object') {
      return raw
    }
    const text = String(raw).trim()
    if (text === '') {
      return null
    }
    if (text !== '' && !Number.isNaN(Number(text)) && /^-?\d+(\.\d+)?$/.test(text)) {
      return Number(text)
    }
    return raw
  }

  private followParent(part: 'session' | 'will') {
    this.emitOptions({
      session: part === 'session' ? null : this.value?.session ?? null,
      will: part === 'will' ? null : this.value?.will ?? null,
    })
  }
}
</script>

<style lang="scss">
.behavior-client-options {
  margin-top: 8px;

  .options-section-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    margin: 12px 0 8px;
  }

  .options-section-title {
    color: var(--color-text-light);
    font-size: 13px;
    font-weight: 600;
  }

  .options-follow {
    font-size: 12px;
  }

  .editor-help {
    display: inline-flex;
    align-items: center;
    color: var(--color-text-default);
    font-size: 15px;
    &:hover {
      color: var(--color-main-green);
    }
  }

  .options-number {
    width: 160px;
  }

  .options-unit {
    margin-left: 8px;
    color: var(--color-text-default);
    font-size: 12px;
  }

  .el-select,
  .el-input {
    width: 100%;
  }

  .options-number.el-input-number {
    width: 160px;
  }
}
</style>
