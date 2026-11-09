import { expect } from 'chai'
import { mount, createLocalVue } from '@vue/test-utils'
import ConditionProbe from '@/components/ConditionProbe.vue'

const localVue = createLocalVue()
localVue.prototype.$t = (key: string, params?: { [name: string]: string }) => {
  if (!params) {
    return key
  }
  return `${key}:${params.field}=${params.literal}`
}

const stubs: { [name: string]: true } = {
  'el-input': true,
  'el-button': true,
  'el-checkbox': true,
}

const receivedTopic = 'app/SN0106/device/system/post'

const mountProbe = (expression: string, topic = 'app/SN0106/#') =>
  mount(ConditionProbe, {
    localVue,
    propsData: { expression, topic },
    stubs,
  })

describe('ConditionProbe.vue', () => {
  it('reports that a bare true misses a boolean and names the backtick form', () => {
    const wrapper = mountProbe("cmd == 'SET' && enabled == true")
    const vm = wrapper.vm as any
    vm.sampleTopic = receivedTopic
    vm.payload = '{"cmd":"SET","enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('no')
    expect(vm.hints[0]).to.equal('connections.conditionProbeBacktickHint:enabled=true')
    wrapper.destroy()
  })

  it('reports a trigger when the topic and a backtick boolean both match', () => {
    const wrapper = mountProbe('enabled == `true`')
    const vm = wrapper.vm as any
    vm.sampleTopic = receivedTopic
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('ok')
    expect(vm.hints).to.deep.equal([])
    wrapper.destroy()
  })

  it('waits for a received topic before calling a condition match a trigger', () => {
    const wrapper = mountProbe('enabled == `true`')
    const vm = wrapper.vm as any
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('ask')
    expect(vm.verdictText).to.equal('connections.conditionProbeNeedTopic')
    wrapper.destroy()
  })

  it('does not trigger when the received topic misses the filter', () => {
    const wrapper = mountProbe('enabled == `true`', 'app/other/#')
    const vm = wrapper.vm as any
    vm.sampleTopic = receivedTopic
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('no')
    expect(vm.hints[0]).to.equal('connections.conditionProbeTopicMissed')
    wrapper.destroy()
  })

  it('does not trigger when the match topic is empty', () => {
    const wrapper = mountProbe('enabled == `true`', '')
    const vm = wrapper.vm as any
    vm.sampleTopic = receivedTopic
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('no')
    expect(vm.hints[0]).to.equal('connections.conditionProbeTopicEmpty')
    wrapper.destroy()
  })

  it('says placeholders in the match topic are left as written', () => {
    const wrapper = mountProbe('enabled == `true`', 'app/${productType}/#')
    const vm = wrapper.vm as any
    vm.sampleTopic = receivedTopic
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('no')
    expect(vm.hints).to.include('connections.conditionProbeTopicVariable')
    wrapper.destroy()
  })

  it('judges only the condition when topic matching is turned off', async () => {
    const wrapper = mountProbe('enabled == `true`', 'app/${productType}/#')
    const vm = wrapper.vm as any
    vm.checkTopic = false
    vm.sampleTopic = receivedTopic
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('ok')
    expect(vm.verdictText).to.equal('connections.conditionProbeConditionMatched')
    expect(vm.hints).to.deep.equal([])
    vm.open = true
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('el-input-stub')).to.have.lengthOf(1)
    wrapper.destroy()
  })

  it('drops a topic miss after topic matching is turned off', async () => {
    const wrapper = mountProbe('enabled == `true`', 'app/${productType}/#')
    const vm = wrapper.vm as any
    vm.sampleTopic = receivedTopic
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('no')

    vm.checkTopic = false
    await wrapper.vm.$nextTick()
    expect(vm.verdict).to.equal('ok')
    expect(vm.verdictText).to.equal('connections.conditionProbeConditionMatched')
    wrapper.destroy()
  })

  it('retests when the payload or the sample topic changes', () => {
    const wrapper = mountProbe('enabled == `true`')
    const vm = wrapper.vm as any
    vm.sampleTopic = receivedTopic
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('ok')

    vm.payload = '{"enabled":false}'
    vm.rerun()
    expect(vm.verdict).to.equal('no')

    vm.payload = '{"enabled":true}'
    vm.sampleTopic = 'app/other/post'
    vm.rerun()
    expect(vm.verdict).to.equal('no')
    expect(vm.hints[0]).to.equal('connections.conditionProbeTopicMissed')
    wrapper.destroy()
  })

  it('retests when the condition or the topic filter changes', async () => {
    const wrapper = mountProbe('enabled == `true`')
    const vm = wrapper.vm as any
    vm.sampleTopic = receivedTopic
    vm.payload = '{"enabled":true}'
    vm.run()
    expect(vm.verdict).to.equal('ok')

    await wrapper.setProps({ expression: 'enabled == false' })
    expect(vm.verdict).to.equal('no')

    await wrapper.setProps({ expression: 'enabled == `true`', topic: 'app/other/#' })
    expect(vm.verdict).to.equal('no')
    expect(vm.hints[0]).to.equal('connections.conditionProbeTopicMissed')
    wrapper.destroy()
  })
})
