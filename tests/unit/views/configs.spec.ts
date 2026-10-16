import { expect } from 'chai'
import Vue from 'vue'
import ElementUI from 'element-ui'
import { createLocalVue, shallowMount, Wrapper } from '@vue/test-utils'
import Configs from '@/views/configs/index.vue'
import MessagePreview from '@/components/MessagePreview.vue'
import {
  saveMessagePreset,
  deleteMessagePreset,
  saveGlobalVariable,
  deleteGlobalVariable,
} from '@/utils/configProfiles'

const localVue = createLocalVue()
localVue.use(ElementUI)

let createdIds: string[] = []
let createdVariableIds: string[] = []

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
  })

  /** Runs one of the form rules of the view the way element-ui does. */
  const runRule = (rule: any, value: unknown): Promise<string | undefined> =>
    new Promise((resolve) => {
      rule.validator(rule, value, (error?: Error) => resolve(error?.message))
    })

  it('registers the single line message preview used by the message column', () => {
    expect((Configs as any).options.components.MessagePreview).to.equal(MessagePreview)
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
