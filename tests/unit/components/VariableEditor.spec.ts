import { expect } from 'chai'
import Vue from 'vue'
import ElementUI from 'element-ui'
import { createLocalVue, mount, Wrapper } from '@vue/test-utils'
import VariableEditor from '@/components/VariableEditor.vue'

const localVue = createLocalVue()
localVue.use(ElementUI)

const createWrapper = (value: { [name: string]: string } | null = null): Wrapper<Vue> =>
  mount(VariableEditor, {
    localVue,
    propsData: { value },
    mocks: { $t: (key: string) => key },
  })

const typeInto = (wrapper: Wrapper<Vue>, selector: string, index: number, text: string) => {
  const input = wrapper.findAll(selector).at(index)
  ;(input.element as HTMLInputElement).value = text
  input.trigger('input')
}

const lastChange = (wrapper: Wrapper<Vue>): { [name: string]: string } | undefined => {
  const emitted = wrapper.emitted('change') ?? []
  return emitted[emitted.length - 1]?.[0] as { [name: string]: string } | undefined
}

describe('VariableEditor', () => {
  it('renders one row per variable and a blank row otherwise', () => {
    const wrapper = createWrapper({ productType: 'SN0106', sn: 'AF0201' })
    expect(wrapper.findAll('.variable-row')).to.have.lengthOf(2)
    expect((wrapper.findAll('.variable-name input').at(0).element as HTMLInputElement).value).to.equal('productType')

    const empty = createWrapper()
    expect(empty.findAll('.variable-row')).to.have.lengthOf(1)
    expect((empty.find('.variable-name input').element as HTMLInputElement).value).to.equal('')
  })

  it('emits the variables as a name/value map', () => {
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
})
