// jsdom needs the few browser APIs the payload editor (monaco) touches at import time.
import '../mocks/browserStorage'
import { expect } from 'chai'
import Vue from 'vue'
import ElementUI from 'element-ui'
import { createLocalVue, mount, shallowMount, Wrapper } from '@vue/test-utils'
import Configs from '@/views/configs/index.vue'
import MessagePreview from '@/components/MessagePreview.vue'
import VariableDefinitionEditor from '@/components/VariableDefinitionEditor.vue'
import {
  saveMessagePreset,
  deleteMessagePreset,
  saveGlobalVariable,
  deleteGlobalVariable,
  saveClientProfile,
  deleteClientProfile,
  saveMessageSequencePreset,
  deleteMessageSequencePreset,
} from '@/utils/configProfiles'
import { createBlankMessageSequence } from '@/utils/messageSequenceExamples'
import { normalizeGlobalVariables, writeVariableState } from '@/utils/payloadVariables'

const localVue = createLocalVue()
localVue.use(ElementUI)

let createdIds: string[] = []
let createdVariableIds: string[] = []
let createdClientIds: string[] = []
let createdSequenceIds: string[] = []

/**
 * Element UI's `el-select` cannot mount in jsdom, so the whole view is shallow mounted: this still
 * compiles the view, runs its lifecycle hooks and proves the message column is wired to the preview
 * component. The rendered preview itself is covered by components/MessagePreview.spec.ts.
 */
const createWrapper = (): Wrapper<Vue> =>
  shallowMount(Configs, {
    localVue,
    mocks: { $t: (key: string) => key },
  })

describe('configs view', () => {
  afterEach(() => {
    createdIds.forEach((id) => deleteMessagePreset(id))
    createdIds = []
    createdVariableIds.forEach((id) => deleteGlobalVariable(id))
    createdVariableIds = []
    createdClientIds.forEach((id) => deleteClientProfile(id))
    createdClientIds = []
    createdSequenceIds.forEach((id) => deleteMessageSequencePreset(id))
    createdSequenceIds = []
  })

  /** Runs one of the form rules of the view the way element-ui does. */
  const runRule = (rule: any, value: unknown): Promise<string | undefined> =>
    new Promise((resolve) => {
      rule.validator(rule, value, (error?: Error) => resolve(error?.message))
    })

  it('registers the single line message preview used by the message column', () => {
    expect((Configs as any).options.components.MessagePreview).to.equal(MessagePreview)
  })

  it('registers the definition editor used by the global variable dialog', () => {
    expect((Configs as any).options.components.VariableDefinitionEditor).to.equal(VariableDefinitionEditor)
  })

  it('shows the kind, the default and the current value of a stateful global variable', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.activeTab = 'variable'
    await wrapper.vm.$nextTick()

    const saved = saveGlobalVariable({
      name: 'weight',
      value: '200',
      definition: { kind: 'sequence', initial: 200, step: -20 },
    })
    createdVariableIds.push(saved.id)
    vm.loadData()

    const row = () => vm.variableRows().find((item: any) => item.name === 'weight')
    expect(row().kindKey).to.equal('configs.variableKindSequence')
    expect(row().stateful).to.equal(true)
    expect(row().defaultValue).to.equal('200')
    expect(row().currentValue).to.equal('200')

    // The current value comes from the runtime state, not from the definition.
    const definition = normalizeGlobalVariables([saved]).weight
    writeVariableState(definition.stateKey as string, 160)
    expect(row().currentValue).to.equal('160')

    vm.handleResetVariable(row())
    expect(row().currentValue).to.equal('200')
  })

  it('reloads the message presets when the message tab is opened', async () => {
    const wrapper = createWrapper()
    const saved = saveMessagePreset({ name: 'preview', topic: 'a/b', payload: '{\n  "a": 1\n}' })
    createdIds.push(saved.id)
    ;(wrapper.vm as any).activeTab = 'message'
    await wrapper.vm.$nextTick()

    const presets = (wrapper.vm as any).messagePresets as { name: string }[]
    expect(presets.map((preset) => preset.name)).to.contain('preview')
  })

  it('summarises the variables of a client preset for the table', () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any

    expect(vm.describeVariables({ productType: 'A1', site: 'north' })).to.equal('productType=A1, site=north')
    expect(vm.describeVariables(null)).to.equal('-')
    expect(vm.describeVariables({})).to.equal('-')
  })

  it('opens a sequence preset with its sequence and variables', async () => {
    const wrapper = createWrapper()
    const saved = saveMessageSequencePreset({
      name: 'dock',
      sequence: {
        ...createBlankMessageSequence(),
        name: 'dock',
        trigger: 'connect',
        steps: [{ ...createBlankMessageSequence().steps[0], topic: 'device/water' }],
      },
      variables: { water: { kind: 'captured', value: '2000', resetOn: [] } },
    })
    createdSequenceIds.push(saved.id)
    const vm = wrapper.vm as any
    vm.activeTab = 'sequence'
    await wrapper.vm.$nextTick()

    vm.handleEdit((vm.messageSequencePresets as MessageSequencePresetModel[]).find((preset) => preset.id === saved.id))

    expect(vm.dialogType).to.equal('sequence')
    expect(vm.profileForm.name).to.equal('dock')
    expect(vm.profileForm.messageSequences[0].trigger).to.equal('connect')
    expect(vm.profileForm.messageSequences[0].steps[0].topic).to.equal('device/water')
    expect(vm.profileForm.variables.water).to.deep.equal({ kind: 'captured', value: '2000', resetOn: [] })
    expect(
      vm.sequenceTriggerLabel(
        vm.messageSequencePresets.find((preset: MessageSequencePresetModel) => preset.id === saved.id),
      ),
    ).to.equal('connections.messageSequenceTriggerConnect')
  })

  it('opens a client preset with the variables it was saved with', async () => {
    const wrapper = createWrapper()
    const saved = saveClientProfile({
      alias: 'sn0106',
      clientId: 'sn0106-1',
      variables: { productType: 'A1' },
    })
    createdClientIds.push(saved.id)
    const vm = wrapper.vm as any
    vm.activeTab = 'client'
    await wrapper.vm.$nextTick()

    vm.handleEdit((vm.clientProfiles as ClientProfileModel[]).find((profile) => profile.id === saved.id))

    expect(vm.profileForm.variables).to.deep.equal({ productType: 'A1' })
  })

  it('rebuilds the table of a tab instead of patching the one of the previous tab', async () => {
    // `el-table` keeps the column instances of the table it was rendered with, so patching one
    // tab's table into the one of the next tab swapped two column slots: the password column then
    // showed the edit/delete buttons and the actions column showed the "-" of the password column.
    const wrapper = mount(Configs, {
      localVue,
      mocks: { $t: (key: string) => key },
      // The preset dialog now hosts the two automation editors, which use dropdowns of their own.
      stubs: { ElSelect: true, AutoSubscribeEditor: true, AutoReplyEditor: true },
    })
    const vm = wrapper.vm as any

    vm.activeTab = 'client'
    await wrapper.vm.$nextTick()
    const clientTable = wrapper.find('.el-table').element

    vm.activeTab = 'message'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.el-table').element).to.not.equal(clientTable)

    vm.activeTab = 'client'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.el-table').element).to.not.equal(clientTable)

    wrapper.destroy()
  })

  it('rejects a message without visible content when saving a preset', async () => {
    const wrapper = createWrapper()
    const rule = ((wrapper.vm as any).profileRules as any).payload[0]
    const validate = (value: unknown): Promise<string | undefined> =>
      new Promise((resolve) => {
        rule.validator(rule, value, (error?: Error) => resolve(error?.message))
      })

    expect(await validate('  \n\t ')).to.equal('configs.requiredField')
    expect(await validate('')).to.equal('configs.requiredField')
    expect(await validate(undefined)).to.equal('configs.requiredField')
    expect(await validate('{"a":1}')).to.equal(undefined)
    expect(await validate('  {"a":1}  ')).to.equal(undefined)
  })

  it('lists the global variables on the variable tab', async () => {
    const wrapper = createWrapper()
    const saved = saveGlobalVariable({ name: 'sn', value: 'SN04010302CA26BEEF' })
    createdVariableIds.push(saved.id)
    ;(wrapper.vm as any).activeTab = 'variable'
    await wrapper.vm.$nextTick()

    const variables = (wrapper.vm as any).globalVariables as { name: string }[]
    expect(variables.map((variable) => variable.name)).to.contain('sn')
  })

  it('validates a global variable name', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.activeTab = 'variable'
    await wrapper.vm.$nextTick()
    const saved = saveGlobalVariable({ name: 'sn', value: 'SN0400' })
    createdVariableIds.push(saved.id)
    vm.loadData()
    // The name rule only applies to the variable dialog, so open it first.
    vm.handleAdd()

    const rule = vm.profileRules.name.find((item: any) => typeof item.validator === 'function')
    expect(await runRule(rule, 'deviceId')).to.equal(undefined)
    expect(await runRule(rule, '2ndDevice')).to.equal('configs.variableNameInvalid')
    expect(await runRule(rule, 'device-id')).to.equal('configs.variableNameInvalid')
    expect(await runRule(rule, 'timestamp')).to.equal('configs.variableNameReserved')
    expect(await runRule(rule, 'sn')).to.equal('configs.variableNameDuplicate')
  })

  it('leaves the name of a message preset alone', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.activeTab = 'message'
    await wrapper.vm.$nextTick()
    vm.handleAdd()

    const rule = vm.profileRules.name.find((item: any) => typeof item.validator === 'function')
    expect(await runRule(rule, '115设备绑定用户')).to.equal(undefined)
  })

  it('rejects an empty variable value', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.activeTab = 'variable'
    await wrapper.vm.$nextTick()

    const rule = vm.profileRules.value[0]
    expect(await runRule(rule, '   ')).to.equal('configs.requiredField')
    expect(await runRule(rule, '')).to.equal('configs.requiredField')
    expect(await runRule(rule, 'app')).to.equal(undefined)
    expect(await runRule(rule, '${timestamp}')).to.equal(undefined)
  })

  it('opens the variable form for a new and for an existing variable', async () => {
    const wrapper = createWrapper()
    const vm = wrapper.vm as any
    vm.activeTab = 'variable'
    await wrapper.vm.$nextTick()

    vm.handleAdd()
    expect(vm.dialogType).to.equal('variable')
    expect(vm.profileForm).to.deep.equal({ name: '', value: '' })

    const saved = saveGlobalVariable({ name: 'sn', value: 'SN0400' })
    createdVariableIds.push(saved.id)
    vm.handleEdit(saved)
    expect(vm.editingId).to.equal(saved.id)
    expect(vm.profileForm).to.deep.equal({ id: saved.id, name: 'sn', value: 'SN0400' })
  })
})
