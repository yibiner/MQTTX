import { expect } from 'chai'
import Vue from 'vue'
import ElementUI from 'element-ui'
import { createLocalVue, mount, Wrapper } from '@vue/test-utils'
import VariableEditor from '@/components/VariableEditor.vue'
import { resetAllVariableStates } from '@/utils/payloadVariables'

const localVue = createLocalVue()
localVue.use(ElementUI)

/**
 * Element UI's dropdowns cannot mount in jsdom (the popper needs a real layout), and the definition
 * editor shows a couple of them per kind. They are stubbed; the text inputs this spec drives stay
 * real, so the emitted map is still exercised end to end.
 */
const stubs: { [name: string]: true } = {
  'el-select': true,
  'el-option': true,
  'el-tooltip': true,
  'el-input-number': true,
  'el-checkbox': true,
  'el-switch': true,
  'el-radio-group': true,
  'el-radio-button': true,
}

const createWrapper = (value: { [name: string]: StoredVariable } | null = null, connectionId = ''): Wrapper<Vue> =>
  mount(VariableEditor, {
    localVue,
    propsData: { value, connectionId },
    stubs,
    mocks: { $t: (key: string) => key, $message: { success: () => undefined, error: () => undefined } },
  })

const typeInto = (wrapper: Wrapper<Vue>, selector: string, index: number, text: string) => {
  const input = wrapper.findAll(selector).at(index)
  ;(input.element as HTMLInputElement).value = text
  input.trigger('input')
}

const lastChange = (wrapper: Wrapper<Vue>): { [name: string]: StoredVariable } | undefined => {
  const emitted = wrapper.emitted('change') ?? []
  return emitted[emitted.length - 1]?.[0] as { [name: string]: StoredVariable } | undefined
}

describe('VariableEditor', () => {
  afterEach(() => {
    resetAllVariableStates()
  })

  it('renders one row per variable and a blank row otherwise', () => {
    const wrapper = createWrapper({ productType: 'SN0106', sn: 'AF0201' })
    expect(wrapper.findAll('.variable-row')).to.have.lengthOf(2)
    expect((wrapper.findAll('.variable-name input').at(0).element as HTMLInputElement).value).to.equal('productType')

    const empty = createWrapper()
    expect(empty.findAll('.variable-row')).to.have.lengthOf(1)
    expect((empty.find('.variable-name input').element as HTMLInputElement).value).to.equal('')
    expect(empty.find('.variable-definition').exists()).to.equal(true)
  })

  it('emits the variables as a stored-variable map', () => {
    const wrapper = createWrapper()
    typeInto(wrapper, '.variable-name input', 0, 'productType')
    typeInto(wrapper, '.variable-value input', 0, 'SN0106')

    expect(lastChange(wrapper)).to.deep.equal({ productType: 'SN0106' })
  })

  it('adds and removes rows', () => {
    const wrapper = createWrapper({ productType: 'SN0106' })
    wrapper.find('.variable-add').trigger('click')
    expect(wrapper.findAll('.variable-row')).to.have.lengthOf(2)

    wrapper.findAll('.variable-delete').at(0).trigger('click')
    expect(wrapper.findAll('.variable-row')).to.have.lengthOf(1)
    expect(lastChange(wrapper)).to.deep.equal({})

    // The last row is kept as a blank draft instead of disappearing.
    wrapper.find('.variable-delete').trigger('click')
    expect(wrapper.findAll('.variable-row')).to.have.lengthOf(1)
  })

  it('does not drop the row that is being typed in', async () => {
    const wrapper = createWrapper({ productType: 'SN0106' })
    wrapper.find('.variable-add').trigger('click')
    typeInto(wrapper, '.variable-name input', 1, 'sn')

    // The parent stores what the editor emitted, which would rebuild the rows without the draft.
    wrapper.setProps({ value: lastChange(wrapper) })
    await localVue.nextTick()

    expect(wrapper.findAll('.variable-row')).to.have.lengthOf(2)
    expect((wrapper.findAll('.variable-name input').at(1).element as HTMLInputElement).value).to.equal('sn')
  })

  it('points out a name that cannot be used', () => {
    const wrapper = createWrapper({ '2ndDevice': 'a', timestamp: 'b', sn: 'c' })
    expect(wrapper.findAll('.variable-error').at(0).text()).to.equal('configs.variableNameInvalid')
    expect(wrapper.findAll('.variable-error').at(1).text()).to.equal('configs.variableNameReserved')
    expect(wrapper.findAll('.variable-error')).to.have.lengthOf(2)
  })

  it('points out a duplicated name', () => {
    const wrapper = createWrapper()
    wrapper.find('.variable-add').trigger('click')
    typeInto(wrapper, '.variable-name input', 0, 'sn')
    typeInto(wrapper, '.variable-name input', 1, 'sn')

    expect(wrapper.findAll('.variable-error')).to.have.lengthOf(2)
    expect(wrapper.findAll('.variable-error').at(0).text()).to.equal('configs.variableNameDuplicate')
  })

  it('follows a value that the parent changes', async () => {
    const wrapper = createWrapper({ productType: 'SN0106' })
    wrapper.setProps({ value: { productType: 'SN0116', line: 'A' } })
    await localVue.nextTick()

    expect(wrapper.findAll('.variable-row')).to.have.lengthOf(2)
    expect((wrapper.findAll('.variable-value input').at(0).element as HTMLInputElement).value).to.equal('SN0116')
  })

  it('expands one row to edit its definition inline', () => {
    const wrapper = createWrapper({ productType: 'SN0106' })
    expect(wrapper.find('.variable-definition').exists()).to.equal(true)

    wrapper.find('.variable-expand').trigger('click')
    expect(wrapper.find('.variable-definition').exists()).to.equal(false)

    wrapper.find('.variable-expand').trigger('click')
    expect(wrapper.find('.variable-definition').exists()).to.equal(true)
  })

  it('shows the kind and a compact summary of a stateful variable', () => {
    const wrapper = createWrapper({ weight: { kind: 'sequence', initial: 200, step: -20 } })

    expect(wrapper.find('.variable-type').text()).to.equal('configs.variableKindSequence')
    expect(wrapper.find('.variable-summary').text()).to.equal('200 → 180 → 160')
  })

  it('hides the runtime parts without a connection id (client preset editor)', () => {
    const wrapper = createWrapper({ weight: { kind: 'sequence', initial: 200, step: -20 } })

    expect(wrapper.find('.variable-current').exists()).to.equal(false)
    expect(wrapper.find('.variable-reset').exists()).to.equal(false)
    expect(wrapper.find('.variable-set').exists()).to.equal(false)
  })

  it('shows, resets and manually changes the current value of a connection variable', async () => {
    const wrapper = createWrapper({ weight: { kind: 'sequence', initial: 200, step: -20 } }, 'connection-1')

    expect(wrapper.find('.variable-current-value').text()).to.equal('200')
    expect(wrapper.find('.variable-reset').exists()).to.equal(true)

    wrapper.find('.variable-reset').trigger('click')
    await localVue.nextTick()
    expect(wrapper.find('.variable-current-value').text()).to.equal('200')

    wrapper.find('.variable-set').trigger('click')
    await localVue.nextTick()
    expect(wrapper.find('.variable-set-row').exists()).to.equal(true)
    typeInto(wrapper, '.variable-set-input input', 0, '180')
    wrapper.find('.variable-set-confirm').trigger('click')
    await localVue.nextTick()

    expect(wrapper.find('.variable-current-value').text()).to.equal('180')
    expect(wrapper.find('.variable-set-row').exists()).to.equal(false)
  })
})
