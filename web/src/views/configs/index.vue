<template>
  <div class="configs-view rightbar">
    <div class="configs-topbar">
      <h1 class="titlebar">{{ $t('configs.title') }}</h1>
    </div>

    <div class="configs-container">
      <el-tabs v-model="activeTab" @tab-click="loadActive">
        <el-tab-pane :label="$t('configs.serverProfiles')" name="server" />
        <el-tab-pane :label="$t('configs.clientProfiles')" name="client" />
        <el-tab-pane :label="$t('configs.behaviorTemplates')" name="behavior" />
        <el-tab-pane :label="$t('configs.topicPresets')" name="topic" />
        <el-tab-pane :label="$t('configs.messagePresets')" name="message" />
        <el-tab-pane :label="$t('configs.messageSequencePresets')" name="sequence" />
        <el-tab-pane :label="$t('configs.autoReplyPresets')" name="reply" />
        <el-tab-pane :label="$t('configs.globalVariables')" name="variable" />
      </el-tabs>

      <div class="configs-toolbar">
        <VariablesHelp v-if="activeTab === 'variable'" />
        <el-button v-if="canCreate" type="primary" size="mini" icon="el-icon-plus" @click="openCreate">
          {{ addBtnText }}
        </el-button>
        <HintIcon v-if="hint" :text="hint" />
      </div>

      <el-table :data="rows" size="mini" class="configs-table" empty-text="">
        <el-table-column
          v-for="column in columns"
          :key="column.key"
          :prop="column.key"
          :label="$t(column.label)"
          :width="column.width"
          show-overflow-tooltip
        />
        <el-table-column :label="$t('configs.oper')" width="130" align="center">
          <template slot-scope="{ row }">
            <el-button v-if="canEdit" type="text" size="mini" @click="openEdit(row)">{{ $t('configs.edit') }}</el-button>
            <el-tooltip v-if="row.stateful" :content="$t('configs.variableReset')" placement="top">
              <el-button type="text" size="mini" icon="el-icon-refresh" @click="resetVariableValue(row)" />
            </el-tooltip>
            <el-button type="text" size="mini" class="danger" @click="remove(row)">{{ $t('configs.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <p v-if="!rows.length" class="empty-hint">{{ $t('configs.empty') }}</p>
    </div>

    <el-dialog
      :title="dialogTitle"
      :visible.sync="dialogVisible"
      :width="dialogWidth"
      @opened="handleDialogOpen"
    >
      <el-form label-width="90px" size="mini">
        <el-form-item v-if="showSharedName" :label="$t('configs.name')">
          <el-input v-model="draft.name" />
        </el-form-item>

        <!-- A sequence preset holds exactly one sequence; the editor works on a list, so a single
             element is wrapped in and taken back out on save. -->
        <template v-if="activeTab === 'sequence'">
          <el-form-item :label="$t('connections.sequenceTitle')">
            <MessageSequenceEditor v-model="sequenceDraft" :allow-preset="false" single />
          </el-form-item>
        </template>

        <!-- A message preset edits a full message, so the payload gets the same Monaco editor the
             publish panel uses: JSON highlighting, formatting and a resizable box. -->
        <template v-else-if="activeTab === 'message'">
          <el-form-item :label="$t('configs.topic')">
            <el-input v-model.trim="draft.topic" clearable placeholder="app/${productType}/${clientId}/device/service/sub" />
          </el-form-item>
          <el-form-item :label="$t('configs.payload')">
            <div class="preset-payload-editor" @keyup.enter.stop @keydown.enter.stop>
              <Editor
                ref="presetPayloadEditor"
                id="preset-payload"
                v-model="draft.payload"
                :lang="presetPayloadLang"
                :useShadows="true"
                @format="formatPresetPayload"
              />
            </div>
            <div class="preset-payload-bar">
              <a class="preset-payload-format" href="javascript:;" @click.prevent="formatPresetPayload">
                {{ $t('configs.formatPayload') }}
              </a>
            </div>
          </el-form-item>
        </template>

        <!-- A reply preset stores every rule the editor holds. -->
        <template v-else-if="activeTab === 'reply'">
          <el-form-item :label="$t('connections.autoReplyTitle')">
            <AutoReplyEditor v-model="replyDraft" :allow-preset="false" />
          </el-form-item>
        </template>

        <!-- A behaviour template carries the whole behaviour of a connection, so it gets its own
             form: parent link, default server, credentials, client options and the five lists. -->
        <template v-else-if="activeTab === 'behavior'">
          <el-form-item :label="$t('configs.behaviorParent')">
            <el-select v-model="behaviorDraft.parentId" clearable style="width: 100%" :placeholder="$t('configs.behaviorNoParent')">
              <el-option v-for="choice in behaviorParentOptions" :key="choice.id" :label="choice.name" :value="choice.id" />
            </el-select>
          </el-form-item>

          <el-form-item :label="$t('configs.defaultServer')">
            <el-select v-model="behaviorDraft.defaultServerId" clearable style="width: 100%" :placeholder="$t('configs.behaviorInheritHint')">
              <el-option v-for="server in serverProfiles" :key="server.id" :label="server.alias" :value="server.id" />
            </el-select>
          </el-form-item>

          <el-form-item :label="$t('configs.credentialUsername')">
            <el-select v-model="behaviorDraft.usernameFrom" clearable style="width: 100%" :placeholder="$t('configs.credentialInherit')">
              <el-option :label="$t('configs.credentialTemplate')" value="template" />
              <el-option :label="$t('configs.credentialDevice')" value="device" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="behaviorDraft.usernameFrom === 'template'" :label="$t('connections.username')">
            <el-input v-model.trim="behaviorDraft.username" clearable />
          </el-form-item>

          <el-form-item :label="$t('configs.credentialPassword')">
            <el-select v-model="behaviorDraft.passwordFrom" clearable style="width: 100%" :placeholder="$t('configs.credentialInherit')">
              <el-option :label="$t('configs.credentialTemplate')" value="template" />
              <el-option :label="$t('configs.credentialDevice')" value="device" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="behaviorDraft.passwordFrom === 'template'" :label="$t('connections.password')">
            <el-input v-model.trim="behaviorDraft.password" show-password clearable />
          </el-form-item>

          <BehaviorClientOptions
            :value="{ session: behaviorDraft.session, will: behaviorDraft.will }"
            :parent-linked="!!behaviorDraft.parentId"
            @change="setBehaviorClientOptions"
          />

          <el-form-item class="automation-field" :label="$t('connections.variableTitle')">
            <VariableListEditor v-model="behaviorDraft.variables" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.autoSubscribeTitle')">
            <AutoSubscribeEditor v-model="behaviorDraft.autoSubscriptions" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.connectReportTitle')">
            <ConnectReportEditor v-model="behaviorDraft.connectReports" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.timedReportTitle')">
            <TimedReportEditor v-model="behaviorDraft.timedReports" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.autoReplyTitle')">
            <AutoReplyEditor v-model="behaviorDraft.autoReplies" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.sequenceTitle')">
            <MessageSequenceEditor
              v-model="behaviorDraft.messageSequences"
              :variable-names="behaviorVariableNames"
              @example="applySequenceVariables"
            />
          </el-form-item>
        </template>

        <!-- A global variable can be stateful (counter, random, choice, ...), so the value field
             is a definition editor instead of a plain input. -->
        <template v-else-if="activeTab === 'variable'">
          <el-form-item :label="$t('configs.variableName')">
            <el-input v-model.trim="draft.name" clearable placeholder="deviceId" />
          </el-form-item>
          <el-form-item :label="$t('configs.variableDefinition')">
            <VariableDefinitionEditor :value="variableStored" @change="handleVariableStoredChange" />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item v-for="field in fields" :key="field.key">
            <template slot="label">
              {{ $t(field.label) }}
              <HintIcon v-if="field.hint" :text="field.hint" />
            </template>
            <el-select v-if="field.type === 'select'" v-model="draft[field.key]" style="width: 100%">
              <el-option v-for="option in field.options" :key="option" :label="option" :value="option" />
            </el-select>
            <el-input
              v-else
              v-model="draft[field.key]"
              :type="field.type === 'textarea' ? 'textarea' : field.type === 'password' ? 'password' : 'text'"
              :show-password="field.type === 'password'"
              :rows="field.type === 'textarea' ? 3 : undefined"
            />
          </el-form-item>
        </template>
      </el-form>
      <span slot="footer">
        <el-button size="mini" @click="dialogVisible = false">{{ $t('configs.cancel') }}</el-button>
        <el-button type="primary" size="mini" @click="save">{{ $t('configs.confirm') }}</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import MessageSequenceEditor from '@/components/MessageSequenceEditor.vue'
import AutoReplyEditor from '@/components/AutoReplyEditor.vue'
import HintIcon from '@/components/HintIcon.vue'
import VariablesHelp from '@/components/VariablesHelp.vue'
import { validateVariableName } from '@/utils/payloadVariables'
import Editor from '@/components/Editor.vue'
import VariableDefinitionEditor from '@/components/VariableDefinitionEditor.vue'
import validFormatJson from '@/utils/validFormatJson'
import BehaviorClientOptions from '@/components/BehaviorClientOptions.vue'
import VariableListEditor from '@/components/VariableListEditor.vue'
import AutoSubscribeEditor from '@/components/AutoSubscribeEditor.vue'
import ConnectReportEditor from '@/components/ConnectReportEditor.vue'
import TimedReportEditor from '@/components/TimedReportEditor.vue'
import {
  behaviorParentChoices,
  behaviorTemplateHasChildren,
  compactBehaviorConfig,
  detachBehaviorTemplate,
} from '@/utils/behaviorTemplates'
import { normalizeGlobalVariables, resetVariable } from '@/utils/payloadVariables'
import { peekDefinitionValue } from '@/utils/variables/state'
import {
  deleteBehaviorTemplate,
  deleteClientProfile,
  deleteMessagePreset,
  deleteServerProfile,
  deleteTopicPreset,
  deleteGlobalVariable,
  getBehaviorTemplates,
  getClientProfiles,
  getGlobalVariables,
  getAutoReplyPresets,
  getMessagePresets,
  getMessageSequencePresets,
  getServerProfiles,
  getTopicPresets,
  deleteAutoReplyPreset,
  deleteMessageSequencePreset,
  saveAutoReplyPreset,
  saveBehaviorTemplate,
  saveClientProfile,
  saveGlobalVariable,
  saveMessagePreset,
  saveMessageSequencePreset,
  saveServerProfile,
  saveTopicPreset,
} from '@/utils/configProfiles'

/**
 * Preset management ("预设管理") for the web build.
 *
 * The same presets the desktop app manages under `/configs`, minus the tabs whose feature does not
 * exist in this build yet: message-sequence presets and automatic-reply presets are edited inside
 * the connection form here, so they have no list of their own.
 *
 * One table and one dialog are driven by the tab definitions below, so adding a preset kind means
 * adding one entry instead of another near-identical table.
 */

type TabKey = 'server' | 'client' | 'message' | 'topic' | 'sequence' | 'reply' | 'variable' | 'behavior'

interface Column {
  key: string
  label: string
  width?: number
}

interface Field {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'select' | 'password'
  options?: string[]
  /** shown as a "!" icon behind the label, like every other hint of the desktop build */
  hint?: string
}

@Component({
  components: {
    MessageSequenceEditor,
    AutoReplyEditor,
    HintIcon,
    VariablesHelp,
    Editor,
    VariableDefinitionEditor,
    BehaviorClientOptions,
    VariableListEditor,
    AutoSubscribeEditor,
    ConnectReportEditor,
    TimedReportEditor,
  },
})
export default class Configs extends Vue {
  private activeTab: TabKey = 'server'

  private rows: Array<{ [key: string]: $TSFixed }> = []

  private dialogVisible = false

  private draft: { [key: string]: $TSFixed } = {}

  /** One-element wrappers so the shared editors (which edit lists) can be reused. */
  private sequenceDraft: MessageSequenceModel[] = []

  /** The behaviour template being edited: the model plus the client options it sets. */
  private behaviorDraft: BehaviorTemplateModel & { session: BehaviorSessionConfig; will: BehaviorWillConfig } =
    this.blankBehavior()

  private replyDraft: AutoReplyRuleModel[] = []

  /** Parents the edited template may point at: the cycle is excluded up front. */
  private behaviorParentOptions: BehaviorTemplateModel[] = []

  private blankBehavior() {
    return {
      id: '',
      name: '',
      parentId: null,
      defaultServerId: null,
      usernameFrom: 'template',
      passwordFrom: 'template',
      username: '',
      password: '',
      variables: {},
      autoSubscriptions: [],
      connectReports: [],
      timedReports: [],
      autoReplies: [],
      messageSequences: [],
      session: {},
      will: {},
    } as unknown as BehaviorTemplateModel & { session: BehaviorSessionConfig; will: BehaviorWillConfig }
  }

  get behaviorVariableNames(): string[] {
    return Object.keys(this.behaviorDraft.variables ?? {})
  }

  /** Copies variables that belong to a loaded sequence preset and are not already on this template. */
  private applySequenceVariables(payload: { variables?: { [name: string]: StoredVariable } }) {
    const incoming = payload?.variables ?? {}
    const current = { ...(this.behaviorDraft.variables ?? {}) }
    let changed = false
    Object.keys(incoming).forEach((name) => {
      if (current[name] === undefined) {
        current[name] = incoming[name]
        changed = true
      }
    })
    if (changed) {
      Vue.set(this.behaviorDraft, 'variables', current)
    }
  }

  private setBehaviorClientOptions(value: { session: BehaviorSessionConfig; will: BehaviorWillConfig }) {
    this.behaviorDraft.session = value.session
    this.behaviorDraft.will = value.will
  }

  private detachBehaviorParentLink() {
    if (!this.behaviorDraft.id) {
      return
    }
    detachBehaviorTemplate(this.behaviorDraft.id)
    this.dialogVisible = false
    this.loadActive()
  }

  private columns: Column[] = []

  private fields: Field[] = []

  private canCreate = false

  private canEdit = true

  private hint = ''

  /** Same wording rule as the desktop page: a variable is added, everything else is a profile. */
  /** The preset payload is JSON unless the user says otherwise; the editor highlights it. */
  private presetPayloadLang = 'json'

  /** The stored form of the variable being edited: a string for a constant, an object otherwise. */
  private get variableStored(): StoredVariable {
    return (this.draft.stored ?? this.draft.value ?? '') as StoredVariable
  }

  private handleVariableStoredChange(stored: StoredVariable) {
    this.$set(this.draft, 'stored', stored)
  }

  /** A message preset edits a payload, so its dialog needs room - same widths as the desktop page. */
  private get dialogWidth(): string {
    switch (this.activeTab) {
      case 'message':
        return '760px'
      case 'sequence':
      case 'reply':
      case 'behavior':
        return '720px'
      case 'client':
        return '560px'
      default:
        return '480px'
    }
  }

  /**
   * Monaco measures its container when it is created, and a dialog has no size until it is fully
   * open, so the editor is laid out once the transition finished.
   */
  private handleDialogOpen() {
    const editor = this.$refs.presetPayloadEditor as Editor | undefined
    editor?.editorLayout()
  }

  private formatPresetPayload() {
    try {
      const formatted = validFormatJson(String(this.draft.payload ?? ''))
      if (formatted) {
        this.draft.payload = formatted
      }
    } catch (error) {
      this.$message.error(String(error))
    }
  }

  /**
   * Shown only where the preset is stored under `name` and the tab has no name field of its own.
   * A variable and a topic preset already edit `name`. A server or client preset is stored under
   * `alias`, so a name box there would be typed and then dropped.
   */
  private get showSharedName(): boolean {
    return ['message', 'sequence', 'reply', 'behavior'].includes(this.activeTab)
  }

  private get addBtnText(): string {
    return (this.activeTab === 'variable' ? this.$t('configs.addVariable') : this.$t('configs.addProfile')) as string
  }

  private get dialogTitle(): string {
    return this.draft.id ? (this.$t('configs.edit') as string) : (this.$t('configs.create') as string)
  }

  private created() {
    this.loadActive()
  }

  private loadActive() {
    switch (this.activeTab) {
      case 'server':
        this.rows = getServerProfiles()
        this.columns = [
          { key: 'alias', label: 'configs.alias' },
          { key: 'host', label: 'configs.host' },
          { key: 'port', label: 'configs.port', width: 90 },
          { key: 'protocol', label: 'configs.protocol', width: 110 },
        ]
        this.fields = [
          { key: 'alias', label: 'configs.alias' },
          { key: 'host', label: 'configs.host' },
          { key: 'port', label: 'configs.port' },
          {
            key: 'protocol',
            label: 'configs.protocol',
            type: 'select',
            options: ['ws', 'wss'],
            hint: this.$t('configs.serverProtocolHint') as string,
          },
          { key: 'path', label: 'configs.path' },
        ]
        this.canCreate = true
        this.hint = ''
        break
      case 'client':
        this.rows = getClientProfiles()
        this.columns = [
          { key: 'alias', label: 'configs.alias' },
          { key: 'clientId', label: 'configs.clientId' },
          { key: 'username', label: 'configs.username' },
        ]
        this.fields = [
          { key: 'alias', label: 'configs.alias' },
          { key: 'clientId', label: 'configs.clientId' },
          { key: 'username', label: 'configs.username' },
          { key: 'password', label: 'configs.password', type: 'password' },
        ]
        this.canCreate = true
        this.hint = ''
        break
      case 'message':
        this.rows = getMessagePresets()
        this.columns = [
          { key: 'name', label: 'configs.name' },
          { key: 'topic', label: 'configs.topic' },
          { key: 'payload', label: 'configs.payload' },
        ]
        // name/topic/payload are rendered by the dedicated branch (the payload needs the editor).
        this.fields = []
        this.canCreate = true
        this.hint = ''
        break
      case 'topic':
        this.rows = getTopicPresets()
        this.columns = [
          { key: 'name', label: 'configs.name' },
          { key: 'topic', label: 'configs.topic' },
        ]
        this.fields = [
          { key: 'name', label: 'configs.name' },
          { key: 'topic', label: 'configs.topic' },
        ]
        this.canCreate = true
        this.hint = ''
        break
      case 'sequence':
        this.rows = getMessageSequencePresets().map((preset) => ({
          id: preset.id,
          name: preset.name,
          steps: `${(preset.sequence?.steps ?? []).length} ${this.$t('configs.steps') as string}`,
        }))
        this.columns = [
          { key: 'name', label: 'configs.name' },
          { key: 'steps', label: 'configs.steps', width: 140 },
        ]
        this.fields = []
        this.canCreate = true
        this.hint = ''
        break
      case 'reply':
        this.rows = getAutoReplyPresets().map((preset) => ({
          id: preset.id,
          name: preset.name,
          matchTopic: preset.rule?.matchTopic ?? '',
        }))
        this.columns = [
          { key: 'name', label: 'configs.name' },
          { key: 'matchTopic', label: 'configs.topic' },
        ]
        this.fields = []
        this.canCreate = true
        this.hint = ''
        break
      case 'variable': {
        const definitions = normalizeGlobalVariables(getGlobalVariables())
        this.rows = getGlobalVariables().map((variable) => {
          const definition = definitions[variable.name?.trim() ?? '']
          const stateful = Boolean(definition && definition.kind !== 'constant')
          const kind = definition?.kind ?? 'constant'
          return {
            id: variable.id,
            name: variable.name,
            kindLabel: this.$t(`configs.variableKind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`) as string,
            value: variable.value,
            // For a stateful variable the default and the current value differ: the counter the
            // app is actually using lives in the runtime state, not in the stored definition.
            current: stateful && definition ? String(peekDefinitionValue(definition) ?? '') : variable.value,
            stateful,
          }
        })
        this.columns = [
          { key: 'name', label: 'configs.variableName' },
          { key: 'kindLabel', label: 'configs.variableKind', width: 120 },
          { key: 'value', label: 'configs.variableDefault', width: 180 },
          { key: 'current', label: 'configs.variableCurrentValue', width: 180 },
        ]
        // name and definition are rendered by the dedicated branch.
        this.fields = []
        this.canCreate = true
        this.hint = ''
        break
      }
      case 'behavior': {
        const templates = getBehaviorTemplates()
        this.rows = templates.map((template) => ({
          id: template.id,
          name: template.name,
          parentName: templates.find((item) => item.id === template.parentId)?.name ?? '',
        }))
        this.columns = [
          { key: 'name', label: 'configs.name' },
          { key: 'parentName', label: 'configs.behaviorParent', width: 180 },
        ]
        this.fields = []
        this.canCreate = true
        this.hint = this.$t('configs.behaviorHint') as string
        break
      }
      default:
        break
    }
  }

  /** The stored record behind the dialog, or an empty object when the dialog creates a new one. */
  private stored(kind: TabKey): { [key: string]: $TSFixed } {
    const id = this.draft.id
    if (!id) {
      return {}
    }
    switch (kind) {
      case 'server':
        return (getServerProfiles().find((item) => item.id === id) ?? {}) as { [key: string]: $TSFixed }
      case 'client':
        return (getClientProfiles().find((item) => item.id === id) ?? {}) as { [key: string]: $TSFixed }
      case 'variable':
        return (getGlobalVariables().find((item) => item.id === id) ?? {}) as { [key: string]: $TSFixed }
      default:
        return {}
    }
  }

  private openCreate() {
    this.sequenceDraft = []
    this.replyDraft = []
    this.behaviorDraft = this.blankBehavior()
    this.behaviorParentOptions = behaviorParentChoices(getBehaviorTemplates(), '')
    this.draft = this.fields.reduce<{ [key: string]: $TSFixed }>((draft, field) => {
      draft[field.key] = field.type === 'select' ? field.options?.[0] : ''
      return draft
    }, {})
    if (this.activeTab === 'server' && !this.draft.port) {
      this.draft.port = '8083'
    }
    if (this.activeTab === 'variable') {
      this.draft = { name: '', value: '', stored: '' }
    }
    if (this.activeTab === 'message') {
      // The editor is bound to `draft.payload` through v-model and needs a string, not undefined.
      this.draft = { name: '', topic: '', payload: '' }
    }
    if (this.activeTab === 'sequence' || this.activeTab === 'reply' || this.activeTab === 'behavior') {
      // The name box is `draft.name`. It has to exist up front: Vue 2 does not observe a property
      // added later, and the save reads this field.
      this.draft = { name: '' }
    }
    this.dialogVisible = true
  }

  private openEdit(row: { [key: string]: $TSFixed }) {
    this.draft = { ...row }
    if (this.activeTab === 'variable') {
      const variable = getGlobalVariables().find((item) => item.id === row.id)
      this.draft = {
        id: row.id,
        name: variable?.name ?? row.name,
        stored: (variable?.definition ?? variable?.value ?? '') as StoredVariable,
      }
    }
    if (this.activeTab === 'sequence') {
      const preset = getMessageSequencePresets().find((item) => item.id === row.id)
      this.sequenceDraft = preset?.sequence ? [JSON.parse(JSON.stringify(preset.sequence))] : []
    } else if (this.activeTab === 'behavior') {
      const found = getBehaviorTemplates().find((item) => item.id === row.id)
      if (found) {
        // A copy, not the cached record. The editors mutate their lists in place; editing the
        // cached object would keep the change after Cancel, and the next save of any template
        // would write it.
        const template = JSON.parse(JSON.stringify(found)) as BehaviorTemplateModel
        this.behaviorDraft = {
          ...template,
          session: (template.session ?? {}) as BehaviorSessionConfig,
          will: (template.will ?? {}) as BehaviorWillConfig,
          variables: template.variables ?? {},
          autoSubscriptions: template.autoSubscriptions ?? [],
          connectReports: template.connectReports ?? [],
          timedReports: template.timedReports ?? [],
          autoReplies: template.autoReplies ?? [],
          messageSequences: template.messageSequences ?? [],
        } as $TSFixed
        this.draft = { id: template.id, name: template.name ?? '' }
        this.behaviorParentOptions = behaviorParentChoices(getBehaviorTemplates(), template.id)
      }
    } else if (this.activeTab === 'reply') {
      const preset = getAutoReplyPresets().find((item) => item.id === row.id)
      const rules = preset?.rules ?? (preset?.rule ? [preset.rule] : [])
      this.replyDraft = JSON.parse(JSON.stringify(rules))
    }
    this.dialogVisible = true
  }

  private save() {
    if (this.activeTab === 'behavior') {
      const name = String(this.draft.name ?? '').trim()
      if (!name) {
        this.$message.error(this.$t('configs.nameRequired') as string)
        return
      }
      const existing = getBehaviorTemplates().find((item) => item.id === this.behaviorDraft.id)
      saveBehaviorTemplate({
        ...(existing ?? {}),
        id: this.behaviorDraft.id || undefined,
        name,
        parentId: this.behaviorDraft.parentId || null,
        defaultServerId: this.behaviorDraft.defaultServerId || null,
        username: this.behaviorDraft.usernameFrom === 'template' ? this.behaviorDraft.username || undefined : undefined,
        password: this.behaviorDraft.passwordFrom === 'template' ? this.behaviorDraft.password || undefined : undefined,
        usernameFrom: this.behaviorDraft.usernameFrom || null,
        passwordFrom: this.behaviorDraft.passwordFrom || null,
        variables: { ...(this.behaviorDraft.variables ?? {}) },
        autoSubscriptions: this.behaviorDraft.autoSubscriptions ?? [],
        connectReports: this.behaviorDraft.connectReports ?? [],
        timedReports: this.behaviorDraft.timedReports ?? [],
        autoReplies: this.behaviorDraft.autoReplies ?? [],
        messageSequences: this.behaviorDraft.messageSequences ?? [],
        // Only the fields the user actually set are stored; everything else follows the parent.
        session: compactBehaviorConfig(this.behaviorDraft.session),
        will: compactBehaviorConfig(this.behaviorDraft.will),
      })
      this.dialogVisible = false
      this.$message.success(this.$t('configs.saveSuccess') as string)
      this.loadActive()
      return
    }
    if (this.activeTab === 'sequence') {
      const sequence = this.sequenceDraft[0]
      const hasStep = (sequence?.steps ?? []).some((step) => String(step?.topic ?? '').trim() !== '')
      if (!sequence || !hasStep) {
        this.$message.error(this.$t('configs.sequencePresetNoTopic') as string)
        return
      }
      const name = String(this.draft.name ?? '').trim() || sequence.name || sequence.id
      // Merged with the stored preset: this dialog edits the sequence and the name only, so the
      // variables the preset carries for that sequence must survive an edit.
      const existing = getMessageSequencePresets().find((item) => item.id === this.draft.id)
      saveMessageSequencePreset({
        ...(existing ?? {}),
        id: this.draft.id,
        name,
        sequence: { ...sequence, name },
      })
      this.dialogVisible = false
      this.$message.success(this.$t('configs.saveSuccess') as string)
      this.loadActive()
      return
    }
    if (this.activeTab === 'reply') {
      const rules = this.replyDraft.filter((rule) => String(rule?.matchTopic ?? '').trim() !== '')
      if (!rules.length) {
        this.$message.error(this.$t('configs.replyPresetNoTopic') as string)
        return
      }
      const name = String(this.draft.name ?? '').trim() || rules[0].name || rules[0].id
      const savedRules = rules.map((rule) => ({
        ...rule,
        name: String(rule.name ?? '').trim() || name,
      }))
      const existing = getAutoReplyPresets().find((item) => item.id === this.draft.id)
      saveAutoReplyPreset({
        ...(existing ?? {}),
        id: this.draft.id,
        name,
        rule: savedRules[0],
        rules: savedRules,
      })
      this.dialogVisible = false
      this.$message.success(this.$t('configs.saveSuccess') as string)
      this.loadActive()
      return
    }
    switch (this.activeTab) {
      case 'server':
        saveServerProfile({
          ...(this.stored('server') as object),
          id: this.draft.id,
          alias: this.draft.alias || this.draft.host,
          host: this.draft.host ?? '',
          port: Number(this.draft.port) || 0,
          protocol: (this.draft.protocol ?? 'ws') as ServerProfileModel['protocol'],
          // An empty path must overwrite the stored one. Omitting the field keeps the old value
          // because the saved record is spread in above.
          path: String(this.draft.path ?? '').trim() || undefined,
        })
        break
      case 'client':
        saveClientProfile({
          // The dialog edits the identity only; a client preset may also carry variables and the
          // three automation lists, and losing them on a rename would be silent data loss.
          ...(this.stored('client') as object),
          id: this.draft.id,
          alias: this.draft.alias || this.draft.clientId,
          clientId: this.draft.clientId ?? '',
          username: this.draft.username || undefined,
          password: this.draft.password || undefined,
        })
        break
      case 'message':
        saveMessagePreset({
          id: this.draft.id,
          name: this.draft.name ?? '',
          topic: this.draft.topic ?? '',
          payload: this.draft.payload ?? '',
        })
        break
      case 'topic':
        saveTopicPreset({
          id: this.draft.id,
          name: this.draft.name ?? '',
          topic: this.draft.topic ?? '',
        })
        break
      case 'variable': {
        const name = String(this.draft.name ?? '').trim()
        // Same rule as the desktop page: the name must be referenceable as `${name}`, must not
        // shadow a built-in and must be unique among the other global variables.
        const taken = getGlobalVariables().filter((item) => item.id !== this.draft.id).map((item) => item.name)
        const issue = validateVariableName(name, taken)
        if (issue) {
          const key = `configs.variableName${issue.charAt(0).toUpperCase()}${issue.slice(1)}`
          this.$message.error(this.$t(key) as string)
          return
        }
        const stored = this.variableStored
        // A constant is stored as a plain string; a stateful variable keeps its definition object
        // (counter / random / ...), which is what the runtime reads back.
        saveGlobalVariable({
          ...(this.stored('variable') as object),
          id: this.draft.id,
          name: String(this.draft.name ?? '').trim(),
          value: typeof stored === 'string' ? stored : String(stored.value ?? ''),
          ...(typeof stored === 'string' ? { definition: undefined } : { definition: stored }),
        })
        break
      }
      default:
        break
    }
    this.dialogVisible = false
    this.$message.success(this.$t('configs.saveSuccess') as string)
    this.loadActive()
  }

  /** Resets the shared current value of a stateful global variable back to its default. */
  private resetVariableValue(row: { [key: string]: $TSFixed }) {
    const definition = normalizeGlobalVariables(getGlobalVariables())[String(row.name ?? '').trim()]
    if (definition && resetVariable(definition)) {
      this.$message.success(this.$t('configs.variableResetDone', { name: row.name }) as string)
    }
    this.loadActive()
  }

  private remove(row: { [key: string]: $TSFixed }) {
    if (this.activeTab === 'behavior' && behaviorTemplateHasChildren(row.id)) {
      this.$message.error(this.$t('configs.behaviorHasChildren') as string)
      return
    }
    this.$confirm(this.$t('configs.deleteConfirm') as string, {
      type: 'warning',
      confirmButtonText: this.$t('configs.confirm') as string,
      cancelButtonText: this.$t('configs.cancel') as string,
    })
      .then(() => {
        switch (this.activeTab) {
          case 'server':
            deleteServerProfile(row.id)
            break
          case 'client':
            deleteClientProfile(row.id)
            break
          case 'message':
            deleteMessagePreset(row.id)
            break
          case 'topic':
            deleteTopicPreset(row.id)
            break
          case 'sequence':
            deleteMessageSequencePreset(row.id)
            break
          case 'reply':
            deleteAutoReplyPreset(row.id)
            break
          case 'variable':
            deleteGlobalVariable(row.id)
            break
          case 'behavior':
            deleteBehaviorTemplate(row.id)
            break
          default:
            break
        }
        this.loadActive()
      })
      .catch(() => undefined)
  }
}
</script>

<style lang="scss" scoped>
.configs-view {
  padding: 0 16px;
}

.configs-topbar {
  height: 48px;
  display: flex;
  align-items: center;
}

.titlebar {
  font-size: 15px;
  font-weight: 600;
}

.configs-container {
  padding-bottom: 24px;
}

.configs-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}


.preset-payload-editor {
  height: 240px;
  min-height: 120px;
  max-height: 70vh;
  border: 1px solid var(--color-border-default, #dcdfe6);
  border-radius: 4px;
  overflow: hidden;
  resize: vertical;
}

.preset-payload-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.6;
}

.preset-payload-format {
  color: var(--color-main-green, #00b173);
}

.preset-payload-format:hover {
  text-decoration: underline;
}

.configs-table {
  width: 100%;
}

.empty-hint {
  margin: 12px 0 0;
  color: #909399;
  font-size: 12px;
}

.danger {
  color: #f56c6c;
}
</style>
