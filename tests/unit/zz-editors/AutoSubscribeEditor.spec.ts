import { expect } from 'chai'
import { mount, createLocalVue } from '@vue/test-utils'
import AutoSubscribeEditor from '@/components/AutoSubscribeEditor.vue'

// Element UI is stubbed: mounting its dropdowns in jsdom leaves popover state behind that breaks the
// next test file which mounts a component using `el-select`.
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
}

const createGroup = (overrides: Partial<AutoSubscribeGroupModel> = {}): AutoSubscribeGroupModel => ({
  id: 'g1',
  delayMs: 0,
  merge: true,
  enabled: true,
  topics: [{ topic: 'a/b', qos: 0 }],
  ...overrides,
})

/**
 * The editor is a controlled component: it holds the rows while they are being edited and emits only
 * the rows that are worth saving. `echo` below plays the parent of a `v-model`, i.e. it feeds the
 * emitted value straight back as the new prop - the round-trip that used to delete a row the user
 * had just added.
 */
describe('AutoSubscribeEditor.vue', () => {
  let wrapper: any

  const buildWrapper = (value: AutoSubscribeGroupModel[] | null = [createGroup()]) =>
    mount(AutoSubscribeEditor, {
      localVue,
      propsData: { value },
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

  it('renders one row per configured topic', () => {
    wrapper = buildWrapper([
      createGroup({
        topics: [
          { topic: 'a/b', qos: 0 },
          { topic: 'a/c', qos: 1 },
        ],
      }),
    ])
    expect(wrapper.findAll('.auto-subscribe-group')).to.have.lengthOf(1)
    expect(wrapper.findAll('.topic-row')).to.have.lengthOf(2)
    expect((wrapper.vm as any).groups[0].topics[1].topic).to.equal('a/c')
  })

  it('keeps a group the user just added visible when the parent echoes the value back', async () => {
    wrapper = buildWrapper(null)
    expect(wrapper.find('.empty-hint').exists()).to.equal(true)
    ;(wrapper.vm as any).addGroup()
    await echo(wrapper)

    expect((wrapper.vm as any).groups).to.have.lengthOf(1)
    expect(wrapper.findAll('.auto-subscribe-group')).to.have.lengthOf(1)
    // Nothing worth saving yet: the group has no topic.
    expect(wrapper.emitted('change').pop()[0]).to.deep.equal([])
  })

  it('keeps a topic the user just added visible when the parent echoes the value back', async () => {
    wrapper = buildWrapper()
    ;(wrapper.vm as any).addTopic(0)
    await echo(wrapper)

    expect((wrapper.vm as any).groups[0].topics).to.have.lengthOf(2)
    expect(wrapper.findAll('.topic-row')).to.have.lengthOf(2)
  })

  it('emits the row once it has a topic', async () => {
    wrapper = buildWrapper(null)
    ;(wrapper.vm as any).addGroup()
    await echo(wrapper)
    ;(wrapper.vm as any).groups[0].topics[0].topic = 'app/A1/device/post'
    ;(wrapper.vm as any).groups[0].delayMs = 1000
    ;(wrapper.vm as any).emitChange()
    await echo(wrapper)

    expect(wrapper.emitted('change').pop()[0]).to.deep.equal([
      {
        id: (wrapper.vm as any).groups[0].id,
        delayMs: 1000,
        merge: true,
        enabled: true,
        topics: [{ topic: 'app/A1/device/post', qos: 0 }],
      },
    ])
  })

  it('emits the group with the chosen delay when a quick button is used', async () => {
    wrapper = buildWrapper()
    wrapper.findAll('.quick-delay').at(2).trigger('click')
    await echo(wrapper)

    expect(wrapper.emitted('change').pop()[0][0].delayMs).to.equal(1000)
  })

  it('takes over a value that the parent replaces, e.g. another preset', async () => {
    wrapper = buildWrapper()
    await wrapper.setProps({ value: [createGroup({ id: 'g9', topics: [{ topic: 'x/y', qos: 2 }] })] })

    expect((wrapper.vm as any).groups).to.have.lengthOf(1)
    expect((wrapper.vm as any).groups[0].id).to.equal('g9')
    expect(wrapper.findAll('.topic-row')).to.have.lengthOf(1)
  })

  it('keeps the group when its last topic is deleted', async () => {
    wrapper = buildWrapper()
    ;(wrapper.vm as any).removeTopic(0, 0)
    await echo(wrapper)

    // The group's delay/merge settings survive, and one empty row keeps it editable.
    expect((wrapper.vm as any).groups).to.have.lengthOf(1)
    expect((wrapper.vm as any).groups[0].topics).to.have.lengthOf(1)
    expect(wrapper.emitted('change').pop()[0]).to.deep.equal([])
  })
})
