<template>
  <div class="connection-form right-content card-form">
    <div class="right-topbar topbar">
      <div class="header">
        <a href="javascript:;" @click="handleBack($route.params.id)">
          <i class="el-icon-arrow-left"></i>{{ $t('common.back') }}
        </a>
      </div>
      <div class="body">
        <h2>{{ oper === 'create' ? $t('common.new') : $t('common.edit') }}</h2>
      </div>
      <div class="tail">
        <div class="connect-btn-group">
          <a href="javascript:;" @click="handleSave('connect')" class="connect-btn">
            {{ $t('connections.connectBtn') }}
          </a>
          <el-dropdown trigger="click" @command="handleActionCommand">
            <a href="javascript:;" class="dropdown-btn">
              <i class="el-icon-arrow-down"></i>
            </a>
            <el-dropdown-menu class="connection-oper-item" slot="dropdown">
              <el-dropdown-item command="save">
                <i class="iconfont icon-save"></i>{{ $t('common.saveOnly') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </div>
      </div>
    </div>

    <el-form ref="form" label-position="right" :label-width="`${willLabelWidth}px`" :model="record" :rules="rules">
      <div class="client-create__body">
        <div class="info-header">
          <h3>{{ $t('settings.general') }}</h3>
        </div>
        <el-card shadow="never" class="info-body item-card">
          <el-row :gutter="10">
            <el-col :span="22">
              <el-form-item label-width="93px" :label="$t('connections.name')" prop="name">
                <el-autocomplete
                  v-if="oper === 'create'"
                  size="mini"
                  v-model.trim="record.name"
                  value-key="name"
                  :fetch-suggestions="querySearchName"
                  @select="handleSelectName"
                >
                </el-autocomplete>
                <el-input v-else size="mini" v-model.trim="record.name"></el-input>
              </el-form-item>
            </el-col>
            <el-col :span="2">
              <el-tooltip
                v-if="oper === 'create'"
                placement="top"
                :effect="theme !== 'light' ? 'light' : 'dark'"
                :open-delay="500"
                :offset="80"
                :content="$t('connections.nameTip')"
              >
                <a href="javascript:;" class="icon-oper">
                  <i class="el-icon-warning-outline"></i>
                </a>
              </el-tooltip>
            </el-col>
            <el-col :span="22">
              <el-form-item class="host-item" label-width="93px" :label="$t('connections.brokerIP')" prop="host">
                <el-col :span="6">
                  <el-select size="mini" v-model="record.protocol" popper-class="ws-protocol-select">
                    <el-option
                      v-for="item in protocolOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value"
                      :disabled="item.disabled"
                    >
                      <template v-if="!isOnline || item.value !== 'ws'">
                        {{ item.label }}
                      </template>
                      <template v-else>
                        <span style="float: left">{{ item.label }}</span>
                        <el-tooltip
                          placement="top"
                          :effect="theme !== 'light' ? 'light' : 'dark'"
                          :open-delay="500"
                          :content="$t('connections.wsProtocolNotAllowed')"
                          popper-class="ws-protocol-tip"
                        >
                          <div slot="content">
                            <i18n path="connections.wsProtocolNotAllowed" tag="div">
                              <template #desktop>
                                <a :href="mqttxWebsite" target="_blank">MQTTX Desktop</a>
                              </template>
                              <template #cli>
                                <a :href="`${mqttxWebsite}/cli`" target="_blank">MQTTX CLI</a>
                              </template>
                              <template #web>
                                <a :href="`${mqttxWebsite}/downloads?os=docker`" target="_blank">MQTTX Web</a>
                              </template>
                              <template #announcement>
                                <a :href="wsAnnouncementLink" target="_blank">{{ $t('connections.wsAnnouncement') }}</a>
                              </template>
                            </i18n>
                          </div>
                          <a href="javascript:;" class="icon-tip">
                            <i class="el-icon-question"></i>
                          </a>
                        </el-tooltip>
                      </template>
                    </el-option>
                  </el-select>
                </el-col>
                <el-col :span="18">
                  <el-input size="mini" v-model.trim="record.host"> </el-input>
                </el-col>
              </el-form-item>
            </el-col>
            <el-col :span="2"></el-col>
            <el-col :span="22">
              <el-form-item label-width="93px" :label="$t('connections.brokerPort')" prop="port">
                <el-input-number
                  size="mini"
                  type="number"
                  :min="0"
                  :max="65535"
                  v-model="record.port"
                  controls-position="right"
                >
                </el-input-number>
              </el-form-item>
            </el-col>
            <el-col :span="22">
              <el-form-item label-width="93px" label="Client ID" prop="clientId">
                <el-input size="mini" v-model="record.clientId" clearable></el-input>
              </el-form-item>
            </el-col>
            <el-col :span="1">
              <a href="javascript:;" class="icon-oper" @click="setClientID">
                <i class="el-icon-refresh-right"></i>
              </a>
            </el-col>
            <!-- add clientID timestamp check icon -->
            <el-col :span="1">
              <el-tooltip
                placement="top"
                :effect="theme !== 'light' ? 'light' : 'dark'"
                :open-delay="500"
                :offset="80"
                :content="$t('connections.clientIdWithTimeTip')"
              >
                <a
                  href="javascript:;"
                  class="icon-oper-pure"
                  @click="reverseClientIDWithTime"
                  :class="{ 'icon-oper-active': clientIdWithTime }"
                >
                  <i class="el-icon-time"></i>
                </a>
              </el-tooltip>
            </el-col>

            <template v-if="record.protocol === 'ws' || record.protocol === 'wss'">
              <el-col :span="22">
                <el-form-item label-width="93px" label="Path" prop="path">
                  <el-input size="mini" v-model="record.path"></el-input>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>
            </template>

            <el-col :span="2"></el-col>
            <el-col :span="22">
              <el-form-item label-width="93px" :label="$t('connections.username')" prop="username">
                <el-input size="mini" v-model.trim="record.username"></el-input>
              </el-form-item>
            </el-col>
            <el-col :span="2"></el-col>
            <el-col :span="22">
              <el-form-item label-width="93px" :label="$t('connections.password')" prop="password">
                <el-input type="password" size="mini" v-model.trim="record.password"></el-input>
              </el-form-item>
            </el-col>
            <el-col :span="2"></el-col>
            <el-col :span="22">
              <el-form-item label-width="93px" label="SSL/TLS" prop="ssl">
                <el-switch v-model="record.ssl" active-color="#13ce66" inactive-color="#A2A9B0" @change="handleSSL">
                </el-switch>
              </el-form-item>
            </el-col>
            <el-col :span="2"></el-col>

            <template v-if="record.ssl">
              <el-col :span="22">
                <el-form-item
                  class="item-secure"
                  :label="$t('connections.strictValidateCertificate')"
                  label-width="93px"
                  prop="rejectUnauthorized"
                >
                  <el-switch v-model="record.rejectUnauthorized" active-color="#13ce66" inactive-color="#A2A9B0">
                  </el-switch>
                  <el-tooltip
                    class="tooltip-secure"
                    placement="top"
                    :effect="theme !== 'light' ? 'light' : 'dark'"
                    :open-delay="500"
                    :offset="80"
                    :content="$t('connections.secureTip')"
                  >
                    <a href="javascript:;" class="icon-oper">
                      <i class="el-icon-warning-outline"></i>
                    </a>
                  </el-tooltip>
                </el-form-item>
              </el-col>
              <el-col :span="2"> </el-col>
              <el-col :span="22">
                <el-form-item label-width="93px" label="ALPN" prop="ALPNProtocols">
                  <el-input size="mini" clearable v-model.trim="record.ALPNProtocols"></el-input>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>
            </template>
          </el-row>
        </el-card>

        <div class="info-header">
          <h3>
            {{ $t('settings.advanced') }}
            <a
              :class="['collapse-btn', advancedVisible ? 'top' : 'bottom']"
              href="javascript:;"
              @click="handleCollapse('advanced')"
            >
              <i class="el-icon-caret-top"></i>
            </a>
          </h3>
        </div>
        <el-collapse-transition>
          <el-card v-show="advancedVisible" shadow="never" class="info-body item-card">
            <el-row :gutter="10">
              <el-col :span="22">
                <el-form-item :label="$t('connections.connectionTimeout')" prop="connectTimeout">
                  <el-input-number
                    size="mini"
                    type="number"
                    :min="0"
                    v-model="record.connectTimeout"
                    controls-position="right"
                  >
                  </el-input-number>
                </el-form-item>
              </el-col>
              <el-col :span="2"
                ><div class="unit">({{ $t('common.unitS') }})</div></el-col
              >
              <el-col :span="22">
                <el-form-item label="Keep Alive" prop="keepalive">
                  <el-input-number
                    size="mini"
                    type="number"
                    :min="0"
                    v-model="record.keepalive"
                    controls-position="right"
                  >
                  </el-input-number>
                </el-form-item>
              </el-col>
              <el-col :span="2"
                ><div class="unit">({{ $t('common.unitS') }})</div></el-col
              >
              <el-col :span="22">
                <el-form-item :label="$t('connections.cleanSession')" prop="clean">
                  <el-radio-group v-model="record.clean">
                    <el-radio :label="true"></el-radio>
                    <el-radio :label="false"></el-radio>
                  </el-radio-group>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>
              <el-col :span="22">
                <el-form-item :label="$t('connections.autoReconnect')" prop="reconnect">
                  <el-radio-group v-model="record.reconnect">
                    <el-radio :label="true"></el-radio>
                    <el-radio :label="false"></el-radio>
                  </el-radio-group>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>
              <template v-if="record.reconnect">
                <el-col :span="22">
                  <el-form-item :label="$t('connections.reconnectPeriod')" prop="reconnectPeriod">
                    <el-input-number
                      size="mini"
                      type="number"
                      :min="1"
                      v-model="record.reconnectPeriod"
                      controls-position="right"
                    >
                    </el-input-number>
                  </el-form-item>
                </el-col>
                <el-col :span="2">
                  <div class="unit">({{ $t('common.unitMS') }})</div>
                </el-col>
              </template>
              <el-col :span="22">
                <el-form-item :label="$t('connections.mqttVersion')" prop="mqttVersion">
                  <el-select size="mini" v-model="record.mqttVersion">
                    <el-option value="3.1.1" label="3.1.1"></el-option>
                    <el-option value="5.0" label="5.0"></el-option>
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>

              <!-- MQTT v5.0 -->
              <template v-if="record.mqttVersion === '5.0'">
                <el-col :span="22">
                  <el-form-item :label="$t('connections.sessionExpiryInterval')" prop="sessionExpiryInterval">
                    <el-input
                      size="mini"
                      type="number"
                      :min="1"
                      v-model.number="record.properties.sessionExpiryInterval"
                    >
                    </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2">
                  <div class="unit">({{ $t('common.unitS') }})</div>
                </el-col>
                <el-col :span="22">
                  <el-form-item :label="$t('connections.receiveMaximum')" prop="receiveMaximum">
                    <el-input size="mini" type="number" :min="1" v-model.number="record.properties.receiveMaximum">
                    </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
                <el-col :span="22">
                  <el-form-item :label="$t('connections.maximumPacketSize')" prop="maximumPacketSize">
                    <el-input size="mini" type="number" :min="100" v-model.number="record.properties.maximumPacketSize">
                    </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
                <el-col :span="22">
                  <el-form-item :label="$t('connections.topicAliasMaximum')" prop="topicAliasMaximum">
                    <el-input size="mini" type="number" :min="1" v-model.number="record.properties.topicAliasMaximum">
                    </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
                <el-col :span="22">
                  <el-form-item :label="$t('connections.requestResponseInformation')" prop="requestResponseInformation">
                    <el-radio-group v-model="record.properties.requestResponseInformation">
                      <el-radio :label="true"></el-radio>
                      <el-radio :label="false"></el-radio>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
                <el-col :span="22">
                  <el-form-item :label="$t('connections.requestProblemInformation')" prop="requestProblemInformation">
                    <el-radio-group v-model="record.properties.requestProblemInformation">
                      <el-radio :label="true"></el-radio>
                      <el-radio :label="false"></el-radio>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
              </template>
            </el-row>
          </el-card>
        </el-collapse-transition>

        <!-- Enhanced Authentication for MQTT 5.0 -->
        <el-card v-if="record.mqttVersion === '5.0' && advancedVisible" shadow="never" class="info-body item-card">
          <el-row :gutter="10">
            <el-col :span="22">
              <el-form-item :label="$t('connections.authenticationMethod')" prop="authenticationMethod">
                <el-select size="mini" v-model="record.properties.authenticationMethod" clearable>
                  <el-option label="SCRAM-SHA-1" value="SCRAM-SHA-1"></el-option>
                  <el-option label="SCRAM-SHA-256" value="SCRAM-SHA-256"></el-option>
                  <el-option label="SCRAM-SHA-512" value="SCRAM-SHA-512"></el-option>
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="2"></el-col>
          </el-row>
        </el-card>

        <el-card v-if="record.mqttVersion === '5.0' && advancedVisible" shadow="never" class="info-body item-card">
          <el-row :gutter="20">
            <el-col :span="22">
              <KeyValueEditor :title="$t('connections.userProperties')" v-model="record.properties.userProperties" />
            </el-col>
          </el-row>
        </el-card>

        <!-- MQTTX Plus: server / client presets -->
        <div class="info-header">
          <h3>{{ $t('connections.presetSectionTitle') }}</h3>
        </div>
        <el-card shadow="never" class="info-body item-card">
          <el-form-item label-width="200px">
            <template slot="label">
              {{ $t('connections.serverPresetTitle') }}
              <HintIcon :text="$t('connections.presetHint')" />
            </template>
            <div class="behavior-row">
              <el-select
                class="behavior-select"
                size="mini"
                clearable
                :placeholder="$t('connections.presetNone')"
                v-model="serverProfileId"
                @change="applyServerPreset"
                @focus="loadPresets"
              >
                <el-option
                  v-for="profile in serverProfiles"
                  :key="profile.id"
                  :label="profile.alias"
                  :value="profile.id"
                />
              </el-select>
              <el-button size="mini" @click="saveCurrentAsServerPreset">
                {{ $t('connections.presetSave') }}
              </el-button>
            </div>
          </el-form-item>

          <el-form-item label-width="200px">
            <template slot="label">
              {{ $t('connections.clientPresetTitle') }}
              <HintIcon :text="$t('connections.presetHint')" />
            </template>
            <div class="behavior-row">
              <el-select
                class="behavior-select"
                size="mini"
                clearable
                :placeholder="$t('connections.presetNone')"
                v-model="clientProfileId"
                @change="applyClientPreset"
                @focus="loadPresets"
              >
                <el-option
                  v-for="profile in clientProfiles"
                  :key="profile.id"
                  :label="profile.alias"
                  :value="profile.id"
                />
              </el-select>
              <el-button size="mini" @click="saveCurrentAsClientPreset">
                {{ $t('connections.presetSave') }}
              </el-button>
            </div>
          </el-form-item>

        </el-card>

        <!-- MQTTX Plus: behaviour template -->
        <div class="info-header">
          <h3>{{ $t('connections.behaviorTemplateTitle') }}</h3>
        </div>
        <el-card shadow="never" class="info-body item-card">
          <el-form-item label-width="200px">
            <template slot="label">
              {{ $t('connections.behaviorTemplateTitle') }}
              <HintIcon :text="$t('connections.behaviorTemplateHint')" />
            </template>
            <div class="behavior-row">
              <el-select
                class="behavior-select"
                size="mini"
                clearable
                :placeholder="$t('connections.behaviorTemplateNone')"
                v-model="behaviorTemplateId"
                @change="applyBehaviorTemplate"
                @focus="loadBehaviorTemplates"
              >
                <el-option
                  v-for="template in behaviorTemplates"
                  :key="template.id"
                  :label="template.name"
                  :value="template.id"
                />
              </el-select>
              <el-button size="mini" @click="saveCurrentAsBehaviorTemplate">
                {{ $t('connections.behaviorTemplateSave') }}
              </el-button>
            </div>
          </el-form-item>
        </el-card>

        <!-- Automation: client variables, automatic subscriptions, connect reports (MQTTX Plus) -->
        <div class="info-header">
          <h3>{{ $t('connections.autoSubscribeSection') }}</h3>
        </div>
        <el-card shadow="never" class="info-body item-card">
          <el-form-item :label="$t('connections.variableTitle')" label-width="200px">
            <VariableListEditor v-model="record.variables" />
          </el-form-item>
          <el-form-item :label="$t('connections.autoSubscribeTitle')" label-width="200px">
            <AutoSubscribeEditor v-model="record.autoSubscriptions" />
          </el-form-item>
        </el-card>

        <div class="info-header">
          <h3>{{ $t('connections.timedReportTitle') }}</h3>
        </div>
        <el-card shadow="never" class="info-body item-card">
          <el-form-item :label="$t('connections.timedReportTitle')" label-width="200px">
            <TimedReportEditor v-model="record.timedReports" />
          </el-form-item>
        </el-card>

        <div class="info-header">
          <h3>{{ $t('connections.sequenceTitle') }}</h3>
        </div>
        <el-card shadow="never" class="info-body item-card">
          <el-form-item :label="$t('connections.sequenceTitle')" label-width="200px">
            <MessageSequenceEditor
              v-model="record.messageSequences"
              :variable-names="sequenceVariableNames"
              @example="applySequenceVariables"
            />
          </el-form-item>
        </el-card>

        <div class="info-header">
          <h3>{{ $t('connections.autoReplyTitle') }}</h3>
        </div>
        <el-card shadow="never" class="info-body item-card">
          <el-form-item :label="$t('connections.autoReplyTitle')" label-width="200px">
            <AutoReplyEditor v-model="record.autoReplies" />
          </el-form-item>
        </el-card>

        <div class="info-header">
          <h3>{{ $t('connections.connectReportTitle') }}</h3>
        </div>
        <el-card shadow="never" class="info-body item-card">
          <el-form-item :label="$t('connections.connectReportTitle')" label-width="200px">
            <ConnectReportEditor v-model="record.connectReports" />
          </el-form-item>
        </el-card>

        <!-- Last-Will Message -->
        <div class="info-header">
          <h3>
            {{ $t('connections.willMessage') }}
            <a
              :class="['collapse-btn', willMessageVisible ? 'top' : 'bottom']"
              href="javascript:;"
              @click="handleCollapse('willMessage')"
            >
              <i class="el-icon-caret-top"></i>
            </a>
          </h3>
        </div>
        <el-collapse-transition>
          <el-card v-show="willMessageVisible" shadow="never" class="info-body item-card">
            <el-row :gutter="10">
              <el-col :span="22">
                <el-form-item
                  :label-width="`${willLabelWidth}px`"
                  :label="$t('connections.willTopic')"
                  prop="will.lastWillTopic"
                >
                  <el-input size="mini" v-model="record.will.lastWillTopic"></el-input>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>
              <el-col :span="22">
                <el-form-item
                  :label-width="`${willLabelWidth}px`"
                  :label="$t('connections.willQos')"
                  prop="will.lastWillQos"
                >
                  <el-radio-group v-model="record.will.lastWillQos">
                    <el-radio :label="0"></el-radio>
                    <el-radio :label="1"></el-radio>
                    <el-radio :label="2"></el-radio>
                  </el-radio-group>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>
              <el-col :span="22">
                <el-form-item
                  :label-width="`${willLabelWidth}px`"
                  :label="$t('connections.willRetain')"
                  prop="will.lastWillRetain"
                >
                  <el-radio-group v-model="record.will.lastWillRetain">
                    <el-radio :label="true"></el-radio>
                    <el-radio :label="false"></el-radio>
                  </el-radio-group>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>
              <el-col :span="22">
                <el-form-item
                  class="will-payload-box"
                  :label-width="`${willLabelWidth}px`"
                  :label="$t('connections.willPayload')"
                  prop="will.lastWillPayload"
                >
                  <div class="last-will-payload">
                    <Editor
                      ref="lastWillPayload"
                      id="lastWillPayload"
                      :lang="payloadType"
                      :fontSize="12"
                      v-model="record.will.lastWillPayload"
                      scrollbar-status="auto"
                    />
                  </div>
                  <div class="lang-type">
                    <el-radio-group v-model="payloadType">
                      <el-radio label="json">JSON</el-radio>
                      <el-radio label="plaintext">Plaintext</el-radio>
                    </el-radio-group>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="2"></el-col>

              <!-- MQTT v5.0 -->
              <template v-if="record.mqttVersion === '5.0'">
                <el-col :span="22">
                  <el-form-item
                    :label-width="`${willLabelWidth}px`"
                    :label="$t('connections.payloadFormatIndicator')"
                    prop="payloadFormatIndicator"
                  >
                    <el-radio-group v-model="record.will.properties.payloadFormatIndicator">
                      <el-radio :label="true"></el-radio>
                      <el-radio :label="false"></el-radio>
                    </el-radio-group>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
                <el-col :span="22">
                  <el-form-item
                    :label-width="`${willLabelWidth}px`"
                    :label="$t('connections.willDelayInterval')"
                    prop="willDelayInterval"
                  >
                    <el-input
                      size="mini"
                      type="number"
                      :min="0"
                      v-model.number="record.will.properties.willDelayInterval"
                    >
                    </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2"
                  ><div class="unit">({{ $t('common.unitS') }})</div></el-col
                >
                <el-col :span="22">
                  <el-form-item
                    :label-width="`${willLabelWidth}px`"
                    :label="$t('connections.messageExpiryInterval')"
                    props="messageExpiryInterval"
                  >
                    <el-input
                      size="mini"
                      type="number"
                      :min="0"
                      v-model.number="record.will.properties.messageExpiryInterval"
                    >
                    </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2"
                  ><div class="unit">({{ $t('common.unitS') }})</div></el-col
                >
                <el-col :span="22">
                  <el-form-item
                    class="content-type-item"
                    :label-width="`${willLabelWidth}px`"
                    :label="$t('connections.contentType')"
                    prop="contentType"
                  >
                    <el-input size="mini" v-model="record.will.properties.contentType"> </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
                <el-col :span="22">
                  <el-form-item
                    class="content-type-item"
                    :label-width="`${willLabelWidth}px`"
                    :label="$t('connections.responseTopic')"
                    prop="responseTopic"
                  >
                    <el-input size="mini" v-model="record.will.properties.responseTopic"> </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
                <el-col :span="22">
                  <el-form-item
                    class="content-type-item"
                    :label-width="`${willLabelWidth}px`"
                    :label="$t('connections.correlationData')"
                    prop="correlationData"
                  >
                    <el-input size="mini" v-model="record.will.properties.correlationData"> </el-input>
                  </el-form-item>
                </el-col>
                <el-col :span="2"></el-col>
              </template>
            </el-row>
          </el-card>
        </el-collapse-transition>
      </div>
    </el-form>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator'
import { Getter, Action } from 'vuex-class'
import _ from 'lodash'
import time from '@/utils/time'
import { loadConnection, createConnection, updateConnection, loadSuggestConnections } from '@/utils/api/connection'
import { emptyToNull } from '@/utils/handleString'
import { getClientId } from '@/utils/idGenerator'
import { getMQTTProtocol, getDefaultRecord } from '@/utils/mqttUtils'
import Editor from '@/components/Editor.vue'
import KeyValueEditor from '@/components/KeyValueEditor.vue'
import AutoSubscribeEditor from '@/components/AutoSubscribeEditor.vue'
import ConnectReportEditor from '@/components/ConnectReportEditor.vue'
import VariableListEditor from '@/components/VariableListEditor.vue'
import AutoReplyEditor from '@/components/AutoReplyEditor.vue'
import MessageSequenceEditor from '@/components/MessageSequenceEditor.vue'
import HintIcon from '@/components/HintIcon.vue'
import TimedReportEditor from '@/components/TimedReportEditor.vue'
import {
  getBehaviorTemplates,
  getClientProfiles,
  getServerProfiles,
  saveBehaviorTemplate,
  saveClientProfile,
  saveServerProfile,
} from '@/utils/configProfiles'
import {
  applyClientProfileToRecord,
  applyServerProfileToRecord,
  clientProfileFromRecord,
  serverProfileFromRecord,
} from '@/utils/applyPresets'
import { BehaviorFormBaseline, copyBehaviorLists } from '@/utils/behaviorTemplates'
import { applyBehaviorTemplateToRecord } from '@/utils/behaviorApply'

@Component({
  components: {
    Editor,
    KeyValueEditor,
    AutoSubscribeEditor,
    ConnectReportEditor,
    VariableListEditor,
    AutoReplyEditor,
    MessageSequenceEditor,
    TimedReportEditor,
    HintIcon,
  },
})
export default class ConnectionCreate extends Vue {
  @Prop({ required: true }) public oper!: 'edit' | 'create' | undefined

  @Getter('currentLang') private getterLang!: Language
  @Getter('advancedVisible') private getterAdvancedVisible!: boolean
  @Getter('willMessageVisible') private getterWillMessageVisible!: boolean
  @Getter('currentTheme') private theme!: Theme
  @Getter('allConnections') private allConnections!: ConnectionModel[] | []

  @Action('CHANGE_ACTIVE_CONNECTION') private changeActiveConnection!: (payload: Client) => void
  @Action('TOGGLE_ADVANCED_VISIBLE') private toggleAdvancedVisible!: (payload: { advancedVisible: boolean }) => void
  @Action('TOGGLE_WILL_MESSAGE_VISIBLE')
  private toggleWillMessageVisible!: (payload: { willMessageVisible: boolean }) => void

  private willMessageVisible = true
  private advancedVisible = true
  private payloadType = 'plaintext'
  private willLabelWidth = 180
  private suggestConnections: ConnectionModel[] | [] = []
  private oldName = ''

  private defaultRecord: ConnectionModel = getDefaultRecord()

  private record: ConnectionModel = _.cloneDeep(this.defaultRecord)

  @Watch('oper')
  private handleCreateNewConnection(val: string) {
    if (val === 'create') {
      // reinit the form when page jump to creation page
      this.initRecord()
    }
  }

  get clientIdWithTime() {
    return this.record.clientIdWithTime
  }

  get rules() {
    return {
      name: [
        { required: true, message: this.$t('common.inputRequired') },
        { validator: this.validateName, trigger: 'blur' },
      ],
      path: [{ required: true, message: this.$t('common.inputRequired') }],
      host: [{ required: true, message: this.$t('common.inputRequired') }],
      port: [{ required: true, message: this.$t('common.inputRequired') }],
    }
  }

  get vueForm(): VueForm {
    return this.$refs.form as VueForm
  }

  get isOnline() {
    return process.env.VUE_APP_IS_ONLINE_ENV === 'true'
  }

  get mqttxWebsite(): string {
    const link = 'https://mqttx.app'
    return this.getterLang === 'zh' ? `${link}/zh` : link
  }

  get wsAnnouncementLink() {
    const lang = this.getterLang === 'zh' ? 'zh' : 'en'
    return `https://www.emqx.com/${lang}/blog/mqttx-web-migration-announcement`
  }

  get protocolOptions() {
    const disabled = this.isOnline || this.record.ssl
    return [
      { label: 'ws://', value: 'ws', disabled },
      { label: 'wss://', value: 'wss', disabled: false },
    ]
  }

  private async loadDetail(id: string) {
    const res: ConnectionModel | undefined = await loadConnection(id)
    if (res) {
      this.record = res
      this.oldName = res.name
      this.record.protocol = getMQTTProtocol(res)
      this.normalizeRecord()
    }
  }

  // ---- presets ("预设管理") ----
  private serverProfiles: ServerProfileModel[] = []

  private clientProfiles: ClientProfileModel[] = []

  private serverProfileId: string | null = null

  private clientProfileId: string | null = null

  private loadPresets() {
    this.serverProfiles = getServerProfiles()
    this.clientProfiles = getClientProfiles()
  }

  /**
   * Applies the server part of a preset. A preset that names `mqtt`/`mqtts` is refused: a browser
   * can only open a websocket, and silently rewriting the protocol would connect to a port that is
   * not the one the preset describes.
   */
  private applyServerPreset(id: string | null) {
    if (!id) {
      return
    }
    const profile = this.serverProfiles.find((item) => item.id === id)
    const result = applyServerProfileToRecord(this.record, profile)
    if (!result.applied) {
      this.$message.warning(
        result.reason === 'protocolNotSupportedInBrowser'
          ? (this.$t('connections.presetProtocolNotSupported') as string)
          : (this.$t('connections.presetNotFound') as string),
      )
      // Nothing was applied: do not leave the select showing a preset the form does not match.
      this.serverProfileId = null
    }
  }

  private applyClientPreset(id: string | null) {
    if (!id) {
      return
    }
    const profile = this.clientProfiles.find((item) => item.id === id)
    const result = applyClientProfileToRecord(this.record, profile)
    if (!result.applied) {
      this.$message.warning(this.$t('connections.presetNotFound') as string)
      this.clientProfileId = null
    }
  }

  private askPresetName(fallback: string): string | null {
    const name = window.prompt(this.$t('connections.presetNamePrompt') as string, fallback)
    return name ? name : null
  }

  private saveCurrentAsServerPreset() {
    const alias = this.askPresetName(this.record.host)
    if (!alias) {
      return
    }
    const saved = saveServerProfile(serverProfileFromRecord(this.record, alias))
    this.loadPresets()
    this.serverProfileId = saved.id
    this.$message.success(this.$t('connections.presetSaved') as string)
  }

  private saveCurrentAsClientPreset() {
    const alias = this.askPresetName(this.record.name || this.record.clientId)
    if (!alias) {
      return
    }
    const saved = saveClientProfile(clientProfileFromRecord(this.record, alias))
    this.loadPresets()
    this.clientProfileId = saved.id
    this.$message.success(this.$t('connections.presetSaved') as string)
  }

  /** Behaviour templates ("行为模板") available to fill this connection from. */
  private behaviorTemplates: BehaviorTemplateModel[] = []

  private behaviorTemplateId: string | null = null

  /** What the form looked like before a template was applied, so it can be undone. */
  private behaviorBaseline: BehaviorFormBaseline | null = null

  private loadBehaviorTemplates() {
    this.behaviorTemplates = getBehaviorTemplates()
  }

  /**
   * Applies a behaviour template: the account, the client options and every automation list.
   *
   * Applying twice, or switching templates, first restores what the form looked like before the
   * first application, so a template never stacks on top of another one by accident.
   */
  private applyBehaviorTemplate(id: string | null) {
    this.loadBehaviorTemplates()
    const result = applyBehaviorTemplateToRecord(this.record, this.behaviorTemplates, id, this.behaviorBaseline)
    this.behaviorBaseline = result.baseline
    this.behaviorTemplateId = id
  }

  /** Stores what this connection currently does as a reusable behaviour template. */
  private saveCurrentAsBehaviorTemplate() {
    const suggested = (this.record.name ?? '').trim() || this.$t('connections.behaviorTemplateDefaultName')
    const name = window.prompt(this.$t('connections.behaviorTemplateNamePrompt') as string, suggested as string)
    if (!name) {
      return false
    }
    // `copyBehaviorLists` gives every copied row a new id, so the template and the connection do not
    // share the runtime state of a subscription group, a report or a sequence run.
    const lists = copyBehaviorLists({
      autoSubscriptions: this.record.autoSubscriptions ?? [],
      connectReports: this.record.connectReports ?? [],
      timedReports: this.record.timedReports ?? [],
      autoReplies: this.record.autoReplies ?? [],
      messageSequences: this.record.messageSequences ?? [],
    })
    saveBehaviorTemplate({
      name,
      username: this.record.username,
      password: this.record.password,
      variables: { ...(this.record.variables ?? {}) },
      ...lists,
    })
    this.loadBehaviorTemplates()
    this.$message.success(this.$t('connections.behaviorTemplateSaved') as string)
    return true
  }

  get sequenceVariableNames(): string[] {
    return Object.keys(this.record.variables ?? {})
  }

  /** A sequence preset can carry the variables it needs, such as `water` for the built-in cycle. */
  private applySequenceVariables(payload: { variables?: { [name: string]: StoredVariable } }) {
    const incoming = payload?.variables ?? {}
    const current = { ...(this.record.variables ?? {}) }
    let changed = false
    Object.keys(incoming).forEach((name) => {
      if (current[name] === undefined) {
        current[name] = incoming[name]
        changed = true
      }
    })
    if (changed) {
      // `variables` is absent from the default record, so a plain assignment is invisible to Vue 2.
      Vue.set(this.record, 'variables', current)
    }
  }

  /**
   * Gives the record the fields MQTTX Plus added, so the editors bound to them always have a value.
   * Connections created by the upstream web build simply have no `autoSubscriptions` key.
   */
  private normalizeRecord() {
    if (!Array.isArray(this.record.autoSubscriptions)) {
      Vue.set(this.record, 'autoSubscriptions', [])
    }
    if (!Array.isArray(this.record.connectReports)) {
      Vue.set(this.record, 'connectReports', [])
    }
    if (!this.record.variables || typeof this.record.variables !== 'object' || Array.isArray(this.record.variables)) {
      Vue.set(this.record, 'variables', {})
    }
    if (!Array.isArray(this.record.autoReplies)) {
      Vue.set(this.record, 'autoReplies', [])
    }
    if (!Array.isArray(this.record.messageSequences)) {
      Vue.set(this.record, 'messageSequences', [])
    }
    if (!Array.isArray(this.record.timedReports)) {
      Vue.set(this.record, 'timedReports', [])
    }
  }

  private validateForm(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.vueForm.validate((valid: boolean) => {
        if (!valid) {
          resolve(false)
          return
        }

        resolve(true)
      })
    })
  }

  private async saveData() {
    const data = { ...this.record }
    data.properties = emptyToNull(data.properties)
    let res: ConnectionModel | null = null

    if (this.oper === 'create') {
      // create a new connection
      res = await createConnection({
        ...data,
        createAt: time.getNowDate(),
        updateAt: time.getNowDate(),
      })
    } else {
      // update a exisit connection
      if (data.id) {
        res = await updateConnection(data.id, { ...data, updateAt: time.getNowDate() })
      }
    }

    return res
  }

  private async handleSave(type: 'connect' | 'save') {
    const valid = await this.validateForm()
    if (!valid) {
      return
    }

    const res = await this.saveData()
    // Save failed
    if (!(res && res.id)) {
      const msgError = this.oper === 'create' ? this.$tc('common.createfailed') : this.$tc('common.editfailed')
      this.$message.error(msgError)
      return
    }

    if (type === 'save') {
      const { id } = this.$route.params
      this.$emit('refresh')
      this.handleBack(id)
      this.$message.success(this.$tc('common.saveSuccess'))
    } else {
      // update ActiveConnection & connect
      this.changeActiveConnection({
        id: res.id,
        client: {},
        messages: [],
      } as Client)
      this.$emit('connect')
      this.$router.push(`/recent_connections/${res.id}`)
    }
  }

  private handleActionCommand(command: 'save') {
    if (command === 'save') {
      this.handleSave('save')
    }
  }

  private setClientID() {
    this.record.clientId = getClientId()
  }

  // Reverse the status of clientIdWithTime.
  private reverseClientIDWithTime() {
    this.record.clientIdWithTime = !this.record.clientIdWithTime
  }

  private handleSSL(val: boolean) {
    const { protocol } = this.record
    this.changeProtocol(protocol, val)
    if (!val) {
      this.record.certType = ''
    }
  }

  private changeProtocol(protocol: Protocol | undefined, isSSL: boolean): void | boolean {
    if (!protocol) {
      return false
    }
    if (/ws/gi.test(protocol)) {
      this.record.protocol = isSSL ? 'wss' : 'ws'
    }
  }

  private handleBack(id: string) {
    if (this.oper === 'create' && id === '0') {
      this.$router.push('/recent_connections')
    } else {
      this.$router.push(`/recent_connections/${id}`)
    }
  }

  private handleCollapse(part: 'advanced' | 'willMessage') {
    if (part === 'advanced') {
      this.advancedVisible = !this.advancedVisible
      this.toggleAdvancedVisible({
        advancedVisible: this.advancedVisible,
      })
    } else if (part === 'willMessage') {
      this.willMessageVisible = !this.willMessageVisible
      this.toggleWillMessageVisible({
        willMessageVisible: this.willMessageVisible,
      })
    }
  }

  private async validateName(rule: FormRule, name: string, callBack: NameCallBack) {
    for (const connection of this.allConnections) {
      if (this.oper === 'create' && connection.name === name) {
        callBack(this.$tc('connections.duplicateName'))
      } else if (this.oper === 'edit' && name !== this.oldName && connection.name === name) {
        callBack(this.$tc('connections.duplicateName'))
      }
    }
  }

  private async loadData(reload: boolean = false): Promise<void> {
    this.suggestConnections = await loadSuggestConnections()
  }

  private createFilter(queryName: string) {
    return (connectionItem: ConnectionModel) => {
      return connectionItem.name.toLowerCase().indexOf(queryName.toLowerCase()) === 0
    }
  }

  private querySearchName(queryName: string, cb: SearchCallBack) {
    const connections = [...this.suggestConnections]
    const results = queryName ? connections.filter(this.createFilter(queryName)) : connections
    cb(results.reverse())
  }

  private handleSelectName(item: ConnectionModel) {
    const { id, ...oneConnection } = item
    oneConnection.clientId = getClientId()
    this.record = oneConnection
  }

  private initRecord() {
    const { id } = this.$route.params
    if (this.oper === 'create') {
      this.record = _.cloneDeep(this.defaultRecord)
      this.normalizeRecord()
    } else if (this.oper === 'edit' && id !== '0') {
      this.loadDetail(id)
    }
  }

  private created() {
    this.loadData()
    this.initRecord()
    this.advancedVisible = this.getterAdvancedVisible
    this.willMessageVisible = this.getterWillMessageVisible
  }
}
</script>

<style lang="scss">
@import '~@/assets/scss/mixins.scss';

.behavior-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.behavior-select {
  width: 220px;
}


.connection-form {
  padding: 0 16px;
  .topbar {
    -webkit-app-region: drag;
    .tail {
      .connect-btn-group {
        display: flex;
        align-items: center;
        background: var(--color-main-green);
        border-radius: 8px;
        overflow: hidden;

        .connect-btn {
          padding: 0 16px;
          height: 32px;
          line-height: 32px;
          color: #fff;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.2s ease;

          &:hover {
            background: rgba(255, 255, 255, 0.1);
          }
        }

        .dropdown-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 10px;
          height: 32px;
          border-left: 1px solid rgba(255, 255, 255, 0.2);
          color: #fff;
          transition: background 0.2s ease;

          &:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          i {
            font-size: 12px;
          }
        }
      }
    }
  }
  .el-form {
    padding-top: 80px;
    padding-bottom: 40px;
    // normal icon operation style
    .icon-oper {
      color: var(--color-text-default);
      line-height: 43px;
      transition: 0.2s color ease;
      &:hover,
      &:focus {
        color: var(--color-main-green);
      }
      &.file {
        position: relative;
        input[type='file'] {
          cursor: pointer;
          font-size: 0;
          position: absolute;
          width: 100%;
          height: 100%;
          right: 0;
          top: 0;
          opacity: 0;
        }
      }
    }
    .unit {
      color: var(--color-text-default);
      line-height: 43px;
      font-size: 12px;
    }
    // icon style without fake class such as `:hover` style
    .icon-oper-pure {
      color: var(--color-text-default);
      line-height: 43px;
      transition: 0.2s color ease;
    }
    // icon active
    .icon-oper-active {
      color: var(--color-main-green);
    }
    .el-form-item__error {
      top: 80%;
    }
    .host-item {
      .el-col-6 {
        padding-left: 0px !important;
      }
      .el-col-18 {
        padding-right: 0px !important;
      }
    }
    .last-will-payload {
      height: 235px;
      border: 1px solid var(--color-border-default);
      padding: 10px 1px 1px 1px;
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
    }
    .content-type-item {
      margin-top: 8px;
    }
    .key-value-editor {
      padding-left: 12px;
    }
    @include editor-lang-type;
  }
  .info-header {
    a.collapse-btn {
      color: var(--color-text-light);
      font-size: 1rem;
      position: relative;
      top: 1px;
    }
    @include collapse-btn-transform(0deg, 180deg);
  }
  .item-secure {
    .el-form-item__content {
      display: flex;
      align-items: center;
      .tooltip-secure {
        margin-left: 10px;
      }
    }
  }
}

.ws-protocol-tip {
  max-width: 300px;
  a {
    font-size: 12px;
  }
}

.ws-protocol-select {
  .icon-tip {
    position: absolute;
    right: 16px;
    font-size: 16px;
    color: var(--color-text-tips);
  }
}
</style>
