<template>
  <div class="configs-view rightbar">
    <h1 class="titlebar">{{ $t('configs.title') }}</h1>
    <div class="configs-view-tabs">
      <el-tabs v-model="activeTab">
        <el-tab-pane :label="$t('configs.serverProfiles')" name="server"></el-tab-pane>
        <el-tab-pane :label="$t('configs.clientProfiles')" name="client"></el-tab-pane>
        <el-tab-pane :label="$t('configs.messagePresets')" name="message"></el-tab-pane>
        <el-tab-pane :label="$t('configs.globalVariables')" name="variable"></el-tab-pane>
      </el-tabs>
    </div>
    <div class="configs-view-header">
      <el-button class="profile-add-btn" type="primary" size="mini" icon="el-icon-plus" @click="handleAdd">
        {{ $t('configs.addProfile') }}
      </el-button>
    </div>
    <div class="configs-view-body">
      <!-- 服务器配置列表 -->
      <el-table
        v-if="activeTab === 'server'"
        :data="serverProfiles"
        size="mini"
        :empty-text="$t('configs.empty')"
        row-key="id"
      >
        <el-table-column
          :label="$t('configs.alias')"
          prop="alias"
          min-width="140"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column :label="$t('configs.host')" min-width="180" show-overflow-tooltip>
          <template slot-scope="{ row }">{{ row.host }}</template>
        </el-table-column>
        <el-table-column :label="$t('configs.port')" prop="port" width="90"></el-table-column>
        <el-table-column :label="$t('configs.protocol')" width="110">
          <template slot-scope="{ row }">
            <el-tag size="mini" :type="['mqtts', 'wss'].includes(row.protocol) ? 'success' : 'info'">
              {{ row.protocol }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.oper')" width="110" align="center">
          <template slot-scope="{ row }">
            <a href="javascript:;" class="profile-oper" @click="handleEdit(row)">
              <i class="iconfont icon-edit"></i>
            </a>
            <a href="javascript:;" class="profile-oper danger" @click="handleDelete(row)">
              <i class="iconfont icon-delete"></i>
            </a>
          </template>
        </el-table-column>
      </el-table>

      <!-- 客户端预设列表 -->
      <el-table
        v-else-if="activeTab === 'client'"
        :data="clientProfiles"
        size="mini"
        :empty-text="$t('configs.empty')"
        row-key="id"
      >
        <el-table-column
          :label="$t('configs.alias')"
          prop="alias"
          min-width="140"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column label="Client ID" prop="clientId" min-width="180" show-overflow-tooltip></el-table-column>
        <el-table-column :label="$t('connections.username')" prop="username" min-width="120" show-overflow-tooltip>
          <template slot-scope="{ row }">{{ row.username || '-' }}</template>
        </el-table-column>
        <el-table-column :label="$t('connections.password')" width="110" align="center">
          <template slot-scope="{ row }">{{ row.password ? '••••••' : '-' }}</template>
        </el-table-column>
        <el-table-column :label="$t('common.oper')" width="110" align="center">
          <template slot-scope="{ row }">
            <a href="javascript:;" class="profile-oper" @click="handleEdit(row)">
              <i class="iconfont icon-edit"></i>
            </a>
            <a href="javascript:;" class="profile-oper danger" @click="handleDelete(row)">
              <i class="iconfont icon-delete"></i>
            </a>
          </template>
        </el-table-column>
      </el-table>

      <!-- 全局变量预设列表 -->
      <template v-else-if="activeTab === 'variable'">
        <p class="variable-preset-tip">{{ $t('configs.variablesTip') }}</p>
        <el-table :data="globalVariables" size="mini" :empty-text="$t('configs.empty')" row-key="id">
          <el-table-column
            :label="$t('configs.variableName')"
            prop="name"
            min-width="200"
            show-overflow-tooltip
          ></el-table-column>
          <el-table-column :label="$t('configs.variableValue')" min-width="260" show-overflow-tooltip>
            <template slot-scope="{ row }">{{ row.value }}</template>
          </el-table-column>
          <el-table-column :label="$t('common.oper')" width="110" align="center">
            <template slot-scope="{ row }">
              <a href="javascript:;" class="profile-oper" @click="handleEdit(row)">
                <i class="iconfont icon-edit"></i>
              </a>
              <a href="javascript:;" class="profile-oper danger" @click="handleDelete(row)">
                <i class="iconfont icon-delete"></i>
              </a>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 消息预设列表 -->
      <el-table v-else :data="messagePresets" size="mini" :empty-text="$t('configs.empty')" row-key="id">
        <el-table-column
          :label="$t('configs.name')"
          prop="name"
          min-width="140"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column
          :label="$t('configs.topic')"
          prop="topic"
          min-width="160"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column :label="$t('configs.message')" min-width="220" show-overflow-tooltip>
          <template slot-scope="{ row }">
            <MessagePreview :payload="row.payload" />
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.oper')" width="110" align="center">
          <template slot-scope="{ row }">
            <a href="javascript:;" class="profile-oper" @click="handleEdit(row)">
              <i class="iconfont icon-edit"></i>
            </a>
            <a href="javascript:;" class="profile-oper danger" @click="handleDelete(row)">
              <i class="iconfont icon-delete"></i>
            </a>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 新增 / 编辑对话框 -->
    <my-dialog
      :title="editingId ? $t('configs.editProfile') : $t('configs.addProfile')"
      :visible.sync="dialogVisible"
      :width="'460px'"
      @confirm="handleSave"
    >
      <el-form
        ref="profileForm"
        label-position="left"
        label-width="110px"
        size="small"
        :model="profileForm"
        :rules="profileRules"
      >
        <el-form-item
          v-if="dialogType === 'server' || dialogType === 'client'"
          :label="$t('configs.alias')"
          prop="alias"
        >
          <el-input v-model.trim="profileForm.alias" clearable :placeholder="$t('configs.alias')"></el-input>
        </el-form-item>

        <template v-if="dialogType === 'server'">
          <el-form-item :label="$t('configs.protocol')" prop="protocol">
            <el-select v-model="profileForm.protocol" style="width: 100%">
              <el-option label="mqtt://" value="mqtt"></el-option>
              <el-option label="mqtts://" value="mqtts"></el-option>
              <el-option label="ws://" value="ws"></el-option>
              <el-option label="wss://" value="wss"></el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('configs.host')" prop="host">
            <el-input v-model.trim="profileForm.host" clearable></el-input>
          </el-form-item>
          <el-form-item :label="$t('configs.port')" prop="port">
            <el-input-number
              v-model="profileForm.port"
              controls-position="right"
              :min="0"
              :max="65535"
              style="width: 100%"
            ></el-input-number>
          </el-form-item>
          <el-form-item v-if="['ws', 'wss'].includes(profileForm.protocol)" :label="$t('configs.path')">
            <el-input v-model.trim="profileForm.path" clearable placeholder="/mqtt"></el-input>
          </el-form-item>
        </template>

        <template v-else-if="dialogType === 'message'">
          <el-form-item :label="$t('configs.name')" prop="name">
            <el-input v-model.trim="profileForm.name" clearable :placeholder="$t('configs.name')"></el-input>
          </el-form-item>
          <el-form-item :label="$t('configs.topic')" prop="topic">
            <el-input v-model.trim="profileForm.topic" clearable placeholder="sensor/temperature"></el-input>
          </el-form-item>
          <el-form-item :label="$t('configs.message')" prop="payload">
            <el-input
              v-model="profileForm.payload"
              type="textarea"
              :rows="6"
              :placeholder="`{&quot;temperature&quot;: ${'${timestamp}'}}`"
            ></el-input>
          </el-form-item>
        </template>

        <template v-else-if="dialogType === 'variable'">
          <el-form-item :label="$t('configs.variableName')" prop="name">
            <el-input v-model.trim="profileForm.name" clearable placeholder="deviceId"></el-input>
          </el-form-item>
          <el-form-item :label="$t('configs.variableValue')" prop="value">
            <el-input v-model="profileForm.value" clearable :placeholder="`${'${timestamp}'} / dl / 26.5`"></el-input>
          </el-form-item>
          <p class="variable-preset-hint">{{ $t('configs.variableValueTip') }}</p>
        </template>

        <template v-else>
          <el-form-item label="Client ID" prop="clientId">
            <el-input v-model.trim="profileForm.clientId" clearable></el-input>
          </el-form-item>
          <el-form-item :label="$t('connections.username')">
            <el-input v-model.trim="profileForm.username" clearable></el-input>
          </el-form-item>
          <el-form-item :label="$t('connections.password')">
            <el-input v-model.trim="profileForm.password" show-password clearable></el-input>
          </el-form-item>
          <el-form-item :label="$t('connections.mqttVersion')">
            <el-select v-model="profileForm.mqttVersion" style="width: 100%">
              <el-option value="3.1" label="3.1"></el-option>
              <el-option value="3.1.1" label="3.1.1"></el-option>
              <el-option value="5.0" label="5.0"></el-option>
            </el-select>
          </el-form-item>
          <el-form-item :label="$t('connections.connectionTimeout')">
            <el-input-number
              v-model="profileForm.connectTimeout"
              controls-position="right"
              :min="0"
              class="client-profile-number"
            ></el-input-number>
            <span class="client-profile-unit">({{ $t('common.unitS') }})</span>
          </el-form-item>
          <el-form-item label="Keep Alive">
            <el-input-number
              v-model="profileForm.keepalive"
              controls-position="right"
              :min="0"
              class="client-profile-number"
            ></el-input-number>
            <span class="client-profile-unit">({{ $t('common.unitS') }})</span>
          </el-form-item>
          <el-form-item :label="$t('connections.autoReconnect')">
            <el-switch v-model="profileForm.reconnect" active-color="#13ce66" inactive-color="#A2A9B0"> </el-switch>
          </el-form-item>
          <el-form-item v-if="profileForm.reconnect" :label="$t('connections.reconnectPeriod')">
            <el-input-number
              v-model="profileForm.reconnectPeriod"
              controls-position="right"
              :min="1"
              class="client-profile-number"
            ></el-input-number>
            <span class="client-profile-unit">({{ $t('common.unitMS') }})</span>
          </el-form-item>
          <el-form-item :label="profileForm.mqttVersion === '5.0' ? 'Clean Start' : 'Clean Session'">
            <el-switch v-model="profileForm.clean" active-color="#13ce66" inactive-color="#A2A9B0"> </el-switch>
          </el-form-item>
        </template>
      </el-form>
    </my-dialog>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator'
import MyDialog from '@/components/MyDialog.vue'
import MessagePreview from '@/components/MessagePreview.vue'
import {
  getClientProfiles,
  deleteClientProfile,
  saveClientProfile,
  getServerProfiles,
  deleteServerProfile,
  saveServerProfile,
  getMessagePresets,
  getMessagePreset,
  saveMessagePreset,
  deleteMessagePreset,
  getGlobalVariables,
  saveGlobalVariable,
  deleteGlobalVariable,
} from '@/utils/configProfiles'
import { PAYLOAD_VARIABLE_NAME_PATTERN, isBuiltinPayloadVariable } from '@/utils/payloadVariables'

type DialogType = 'server' | 'client' | 'message' | 'variable'

interface ServerProfileForm {
  id?: string
  alias: string
  host: string
  port: number | undefined
  protocol: 'mqtt' | 'mqtts' | 'ws' | 'wss'
  path?: string
}

interface ClientProfileForm {
  id?: string
  alias: string
  clientId: string
  username?: string
  password?: string
  mqttVersion: '3.1' | '3.1.1' | '5.0'
  connectTimeout: number
  keepalive: number
  reconnect: boolean
  reconnectPeriod: number
  clean: boolean
}

/** Mirrors getDefaultRecord() so a fresh client profile matches a fresh connection form. */
const defaultClientProfileForm = (): ClientProfileForm => ({
  alias: '',
  clientId: '',
  username: '',
  password: '',
  mqttVersion: '5.0',
  connectTimeout: 10,
  keepalive: 60,
  reconnect: true,
  reconnectPeriod: 4000,
  clean: true,
})

interface MessagePresetForm {
  id?: string
  name: string
  topic: string
  payload: string
}

interface VariableForm {
  id?: string
  name: string
  value: string
}

@Component({
  components: { MyDialog, MessagePreview },
})
export default class Configs extends Vue {
  private activeTab: DialogType = 'server'
  private serverProfiles: ServerProfileModel[] = []
  private clientProfiles: ClientProfileModel[] = []
  private messagePresets: MessagePresetModel[] = []
  private globalVariables: GlobalVariableModel[] = []

  private dialogVisible = false
  private editingId: string | null = null
  private dialogType: DialogType = 'server'

  private profileForm: (ServerProfileForm | ClientProfileForm | MessagePresetForm | VariableForm) & {
    [key: string]: any
  } = {
    alias: '',
    host: '',
    port: 1883,
    protocol: 'mqtt',
    path: undefined,
    clientId: '',
    username: '',
    password: '',
  }

  get profileRules() {
    return {
      alias: [{ required: true, message: this.$t('configs.requiredField'), trigger: 'blur' }],
      host: [{ required: true, message: this.$t('configs.requiredField'), trigger: 'blur' }],
      clientId: [{ required: true, message: this.$t('configs.requiredField'), trigger: 'blur' }],
      name: [
        { required: true, message: this.$t('configs.requiredField'), trigger: 'blur' },
        { validator: this.validateVariableName, trigger: 'blur' },
      ],
      topic: [{ required: true, message: this.$t('configs.requiredField'), trigger: 'blur' }],
      payload: [
        {
          // A message made only of spaces and line breaks is not a usable payload: report it as
          // missing instead of storing a preset whose message looks empty in the list.
          validator: (rule: unknown, value: string, callback: (error?: Error) => void) => {
            if (typeof value !== 'string' || value.trim() === '') {
              callback(new Error(this.$t('configs.requiredField') as string))
              return
            }
            callback()
          },
          trigger: 'blur',
        },
      ],
      value: [
        {
          // An empty value resolves to nothing, which is the same as an undefined variable.
          validator: (rule: unknown, value: string, callback: (error?: Error) => void) => {
            if (typeof value !== 'string' || value.trim() === '') {
              callback(new Error(this.$t('configs.requiredField') as string))
              return
            }
            callback()
          },
          trigger: 'blur',
        },
      ],
    }
  }

  /**
   * A variable name has to be referenceable as `${name}`, must not shadow a built-in variable and
   * must be unique. Only the variable dialog constrains `name` this way: a preset name is free
   * text, so this validator passes for the other dialogs.
   */
  private validateVariableName(rule: unknown, value: string, callback: (error?: Error) => void) {
    if (this.dialogType !== 'variable') {
      callback()
      return
    }
    const name = (value ?? '').trim()
    if (!PAYLOAD_VARIABLE_NAME_PATTERN.test(name)) {
      callback(new Error(this.$t('configs.variableNameInvalid') as string))
      return
    }
    if (isBuiltinPayloadVariable(name)) {
      callback(new Error(this.$t('configs.variableNameReserved') as string))
      return
    }
    const duplicate = this.globalVariables.some((variable) => variable.name === name && variable.id !== this.editingId)
    if (duplicate) {
      callback(new Error(this.$t('configs.variableNameDuplicate') as string))
      return
    }
    callback()
  }

  @Watch('activeTab')
  private handleTabChange() {
    this.loadData()
  }

  private loadData() {
    this.serverProfiles = getServerProfiles()
    this.clientProfiles = getClientProfiles()
    this.messagePresets = getMessagePresets()
    this.globalVariables = getGlobalVariables()
  }

  private created() {
    this.loadData()
  }

  private handleAdd() {
    this.dialogType = this.activeTab
    this.editingId = null
    if (this.activeTab === 'server') {
      this.profileForm = { alias: '', host: '', port: 1883, protocol: 'mqtt', path: undefined }
    } else if (this.activeTab === 'message') {
      this.profileForm = { name: '', topic: '', payload: '' }
    } else if (this.activeTab === 'variable') {
      this.profileForm = { name: '', value: '' }
    } else {
      this.profileForm = defaultClientProfileForm()
    }
    this.dialogVisible = true
    this.clearProfileValidation()
  }

  /**
   * `MyDialog` keeps its body mounted (no destroy-on-close), and `el-form-item` keeps its
   * validation state, so a "field is required" error from a previous open would still be
   * displayed under a now valid field. Clear it whenever the dialog opens.
   */
  private clearProfileValidation() {
    this.$nextTick(() => {
      const form = this.$refs.profileForm as { clearValidate?: () => void } | undefined
      form?.clearValidate?.()
    })
  }

  private handleEdit(row: ServerProfileModel | ClientProfileModel | MessagePresetModel | GlobalVariableModel) {
    this.dialogType = this.activeTab
    this.editingId = row.id
    if (this.activeTab === 'variable') {
      const variable = row as GlobalVariableModel
      this.profileForm = { id: variable.id, name: variable.name, value: variable.value }
    } else if (this.activeTab === 'server') {
      const server = row as ServerProfileModel
      this.profileForm = {
        id: server.id,
        alias: server.alias,
        host: server.host,
        port: server.port,
        protocol: server.protocol,
        path: server.path,
      }
    } else if (this.activeTab === 'message') {
      const preset = row as MessagePresetModel
      this.profileForm = {
        id: preset.id,
        name: preset.name,
        topic: preset.topic,
        payload: preset.payload,
      }
    } else {
      const client = row as ClientProfileModel
      this.profileForm = {
        ...defaultClientProfileForm(),
        id: client.id,
        alias: client.alias,
        clientId: client.clientId,
        username: client.username,
        password: client.password,
        // legacy profiles may not carry these fields yet — fall back to app defaults
        mqttVersion: client.mqttVersion ?? '5.0',
        connectTimeout: client.connectTimeout ?? 10,
        keepalive: client.keepalive ?? 60,
        reconnect: client.reconnect ?? true,
        reconnectPeriod: client.reconnectPeriod ?? 4000,
        clean: client.clean ?? true,
      }
    }
    this.dialogVisible = true
    this.clearProfileValidation()
  }

  private handleDelete(row: ServerProfileModel | ClientProfileModel | MessagePresetModel | GlobalVariableModel) {
    this.$confirm(this.$t('configs.deleteConfirm') as string, this.$tc('common.warning'), {
      type: 'warning',
    })
      .then(() => {
        if (this.activeTab === 'server') {
          deleteServerProfile(row.id)
        } else if (this.activeTab === 'message') {
          deleteMessagePreset(row.id)
        } else if (this.activeTab === 'variable') {
          deleteGlobalVariable(row.id)
        } else {
          deleteClientProfile(row.id)
        }
        this.loadData()
        this.$message.success(this.$tc('common.deleteSuccess'))
      })
      .catch(() => undefined)
  }

  private handleSave() {
    const formRef = this.$refs.profileForm as any
    formRef.validate(async (valid: boolean) => {
      if (!valid) {
        return
      }
      if (this.dialogType === 'server') {
        saveServerProfile({
          id: this.editingId ?? undefined,
          alias: this.profileForm.alias,
          host: this.profileForm.host,
          port: Number(this.profileForm.port) || 1883,
          protocol: this.profileForm.protocol,
          path: ['ws', 'wss'].includes(this.profileForm.protocol) ? this.profileForm.path || '/mqtt' : undefined,
        })
      } else if (this.dialogType === 'variable') {
        saveGlobalVariable({
          id: this.editingId ?? undefined,
          name: this.profileForm.name,
          value: this.profileForm.value,
        })
      } else if (this.dialogType === 'message') {
        saveMessagePreset({
          id: this.editingId ?? undefined,
          name: this.profileForm.name,
          topic: this.profileForm.topic,
          payload: this.profileForm.payload,
        })
      } else {
        saveClientProfile({
          id: this.editingId ?? undefined,
          alias: this.profileForm.alias,
          clientId: this.profileForm.clientId,
          username: this.profileForm.username || undefined,
          password: this.profileForm.password || undefined,
          mqttVersion: this.profileForm.mqttVersion,
          connectTimeout: Number(this.profileForm.connectTimeout) || 0,
          keepalive: Number(this.profileForm.keepalive) || 0,
          reconnect: Boolean(this.profileForm.reconnect),
          reconnectPeriod: Number(this.profileForm.reconnectPeriod) || 4000,
          clean: Boolean(this.profileForm.clean),
        })
      }
      this.loadData()
      this.dialogVisible = false
    })
  }
}
</script>

<style lang="scss">
.configs-view {
  padding: 0 16px 16px;

  .titlebar {
    padding: 16px 0;
  }
  .configs-view-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
  }
  .profile-oper {
    margin: 0 6px;
    .iconfont {
      font-size: 16px;
    }
    &:hover .iconfont {
      color: var(--color-main-green);
    }
    &.danger:hover .iconfont {
      color: var(--color-minor-red);
    }
  }
  .client-profile-number {
    width: calc(100% - 56px);
  }
  .client-profile-unit {
    margin-left: 8px;
    color: var(--color-text-default);
  }
  .variable-preset-tip,
  .variable-preset-hint {
    margin: 0 0 12px;
    color: var(--color-text-tips);
    font-size: 12px;
    line-height: 1.7;
  }
  .variable-preset-hint {
    margin: 4px 0 0;
  }
}
</style>
