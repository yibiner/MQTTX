import { expect } from 'chai'
import { mount, createLocalVue } from '@vue/test-utils'
import PresetPicker from '@/components/PresetPicker.vue'

const localVue = createLocalVue()
const stubs: { [name: string]: true } = {
  'el-popover': true,
  'el-input': true,
  'el-button': true,
}

const options = (count: number) =>
  Array.from({ length: count }, (unused, index) => ({
    id: `p${index}`,
    name: `preset ${index}`,
    summary: index % 2 === 0 ? 'device/+/state' : 'device/ota',
  }))

describe('PresetPicker.vue', () => {
  let wrapper: any

  const buildWrapper = (extra: { [key: string]: unknown } = {}) =>
    mount(PresetPicker, {
      localVue,
      propsData: {
        items: options(3),
        title: 'configs.topicPresets',
        emptyText: 'configs.topicPresetsEmpty',
        ...extra,
      },
      stubs,
      mocks: { $t: (key: string) => key },
    })

  afterEach(() => {
    wrapper?.destroy()
    wrapper = undefined
  })

  it('lists every item while the list is short', () => {
    wrapper = buildWrapper()
    expect((wrapper.vm as any).filtered).to.have.lengthOf(3)
  })

  it('narrows by name and by the summary line', async () => {
    wrapper = buildWrapper({ items: options(12) })
    wrapper.setData({ query: 'preset 1' })
    expect((wrapper.vm as any).filtered.map((item: { id: string }) => item.id)).to.deep.equal(['p1', 'p10', 'p11'])

    await wrapper.setData({ query: 'ota' })
    expect((wrapper.vm as any).filtered.map((item: { id: string }) => item.id)).to.deep.equal([
      'p1',
      'p3',
      'p5',
      'p7',
      'p9',
      'p11',
    ])

    await wrapper.setData({ query: 'nothing here' })
    expect((wrapper.vm as any).filtered).to.have.lengthOf(0)
  })

  it('emits the picked id and closes', () => {
    wrapper = buildWrapper()
    wrapper.setData({ visible: true })
    ;(wrapper.vm as any).choose({ id: 'p2', name: 'preset 2' })
    expect(wrapper.emitted('select').pop()[0]).to.equal('p2')
    expect(wrapper.vm.visible).to.equal(false)
  })

  it('clears the search on close, so the next open shows everything again', async () => {
    wrapper = buildWrapper({ items: options(12) })
    await wrapper.setData({ query: 'preset 1', visible: true })
    await wrapper.setData({ visible: false })
    expect(wrapper.vm.query).to.equal('')
  })

  it('asks the parent to reload when it opens', () => {
    wrapper = buildWrapper()
    ;(wrapper.vm as any).handleShow()
    expect(wrapper.emitted('show')).to.have.lengthOf(1)
  })

  it('hides the manage link when no tab is given', () => {
    wrapper = buildWrapper()
    expect(wrapper.find('.preset-picker-footer').exists()).to.equal(false)
  })
})
