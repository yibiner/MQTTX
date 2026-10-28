<template>
  <div class="configs-view rightbar">
    <h1 class="titlebar">{{ $t('configs.title') }}</h1>
    <div class="configs-view-tabs">
      <el-tabs v-model="activeTab">
        <el-tab-pane :label="$t('configs.serverProfiles')" name="server"></el-tab-pane>
        <el-tab-pane :label="$t('configs.clientProfiles')" name="client"></el-tab-pane>
        <el-tab-pane :label="$t('configs.topicPresets')" name="topic"></el-tab-pane>
        <el-tab-pane :label="$t('configs.messagePresets')" name="message"></el-tab-pane>
        <el-tab-pane :label="$t('configs.messageSequencePresets')" name="sequence"></el-tab-pane>
        <el-tab-pane :label="$t('configs.autoReplyPresets')" name="reply"></el-tab-pane>
        <el-tab-pane :label="$t('configs.globalVariables')" name="variable"></el-tab-pane>
      </el-tabs>
    </div>
    <div class="configs-view-header">
      <VariablesHelp v-if="activeTab === 'variable'" class="configs-view-help" />
      <el-button class="profile-add-btn" type="primary" size="mini" icon="el-icon-plus" @click="handleAdd">
        {{ addBtnText }}
      </el-button>
    </div>
    <div class="configs-view-body">
      <!-- 服务器配置列表 -->
      <el-table
        v-if="activeTab === 'server'"
        key="server"
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
        key="client"
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
        <el-table-column :label="$t('connections.clientVariables')" min-width="170" show-overflow-tooltip>
          <template slot-scope="{ row }">{{ describeVariables(row.variables) }}</template>
        </el-table-column>
        <el-table-column :label="$t('connections.automation')" min-width="150" show-overflow-tooltip>
          <template slot-scope="{ row }">{{ describeAutomation(row) }}</template>
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
        <el-table
          key="variable"
          :data="variableRows()"
          size="mini"
          :empty-text="$t('configs.variablesEmpty')"
          row-key="raw.id"
        >
          <el-table-column
            :label="$t('configs.variableName')"
            prop="name"
            min-width="160"
            show-overflow-tooltip
          ></el-table-column>
          <el-table-column :label="$t('configs.variableType')" width="120" align="center">
            <template slot-scope="{ row }">
              <span :class="['variable-kind', row.stateful ? 'stateful' : 'constant']">{{ $t(row.kindKey) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="$t('configs.variableDefault')" min-width="180" show-overflow-tooltip>
            <template slot-scope="{ row }">
              <code class="variable-cell">{{ row.defaultValue }}</code>
            </template>
          </el-table-column>
          <el-table-column :label="$t('configs.variableCurrentValue')" min-width="160" show-overflow-tooltip>
            <template slot-scope="{ row }">
              <code class="variable-cell current">{{ row.currentValue }}</code>
            </template>
          </el-table-column>
          <el-table-column :label="$t('common.oper')" width="150" align="center">
            <template slot-scope="{ row }">
              <a href="javascript:;" class="profile-oper" @click="handleEdit(row.raw)">
                <i class="iconfont icon-edit"></i>
              </a>
              <el-tooltip v-if="row.stateful" :content="$t('configs.variableReset')" placement="top">
                <a href="javascript:;" class="profile-oper" @click="handleResetVariable(row)">
                  <i class="el-icon-refresh"></i>
                </a>
              </el-tooltip>
              <a href="javascript:;" class="profile-oper danger" @click="handleDelete(row.raw)">
                <i class="iconfont icon-delete"></i>
              </a>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 消息序列预设列表 -->
      <el-table
        v-else-if="activeTab === 'sequence'"
        key="sequence"
        :data="messageSequencePresets"
        size="mini"
        :empty-text="$t('configs.empty')"
        row-key="id"
      >
        <el-table-column
          :label="$t('configs.name')"
          prop="name"
          min-width="160"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column :label="$t('connections.messageSequenceTrigger')" width="120">
          <template slot-scope="{ row }">{{ sequenceTriggerLabel(row) }}</template>
        </el-table-column>
        <el-table-column :label="$t('connections.clientVariables')" min-width="180" show-overflow-tooltip>
          <template slot-scope="{ row }">{{ describeVariables(row.variables) }}</template>
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

      <!-- 自动回复预设列表 -->
      <el-table
        v-else-if="activeTab === 'reply'"
        key="reply"
        :data="autoReplyPresets"
        size="mini"
        :empty-text="$t('configs.empty')"
        row-key="id"
      >
        <el-table-column
          :label="$t('configs.name')"
          prop="name"
          min-width="160"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column :label="$t('connections.autoReplyMatchTopic')" min-width="200" show-overflow-tooltip>
          <template slot-scope="{ row }">{{ replyMatchTopic(row) }}</template>
        </el-table-column>
        <el-table-column :label="$t('configs.replyMode')" width="110" align="center">
          <template slot-scope="{ row }">{{ replyModeLabel(row) }}</template>
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

      <!-- Topic 预设列表 -->
      <el-table
        v-else-if="activeTab === 'topic'"
        key="topic"
        :data="topicPresets"
        size="mini"
        :empty-text="$t('configs.empty')"
        row-key="id"
      >
        <el-table-column
          :label="$t('configs.name')"
          prop="name"
          min-width="160"
          show-overflow-tooltip
        ></el-table-column>
        <el-table-column
          :label="$t('configs.topic')"
          prop="topic"
          min-width="280"
          show-overflow-tooltip
        ></el-table-column>
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

      <!-- 消息预设列表 -->
      <el-table
        v-else-if="activeTab === 'message'"
        key="message"
        :data="messagePresets"
        size="mini"
        :empty-text="$t('configs.empty')"
        row-key="id"
      >
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
      :title="editingId ? $t('configs.editProfile') : addBtnText"
      :visible.sync="dialogVisible"
      :width="dialogWidth"
      :top="dialogType === 'message' || dialogType === 'sequence' || dialogType === 'reply' ? '8vh' : '15vh'"
      @confirm="handleSave"
      @open="handleDialogOpen"
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

        <template v-else-if="dialogType === 'topic'">
          <el-form-item :label="$t('configs.name')" prop="name">
            <el-input v-model.trim="profileForm.name" clearable :placeholder="$t('configs.name')"></el-input>
          </el-form-item>
          <el-form-item :label="$t('configs.topic')" prop="topic">
            <el-input
              v-model.trim="profileForm.topic"
              clearable
              placeholder="app/${productType}/${clientId}/device/service/sub"
            ></el-input>
            <p class="topic-preset-hint">{{ $t('configs.topicPresetsHint') }}</p>
          </el-form-item>
        </template>

        <template v-else-if="dialogType === 'message'">
          <el-form-item :label="$t('configs.name')" prop="name">
            <el-input v-model.trim="profileForm.name" clearable :placeholder="$t('configs.name')"></el-input>
          </el-form-item>
          <el-form-item :label="$t('configs.topic')" prop="topic">
            <div class="topic-preset-field">
              <el-input v-model.trim="profileForm.topic" clearable placeholder="sensor/temperature"></el-input>
              <TopicPresetPicker @select="applyMessageTopicPreset" />
            </div>
          </el-form-item>
          <el-form-item prop="payload">
            <!-- The resize hint lives on the label, like every other hint of this dialog. -->
            <template slot="label">
              {{ $t('configs.message') }}
              <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
                <div slot="content">{{ $t('configs.payloadEditorHint') }}</div>
                <a href="javascript:;" class="preset-help">
                  <i class="el-icon-warning-outline"></i>
                </a>
              </el-tooltip>
            </template>
            <!-- the same editor as the publish panel: JSON highlight, formatting and a resizable box -->
            <div class="preset-payload-editor" @keyup.enter.stop @keydown.enter.stop>
              <Editor
                ref="presetPayloadEditor"
                id="preset-payload"
                v-model="profileForm.payload"
                :lang="presetPayloadLang"
                :useShadows="true"
                @format="formatPresetPayload"
              />
            </div>
            <div class="preset-payload-bar">
              <a href="javascript:;" class="preset-payload-format" @click="formatPresetPayload">
                {{ $t('configs.formatPayload') }}
              </a>
              <VariablesHelp />
            </div>
          </el-form-item>
        </template>

        <template v-else-if="dialogType === 'variable'">
          <el-form-item :label="$t('configs.variableName')" prop="name">
            <el-input v-model.trim="profileForm.name" clearable placeholder="deviceId"></el-input>
          </el-form-item>
          <el-form-item
            :label="variableDefinitionStateful ? $t('configs.variableDefinition') : $t('configs.variableValue')"
            :prop="variableDefinitionStateful ? '' : 'value'"
          >
            <VariableDefinitionEditor :value="variableStored" @change="handleVariableStoredChange" />
          </el-form-item>
        </template>

        <template v-else-if="dialogType === 'client'">
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
          <el-form-item class="automation-field">
            <template slot="label">
              {{ $t('connections.clientVariables') }}
              <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
                <div slot="content">{{ $t('configs.clientVariablesProfileTip') }}</div>
                <a href="javascript:;" class="preset-help">
                  <i class="el-icon-warning-outline"></i>
                </a>
              </el-tooltip>
            </template>
            <VariableEditor v-model="profileForm.variables" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.autoSubscribe')">
            <AutoSubscribeEditor v-model="profileForm.autoSubscriptions" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.autoReply')">
            <AutoReplyEditor
              v-model="profileForm.autoReplies"
              :variable-names="clientProfileVariableNames"
              :templates="autoReplyPresets"
              @example="applyAutomationExample"
            />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.messageSequence')">
            <MessageSequenceEditor
              v-model="profileForm.messageSequences"
              :variable-names="clientProfileVariableNames"
              :templates="messageSequencePresets"
              @example="applyAutomationExample"
            />
          </el-form-item>
        </template>

        <template v-else-if="dialogType === 'reply'">
          <el-form-item prop="name">
            <template slot="label">
              {{ $t('configs.name') }}
              <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
                <div slot="content">{{ $t('configs.autoReplyPresetTip') }}</div>
                <a href="javascript:;" class="preset-help">
                  <i class="el-icon-warning-outline"></i>
                </a>
              </el-tooltip>
            </template>
            <el-input v-model.trim="profileForm.name" clearable :placeholder="$t('configs.name')"></el-input>
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.clientVariables')">
            <VariableEditor v-model="profileForm.variables" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.autoReply')">
            <AutoReplyEditor
              v-model="profileForm.autoReplies"
              :variable-names="sequencePresetVariableNames"
              singleton
            />
          </el-form-item>
        </template>

        <template v-else-if="dialogType === 'sequence'">
          <el-form-item prop="name">
            <template slot="label">
              {{ $t('configs.name') }}
              <el-tooltip placement="top" :effect="tooltipEffect" :open-delay="500">
                <div slot="content">{{ $t('configs.messageSequencePresetTip') }}</div>
                <a href="javascript:;" class="preset-help">
                  <i class="el-icon-warning-outline"></i>
                </a>
              </el-tooltip>
            </template>
            <el-input v-model.trim="profileForm.name" clearable :placeholder="$t('configs.name')"></el-input>
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.clientVariables')">
            <VariableEditor v-model="profileForm.variables" />
          </el-form-item>
          <el-form-item class="automation-field" :label="$t('connections.messageSequence')">
            <MessageSequenceEditor
              v-model="profileForm.messageSequences"
              :variable-names="sequencePresetVariableNames"
              singleton
            />
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
  getTopicPresets,
  saveTopicPreset,
  deleteTopicPreset,
  ensureMessageSequencePresets,
  saveMessageSequencePreset,
  deleteMessageSequencePreset,
  getAutoReplyPresets,
  saveAutoReplyPreset,
  deleteAutoReplyPreset,
  getGlobalVariables,
  saveGlobalVariable,
  deleteGlobalVariable,
} from '@/utils/configProfiles'
import VariablesHelp from '@/components/VariablesHelp.vue'
import Editor from '@/components/Editor.vue'
import VariableEditor from '@/components/VariableEditor.vue'
import VariableDefinitionEditor from '@/components/VariableDefinitionEditor.vue'
import AutoSubscribeEditor from '@/components/AutoSubscribeEditor.vue'
import AutoReplyEditor, { createBlankAutoReplyRule } from '@/components/AutoReplyEditor.vue'
import MessageSequenceEditor from '@/components/MessageSequenceEditor.vue'
import TopicPresetPicker from '@/components/TopicPresetPicker.vue'
import {
  normalizeGlobalVariables,
  normalizeVariableDefinition,
  onGlobalVariableChanged,
  onGlobalVariableDeleted,
  peekDefinitionValue,
  resetVariable,
  toStoredVariable,
  validateStoredVariables,
  validateVariableDefinition,
  validateVariableName,
} from '@/utils/payloadVariables'
import type { ResolvedVariableDefinition } from '@/utils/payloadVariables'
import { createBlankMessageSequence } from '@/utils/messageSequenceExamples'
import isJsonPayload from '@/utils/payloadLanguage'
import validFormatJson from '@/utils/validFormatJson'

type DialogType = 'server' | 'client' | 'topic' | 'message' | 'sequence' | 'reply' | 'variable'

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
  variables: { [name: string]: StoredVariable }
  autoSubscriptions: AutoSubscribeGroupModel[]
  autoReplies: AutoReplyRuleModel[]
  messageSequences: MessageSequenceModel[]
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
  variables: {},
  autoSubscriptions: [],
  autoReplies: [],
  messageSequences: [],
})

interface MessagePresetForm {
  id?: string
  name: string
  topic: string
  payload: string
}

interface TopicPresetForm {
  id?: string
  name: string
  topic: string
}

interface SequencePresetForm {
  id?: string
  name: string
  variables: { [name: string]: StoredVariable }
  messageSequences: MessageSequenceModel[]
}

const defaultSequencePresetForm = (): SequencePresetForm => ({
  name: '',
  variables: {},
  messageSequences: [createBlankMessageSequence()],
})

interface ReplyPresetForm {
  id?: string
  name: string
  variables: { [name: string]: StoredVariable }
  autoReplies: AutoReplyRuleModel[]
}

const defaultReplyPresetForm = (): ReplyPresetForm => ({
  name: '',
  variables: {},
  autoReplies: [createBlankAutoReplyRule()],
})

interface VariableForm {
  id?: string
  name: string
  value: string
  definition?: VariableDefinitionConfig
}

/** One row of the global variables table: the stored variable plus what the columns display. */
interface GlobalVariableRow {
  raw: GlobalVariableModel
  name: string
  kindKey: string
  stateful: boolean
  defaultValue: string
  currentValue: string
}

/** The kind of a stored variable: a bare string is the original constant form. */
const storedVariableKind = (stored: StoredVariable | undefined): VariableKind =>
  typeof stored === 'string' ? 'constant' : stored?.kind ?? 'constant'

/** The i18n key of a kind label, e.g. `randomWalk` -> `configs.variableKindRandomWalk`. */
const kindLabelKey = (kind: VariableKind): string =>
  'configs.variableKind' + kind.charAt(0).toUpperCase() + kind.slice(1)

@Component({
  components: {
    MyDialog,
    MessagePreview,
    VariablesHelp,
    Editor,
    VariableEditor,
    VariableDefinitionEditor,
    AutoSubscribeEditor,
    AutoReplyEditor,
    MessageSequenceEditor,
    TopicPresetPicker,
  },
})
export default class Configs extends Vue {
  private activeTab: DialogType = 'server'
  private serverProfiles: ServerProfileModel[] = []
  private clientProfiles: ClientProfileModel[] = []
  private messagePresets: MessagePresetModel[] = []
  private topicPresets: TopicPresetModel[] = []
  private messageSequencePresets: MessageSequencePresetModel[] = []
  private autoReplyPresets: AutoReplyPresetModel[] = []
  private globalVariables: GlobalVariableModel[] = []

  private dialogVisible = false
  private editingId: string | null = null
  private dialogType: DialogType = 'server'
  // which language the preset editor highlights, decided when the dialog opens
  private presetPayloadLang = 'json'

  private profileForm: (
    | ServerProfileForm
    | ClientProfileForm
    | MessagePresetForm
    | TopicPresetForm
    | SequencePresetForm
    | ReplyPresetForm
    | VariableForm
  ) & {
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

  /** Same light/dark choice as the other hints of the app (the tooltip must stay readable). */
  get tooltipEffect(): 'dark' | 'light' {
    const theme = (this as unknown as { $store?: { getters?: { currentTheme?: string } } }).$store?.getters
      ?.currentTheme
    return theme && theme !== 'light' ? 'light' : 'dark'
  }

  /** The variable dialog edits one stored variable: a constant string or a stateful definition. */
  private get variableStored(): StoredVariable {
    const form = this.profileForm as VariableForm
    return form.definition ?? form.value ?? ''
  }

  private get variableDefinitionStateful(): boolean {
    return storedVariableKind(this.variableStored) !== 'constant'
  }

  /** Variable names a sequence preset can assign. The preset's own variables count too. */
  private get sequencePresetVariableNames(): string[] {
    const form = this.profileForm as SequencePresetForm
    const names = Object.keys(form.variables ?? {})
    this.globalVariables.forEach((variable) => {
      if (variable.name && !names.includes(variable.name)) {
        names.push(variable.name)
      }
    })
    return names
  }

  /** Variable names the automatic reply actions of a client preset can target. */
  private get clientProfileVariableNames(): string[] {
    const form = this.profileForm as ClientProfileForm
    const names = Object.keys(form.variables ?? {})
    this.globalVariables.forEach((variable) => {
      if (variable.name && !names.includes(variable.name)) {
        names.push(variable.name)
      }
    })
    return names
  }

  /**
   * The definition editor emits one stored variable, while the model keeps the legacy `value` field
   * next to it: persisting both means an older build (and the migration reader) still sees a value.
   */
  private handleVariableStoredChange(stored: StoredVariable) {
    const form = this.profileForm as VariableForm
    if (typeof stored === 'string') {
      this.$set(form, 'value', stored)
      this.$set(form, 'definition', undefined)
      return
    }
    if ((stored.kind ?? 'constant') === 'constant') {
      this.$set(form, 'value', stored.value ?? '')
      this.$set(form, 'definition', undefined)
      return
    }
    // The definition key may not exist on a freshly opened dialog, so add it reactively.
    this.$set(form, 'definition', stored)
    this.$set(form, 'value', stored.initial !== undefined ? String(stored.initial) : '')
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
          // An empty constant resolves to nothing, which is the same as an undefined variable.
          // A stateful definition has no template value: its default comes from the definition, so
          // the legacy value field stays empty and must not block saving.
          validator: (rule: unknown, value: string, callback: (error?: Error) => void) => {
            if (this.dialogType === 'variable' && this.variableDefinitionStateful) {
              callback()
              return
            }
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
    const takenNames = this.globalVariables.filter((variable) => variable.id !== this.editingId).map(({ name }) => name)
    const issue = validateVariableName(value ?? '', takenNames)
    if (issue === 'invalid') {
      callback(new Error(this.$t('configs.variableNameInvalid') as string))
      return
    }
    if (issue === 'reserved') {
      callback(new Error(this.$t('configs.variableNameReserved') as string))
      return
    }
    if (issue === 'duplicate') {
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
    this.topicPresets = getTopicPresets()
    this.messagePresets = getMessagePresets()
    this.messageSequencePresets = ensureMessageSequencePresets()
    this.autoReplyPresets = getAutoReplyPresets()
    this.globalVariables = getGlobalVariables()
  }

  private created() {
    this.applyRouteTab()
    this.loadData()
  }

  /** `/configs?tab=topic` opens the topic list, so a picker can jump straight to where presets are edited. */
  @Watch('$route')
  private applyRouteTab() {
    const query = this.$route && this.$route.query
    const tab = query && query.tab
    const tabs: DialogType[] = ['server', 'client', 'topic', 'message', 'sequence', 'reply', 'variable']
    if (typeof tab === 'string' && (tabs as string[]).includes(tab)) {
      this.activeTab = tab as DialogType
    }
  }

  private applyMessageTopicPreset(topic: string) {
    this.profileForm.topic = topic
  }

  /** The variable tab adds variables, every other tab adds a profile or a preset. */
  private get addBtnText(): string {
    return (this.activeTab === 'variable' ? this.$t('configs.addVariable') : this.$t('configs.addProfile')) as string
  }

  /** A message preset edits a payload and a client preset edits variables, so both need room. */
  private get dialogWidth(): string {
    if (this.dialogType === 'message') {
      return '760px'
    }
    if (this.dialogType === 'topic') {
      return '560px'
    }
    return this.dialogType === 'client' || this.dialogType === 'sequence' || this.dialogType === 'reply'
      ? '720px'
      : '460px'
  }

  /** One line summary of the automatic subscriptions / replies of a client preset. */
  private describeAutomation(profile: ClientProfileModel): string {
    const groups = (profile.autoSubscriptions ?? []).filter((group) => group.enabled !== false).length
    const rules = (profile.autoReplies ?? []).filter((rule) => rule.enabled !== false).length
    const sequences = (profile.messageSequences ?? []).filter((sequence) => sequence.enabled !== false).length
    const parts: string[] = []
    if (groups) {
      parts.push(`${this.$t('connections.autoSubscribe')} ${groups}`)
    }
    if (rules) {
      parts.push(`${this.$t('connections.autoReply')} ${rules}`)
    }
    if (sequences) {
      parts.push(`${this.$t('connections.messageSequence')} ${sequences}`)
    }
    return parts.length ? parts.join(' / ') : '-'
  }

  /** The label of a sequence preset's trigger, for the preset table. */
  private sequenceTriggerLabel(preset: MessageSequencePresetModel): string {
    const trigger = preset.sequence?.trigger
    if (trigger === 'connect') {
      return this.$t('connections.messageSequenceTriggerConnect') as string
    }
    if (trigger === 'message') {
      return this.$t('connections.messageSequenceTriggerMessage') as string
    }
    return this.$t('connections.messageSequenceTriggerManual') as string
  }

  /** The reply mode of a reply preset, for the preset table. */
  private replyModeLabel(preset: AutoReplyPresetModel): string {
    return preset.rule?.reply?.mode === 'fixed'
      ? (this.$t('connections.autoReplyModeFixed') as string)
      : (this.$t('connections.autoReplyModeEcho') as string)
  }

  /** The match topic of a reply preset, for the preset table. */
  private replyMatchTopic(preset: AutoReplyPresetModel): string {
    return preset.rule?.matchTopic || '-'
  }

  /** A sequence or reply template adds its variables only when the client preset lacks them. */
  private applyAutomationExample(payload: { variables?: { [name: string]: StoredVariable } }) {
    const incoming = payload?.variables ?? {}
    const current = { ...(this.profileForm.variables ?? {}) }
    let changed = false
    Object.keys(incoming).forEach((name) => {
      if (current[name] === undefined) {
        current[name] = incoming[name]
        changed = true
      }
    })
    if (changed) {
      this.profileForm.variables = current
    }
  }

  /** One line summary of the variables of a client preset, for the table. */
  private describeVariables(variables: { [name: string]: StoredVariable } | null | undefined): string {
    const pairs = Object.keys(variables ?? {})
      .filter((name) => name.trim())
      .map((name) => {
        const stored = variables?.[name]
        if (typeof stored === 'string') {
          return `${name}=${stored}`
        }
        const kind = stored?.kind ?? 'constant'
        return kind === 'constant' ? `${name}=${stored?.value ?? ''}` : `${name}(${kind})`
      })
    return pairs.length ? pairs.join(', ') : '-'
  }

  /**
   * The rows of the global variables table. The current values come from the runtime state store,
   * which is not reactive, so the value is read on every render (a reset calls `$forceUpdate`).
   */
  private variableRows(): GlobalVariableRow[] {
    return this.globalVariables.map((variable) => {
      const definition = normalizeGlobalVariables([variable])[variable.name.trim()]
      const current = definition ? peekDefinitionValue(definition) : undefined
      return {
        raw: variable,
        name: variable.name,
        kindKey: kindLabelKey(definition?.kind ?? storedVariableKind(variable.definition ?? variable.value)),
        stateful: (definition?.kind ?? 'constant') !== 'constant',
        defaultValue: definition ? this.describeVariableDefault(definition) : '-',
        currentValue: current === undefined || String(current) === '' ? '-' : String(current),
      }
    })
  }

  /** The default (initial) value of a definition, for the "默认值" column. */
  private describeVariableDefault(definition: ResolvedVariableDefinition): string {
    switch (definition.kind) {
      case 'constant':
        return definition.value ?? ''
      case 'sequence':
      case 'randomWalk':
        return String(definition.initial ?? 0)
      case 'random':
        return `${definition.min ?? 0}..${definition.max ?? 100}`
      case 'choice': {
        const options = (definition.options ?? []).map((option) => option.value).filter((value) => value !== '')
        return options.length ? options.join(' / ') : '-'
      }
      case 'session':
        return definition.generator === 'template' ? definition.value ?? '' : 'UUID'
      case 'captured':
        return definition.value || '-'
      case 'runStart':
        return '-'
      default:
        return '-'
    }
  }

  /** Resets the shared current value of a global variable to its default. */
  private handleResetVariable(row: GlobalVariableRow) {
    const definition = normalizeGlobalVariables([row.raw])[row.name.trim()]
    if (definition && resetVariable(definition)) {
      this.$message.success(this.$t('configs.variableResetDone', { name: row.name }) as string)
    }
    this.$forceUpdate()
  }

  /**
   * The preset editor lives in a dialog, which has no size until it is done opening, so lay the
   * editor out once the dialog is fully visible. Later resizes are handled by the editor itself.
   */
  private handleDialogOpen() {
    setTimeout(() => {
      const editor = this.$refs.presetPayloadEditor as Editor | undefined
      editor?.editorLayout()
    }, 400)
  }

  private formatPresetPayload() {
    try {
      const formatted = validFormatJson(this.profileForm.payload as string)
      if (formatted) {
        this.profileForm.payload = formatted
      }
    } catch (error) {
      this.$message.error((error as Error).toString())
    }
  }

  private handleAdd() {
    this.dialogType = this.activeTab
    this.editingId = null
    if (this.activeTab === 'server') {
      this.profileForm = { alias: '', host: '', port: 1883, protocol: 'mqtt', path: undefined }
    } else if (this.activeTab === 'topic') {
      this.profileForm = { name: '', topic: '' }
    } else if (this.activeTab === 'message') {
      this.profileForm = { name: '', topic: '', payload: '' }
      this.presetPayloadLang = 'json'
    } else if (this.activeTab === 'variable') {
      this.profileForm = { name: '', value: '' }
    } else if (this.activeTab === 'sequence') {
      this.profileForm = defaultSequencePresetForm()
    } else if (this.activeTab === 'reply') {
      this.profileForm = defaultReplyPresetForm()
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

  private handleEdit(
    row:
      | ServerProfileModel
      | ClientProfileModel
      | MessagePresetModel
      | TopicPresetModel
      | MessageSequencePresetModel
      | AutoReplyPresetModel
      | GlobalVariableModel,
  ) {
    this.dialogType = this.activeTab
    this.editingId = row.id
    if (this.activeTab === 'variable') {
      const variable = row as GlobalVariableModel
      this.profileForm = {
        id: variable.id,
        name: variable.name,
        value: variable.value,
        ...(variable.definition ? { definition: { ...variable.definition } } : {}),
      }
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
      this.presetPayloadLang = isJsonPayload(preset.payload) ? 'json' : 'plaintext'
    } else if (this.activeTab === 'topic') {
      const preset = row as TopicPresetModel
      this.profileForm = {
        id: preset.id,
        name: preset.name,
        topic: preset.topic,
      }
    } else if (this.activeTab === 'sequence') {
      const preset = row as MessageSequencePresetModel
      const sequence = JSON.parse(JSON.stringify(preset.sequence)) as MessageSequenceModel
      sequence.name = preset.name
      this.profileForm = {
        id: preset.id,
        name: preset.name,
        variables: { ...(preset.variables ?? {}) },
        messageSequences: [sequence],
      }
    } else if (this.activeTab === 'reply') {
      const preset = row as AutoReplyPresetModel
      const rule = JSON.parse(JSON.stringify(preset.rule)) as AutoReplyRuleModel
      rule.name = preset.name
      this.profileForm = {
        id: preset.id,
        name: preset.name,
        variables: { ...(preset.variables ?? {}) },
        autoReplies: [rule],
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
        variables: { ...(client.variables ?? {}) },
        autoSubscriptions: JSON.parse(JSON.stringify(client.autoSubscriptions ?? [])),
        autoReplies: JSON.parse(JSON.stringify(client.autoReplies ?? [])),
        messageSequences: JSON.parse(JSON.stringify(client.messageSequences ?? [])),
      }
    }
    this.dialogVisible = true
    this.clearProfileValidation()
  }

  private handleDelete(
    row:
      | ServerProfileModel
      | ClientProfileModel
      | MessagePresetModel
      | TopicPresetModel
      | MessageSequencePresetModel
      | GlobalVariableModel,
  ) {
    this.$confirm(this.$t('configs.deleteConfirm') as string, this.$tc('common.warning'), {
      type: 'warning',
    })
      .then(() => {
        if (this.activeTab === 'server') {
          deleteServerProfile(row.id)
        } else if (this.activeTab === 'message') {
          deleteMessagePreset(row.id)
        } else if (this.activeTab === 'topic') {
          deleteTopicPreset(row.id)
        } else if (this.activeTab === 'variable') {
          onGlobalVariableDeleted(row.id)
          deleteGlobalVariable(row.id)
        } else if (this.activeTab === 'sequence') {
          deleteMessageSequencePreset(row.id)
        } else if (this.activeTab === 'reply') {
          deleteAutoReplyPreset(row.id)
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
        const resolved = normalizeVariableDefinition(this.profileForm.name, this.variableStored, {
          scope: 'global',
          globalId: this.editingId ?? 'pending',
        })
        if (validateVariableDefinition(resolved).length) {
          // A definition that cannot work (e.g. min > max or no choice options) must not be stored.
          this.$message.error(this.$t('configs.variableDefinitionInvalid') as string)
          return
        }
        const storedDefinition = resolved.kind === 'constant' ? undefined : toStoredVariable(resolved)
        const definition = typeof storedDefinition === 'string' ? undefined : storedDefinition
        const saved = saveGlobalVariable({
          id: this.editingId ?? undefined,
          name: this.profileForm.name.trim(),
          // A constant keeps its template; a stateful variable keeps its initial value here for
          // readers of the legacy field (the definition holds the real rule).
          value: resolved.kind === 'constant' ? resolved.value ?? '' : String(resolved.initial ?? ''),
          ...(definition ? { definition } : {}),
        })
        // The definition changed: its shared value starts from the new default.
        onGlobalVariableChanged(saved.id)
      } else if (this.dialogType === 'topic') {
        saveTopicPreset({
          id: this.editingId ?? undefined,
          name: String(this.profileForm.name ?? ''),
          topic: String(this.profileForm.topic ?? ''),
        })
      } else if (this.dialogType === 'message') {
        saveMessagePreset({
          id: this.editingId ?? undefined,
          name: this.profileForm.name,
          topic: this.profileForm.topic,
          payload: this.profileForm.payload,
        })
      } else if (this.dialogType === 'reply') {
        const invalidVariables = validateStoredVariables(this.profileForm.variables, { scope: 'connection' })
        if (invalidVariables.length) {
          this.$message.error(this.$t('configs.variableDefinitionInvalid') as string)
          return
        }
        const rule = (this.profileForm.autoReplies ?? [])[0] as AutoReplyRuleModel | undefined
        // An empty match topic never answers anything, so a name alone is not a usable preset.
        if (!rule || String(rule.matchTopic ?? '').trim() === '') {
          this.$message.error(this.$t('configs.replyPresetNoMatchTopic') as string)
          return
        }
        const name = String(this.profileForm.name ?? '').trim()
        saveAutoReplyPreset({
          id: this.editingId ?? undefined,
          name,
          rule: { ...rule, name },
          variables: { ...(this.profileForm.variables ?? {}) },
        })
      } else if (this.dialogType === 'sequence') {
        const invalidVariables = validateStoredVariables(this.profileForm.variables, { scope: 'connection' })
        if (invalidVariables.length) {
          this.$message.error(this.$t('configs.variableDefinitionInvalid') as string)
          return
        }
        const sequence = (this.profileForm.messageSequences ?? [])[0] as MessageSequenceModel | undefined
        const hasTopic = (sequence?.steps ?? []).some((step) => String(step?.topic ?? '').trim() !== '')
        if (!sequence || !hasTopic) {
          this.$message.error(this.$t('configs.sequencePresetNoTopic') as string)
          return
        }
        const name = String(this.profileForm.name ?? '').trim()
        saveMessageSequencePreset({
          id: this.editingId ?? undefined,
          name,
          sequence: { ...sequence, name },
          variables: { ...(this.profileForm.variables ?? {}) },
        })
      } else {
        const invalidVariables = validateStoredVariables(this.profileForm.variables, { scope: 'connection' })
        if (invalidVariables.length) {
          this.$message.error(this.$t('configs.variableDefinitionInvalid') as string)
          return
        }
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
          variables: { ...(this.profileForm.variables ?? {}) },
          autoSubscriptions: this.profileForm.autoSubscriptions ?? [],
          autoReplies: this.profileForm.autoReplies ?? [],
          messageSequences: this.profileForm.messageSequences ?? [],
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
    align-items: center;
    justify-content: flex-end;
    margin-bottom: 8px;
  }
  .configs-view-help {
    margin-right: 12px;
    font-size: 12px;
  }
  .variable-kind {
    display: inline-block;
    padding: 0 6px;
    border-radius: 3px;
    background: var(--color-bg-tags);
    font-size: 12px;
    line-height: 20px;
    &.stateful {
      color: var(--color-main-green);
    }
    &.constant {
      color: var(--color-text-light);
    }
  }
  .topic-preset-hint {
    margin: 6px 0 0;
    color: var(--color-text-light);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.5;
  }
  .variable-cell {
    color: var(--color-text-default);
    font-family: Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    &.current {
      color: var(--color-main-green);
    }
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
  .preset-payload-editor {
    height: 240px;
    min-height: 120px;
    max-height: 70vh;
    border: 1px solid var(--color-border-default);
    border-radius: 4px;
    // the bottom right corner can be dragged to give the payload more room
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
    .preset-payload-format {
      color: var(--color-main-green);
      &:hover {
        text-decoration: underline;
      }
    }
  }
  // Same hint affordance as the settings page: a "!" icon next to the label.
  .automation-field {
    .el-form-item__label {
      white-space: nowrap;
    }
    .el-form-item__content {
      line-height: 32px;
    }
  }
  .preset-help {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin-left: 2px;
    color: var(--color-text-default);
    cursor: help;
    line-height: 1;
    font-size: 14px;
    vertical-align: -2px;
    &:hover {
      color: var(--color-main-green);
    }
  }
}
</style>
