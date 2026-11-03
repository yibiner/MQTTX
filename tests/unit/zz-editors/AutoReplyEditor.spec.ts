import { expect } from 'chai'
import { mount, createLocalVue } from '@vue/test-utils'
import AutoReplyEditor, { createBlankAutoReplyRule } from '@/components/AutoReplyEditor.vue'

// Element UI is stubbed: mounting its dropdowns in jsdom leaves popover state behind.
const localVue = createLocalVue()
const stubs: { [name: string]: true } = {
  'el-input': true,
  'el-input-number': true,
  'el-select': true,
  'el-option': true,
  'el-checkbox': true,
  'el-switch': true,
  'el-tooltip': true,
  'el-button': true,
  'el-radio-group': true,
  'el-radio-button': true,
  TopicPresetPicker: true,
  PresetPicker: true,
}

const createRule = (overrides: Partial<AutoReplyRuleModel> = {}): AutoReplyRuleModel => ({
  id: 'r1',
  name: 'WIFI重连应答',
  enabled: true,
  matchTopic: 'app/+/+/device/system/post',
  matchCondition: "cmd == 'WIFI_RECONNECT_SERVICE'",
  reply: {
    topic: 'app/${productType}/+/device/system/reply',
    mode: 'echo',
    payload: '{"code":0,"msg":null}',
    qos: 0,
    retain: false,
    delayMs: 0,
  },
  ...overrides,
})

/**
 * `echo` plays the parent of the `v-model`: it feeds the emitted value straight back as the new prop,
 * which is the round-trip that used to delete a rule the user had just added.
 */
describe('AutoReplyEditor.vue', () => {
  let wrapper: any

  const buildWrapper = (value: AutoReplyRuleModel[] | null = [createRule()], extra: { [key: string]: unknown } = {}) =>
    mount(AutoReplyEditor, {
      localVue,
      propsData: { value, ...extra },
      stubs,
      mocks: { $t: (key: string) => key },
    })

  const echo = async (current: any) => {
    const emitted = current.emitted('change') ?? []
    if (!emitted.length) {
      return
    }
    await current.setProps({ value: emitted[emitted.length - 1][0] })
    await current.vm.$nextTick()
  }

  afterEach(() => {
    wrapper?.destroy()
    wrapper = undefined
  })

  it('renders the rule of the WIFI reconnect scenario', () => {
    wrapper = buildWrapper()
    expect(wrapper.findAll('.reply-rule')).to.have.lengthOf(1)
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.matchTopic).to.equal('app/+/+/device/system/post')
    expect(rule.matchCondition).to.equal("cmd == 'WIFI_RECONNECT_SERVICE'")
    expect(wrapper.find('.cell-error').exists()).to.equal(false)
  })

  it('inserts a reply preset with a fresh rule id and hands over its variables', async () => {
    const preset: AutoReplyPresetModel = {
      id: 'reply-preset',
      name: 'WIFI 重连应答',
      rule: createRule({ id: 'from-preset' }),
      variables: { productType: { kind: 'constant', value: 'A1' } },
    }
    wrapper = buildWrapper(null, { templates: [preset] })
    ;(wrapper.vm as any).insertTemplateById('reply-preset')
    await wrapper.vm.$nextTick()

    const rules = wrapper.emitted('change').pop()[0] as AutoReplyRuleModel[]
    expect(rules).to.have.lengthOf(1)
    expect(rules[0].id).to.not.equal('from-preset')
    expect(rules[0].name).to.equal('WIFI重连应答')
    expect(rules[0].matchTopic).to.equal('app/+/+/device/system/post')
    expect(rules[0].reply.mode).to.equal('echo')

    const example = wrapper.emitted('example').pop()[0]
    expect(example.variables.productType).to.deep.equal({ kind: 'constant', value: 'A1' })
  })

  it('inserts every rule of a reply preset', async () => {
    const first = createRule({ id: 'from-preset', name: 'ack' })
    const second = createRule({ id: 'other', name: 'ota', matchTopic: 'device/ota' })
    const preset: AutoReplyPresetModel = {
      id: 'bundle',
      name: 'bundle',
      rule: first,
      rules: [first, second],
    }
    wrapper = buildWrapper(null, { templates: [preset] })
    ;(wrapper.vm as any).insertTemplateById('bundle')
    await wrapper.vm.$nextTick()

    const rules = wrapper.emitted('change').pop()[0] as AutoReplyRuleModel[]
    expect(rules).to.have.lengthOf(2)
    expect(rules[0].id).to.not.equal('from-preset')
    expect(rules[1].id).to.not.equal('other')
    expect(rules[0].name).to.equal('ack')
    expect(rules[1].name).to.equal('ota')
    expect(rules[1].matchTopic).to.equal('device/ota')
  })

  it('lists one summary line per reply preset and ignores an unknown id', async () => {
    const preset: AutoReplyPresetModel = {
      id: 'p1',
      name: 'fixed ack',
      rule: createRule({ reply: { ...createRule().reply, mode: 'fixed' } }),
    }
    wrapper = buildWrapper(null, { templates: [preset] })
    const options = (wrapper.vm as any).presetOptions
    expect(options).to.have.lengthOf(1)
    expect(options[0].name).to.equal('fixed ack')
    expect(options[0].summary).to.contain('app/+/+/device/system/post')
    expect(options[0].summary).to.contain('connections.autoReplyModeFixed')
    ;(wrapper.vm as any).insertTemplateById('missing')
    expect(wrapper.emitted('change')).to.equal(undefined)
  })

  it('offers no preset picker while it edits a single preset rule', () => {
    const preset: AutoReplyPresetModel = { id: 'p1', name: 'ack', rule: createRule() }
    wrapper = buildWrapper([createRule()], { templates: [preset], singleton: true })
    expect(wrapper.find('presetpicker-stub').exists()).to.equal(false)
    expect(wrapper.find('.rule-delete').exists()).to.equal(false)
    // The preset dialog already has a name field. The rule name would be overwritten on save.
    expect(wrapper.find('.rule-name').exists()).to.equal(false)
    expect(wrapper.find('.el-switch').exists() || wrapper.find('el-switch-stub').exists()).to.equal(true)
  })

  it('starts the preset dialog from one empty rule', () => {
    const rule = createBlankAutoReplyRule()
    expect(rule.name).to.equal('')
    expect(rule.matchTopic).to.equal('')
    expect(rule.reply.mode).to.equal('echo')
    expect(rule.enabled).to.equal(true)
  })

  it('keeps a rule the user just added visible when the parent echoes the value back', async () => {
    wrapper = buildWrapper(null)
    expect(wrapper.findAll('.reply-rule')).to.have.lengthOf(0)
    ;(wrapper.vm as any).addRule()
    await echo(wrapper)

    expect((wrapper.vm as any).rules).to.have.lengthOf(1)
    expect(wrapper.findAll('.reply-rule')).to.have.lengthOf(1)
    expect((wrapper.vm as any).rules[0].reply.mode).to.equal('echo')
    // No name and no topic filter yet: nothing worth saving.
    expect(wrapper.emitted('change').pop()[0]).to.deep.equal([])
  })

  it('emits the rule once it has a topic filter', async () => {
    wrapper = buildWrapper(null)
    ;(wrapper.vm as any).addRule()
    await echo(wrapper)
    ;(wrapper.vm as any).rules[0].matchTopic = 'app/+/+/device/system/post'
    ;(wrapper.vm as any).emitChange()
    await echo(wrapper)

    const rules = wrapper.emitted('change').pop()[0] as AutoReplyRuleModel[]
    expect(rules).to.have.lengthOf(1)
    expect(rules[0].matchTopic).to.equal('app/+/+/device/system/post')
  })

  it('points out an invalid JMESPath condition', () => {
    wrapper = buildWrapper([createRule({ matchCondition: 'cmd ==' })])
    expect(wrapper.find('.cell-error').exists()).to.equal(true)
  })

  it('treats an empty condition as a match on every message', () => {
    wrapper = buildWrapper([createRule({ matchCondition: '' })])
    expect(wrapper.find('.cell-error').exists()).to.equal(false)
  })

  it('emits the rule when its reply delay is picked from the quick buttons', async () => {
    wrapper = buildWrapper()
    wrapper.findAll('.quick-delay').at(3).trigger('click')
    await echo(wrapper)

    expect(wrapper.emitted('change').pop()[0][0].reply.delayMs).to.equal(1000)
  })

  it('takes over a rule list that the parent replaces', async () => {
    wrapper = buildWrapper()
    await wrapper.setProps({ value: [createRule({ id: 'r9', name: 'other' })] })

    expect((wrapper.vm as any).rules).to.have.lengthOf(1)
    expect((wrapper.vm as any).rules[0].id).to.equal('r9')
  })
})
