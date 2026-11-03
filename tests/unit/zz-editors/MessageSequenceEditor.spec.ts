import { expect } from 'chai'
import { mount, createLocalVue } from '@vue/test-utils'
import MessageSequenceEditor from '@/components/MessageSequenceEditor.vue'
import { createOtaSequence, createWaterCycleSequence, waterVariableDefinition } from '@/utils/messageSequenceExamples'

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

describe('MessageSequenceEditor.vue', () => {
  let wrapper: any

  const buildWrapper = (value: MessageSequenceModel[] | null = null, extra: { [key: string]: unknown } = {}) =>
    mount(MessageSequenceEditor, {
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

  it('keeps a sequence the user just added when the parent echoes the value back', async () => {
    wrapper = buildWrapper(null)
    expect(wrapper.findAll('.sequence-card')).to.have.lengthOf(0)
    ;(wrapper.vm as any).addSequence()
    await echo(wrapper)
    expect(wrapper.findAll('.sequence-card')).to.have.lengthOf(1)
  })

  it('inserts a sequence preset and asks for the variables it needs', async () => {
    const sequence = createWaterCycleSequence()
    const preset: MessageSequencePresetModel = {
      id: 'water',
      name: sequence.name,
      sequence,
      variables: { water: waterVariableDefinition() },
    }
    wrapper = buildWrapper(null, { templates: [preset] })
    ;(wrapper.vm as any).insertTemplate(preset)
    await wrapper.vm.$nextTick()

    const sequences = wrapper.emitted('change').pop()[0] as MessageSequenceModel[]
    expect(sequences).to.have.lengthOf(1)
    expect(sequences[0].id).to.not.equal(sequence.id)
    expect(sequences[0].name).to.equal('水量循环')
    expect(sequences[0].trigger).to.equal('connect')
    expect(sequences[0].loop).to.equal(true)
    expect(sequences[0].stopWhen).to.deep.equal({ variable: 'water', op: 'lt', value: 500 })
    expect(sequences[0].steps.map((item) => item.delayMs)).to.deep.equal([0, 60000, 300000, 300000])

    const example = wrapper.emitted('example').pop()[0]
    expect(example.variables.water).to.deep.equal({ kind: 'captured', value: '2000', resetOn: [] })
  })

  it('inserts an OTA preset without asking for variables', async () => {
    const sequence = createOtaSequence()
    const preset: MessageSequencePresetModel = { id: 'ota', name: sequence.name, sequence }
    wrapper = buildWrapper(null, { templates: [preset] })
    ;(wrapper.vm as any).insertTemplate(preset)
    const sequences = wrapper.emitted('change').pop()[0] as MessageSequenceModel[]
    expect(sequences[0].name).to.equal('OTA 进度')
    expect(sequences[0].trigger).to.equal('message')
    expect(sequences[0].steps).to.have.lengthOf(8)
    expect(wrapper.emitted('example')).to.equal(undefined)
  })

  it('summarises each sequence preset so similar names can be told apart', () => {
    const water = createWaterCycleSequence()
    const preset: MessageSequencePresetModel = { id: 'water', name: water.name, sequence: water }
    wrapper = buildWrapper(null, { templates: [preset] })
    const options = (wrapper.vm as any).presetOptions
    expect(options).to.have.lengthOf(1)
    expect(options[0].name).to.equal('水量循环')
    expect(options[0].summary).to.contain('connections.messageSequenceTriggerConnect')
    expect(options[0].summary).to.contain('4')
    expect(options[0].summary).to.contain('connections.messageSequenceLoop')
  })

  it('inserts a preset picked by id and ignores an unknown one', () => {
    const sequence = createOtaSequence()
    const preset: MessageSequencePresetModel = { id: 'ota', name: sequence.name, sequence }
    wrapper = buildWrapper(null, { templates: [preset] })
    ;(wrapper.vm as any).insertTemplateById('missing')
    expect(wrapper.emitted('change')).to.equal(undefined)
    ;(wrapper.vm as any).insertTemplateById('ota')
    const sequences = wrapper.emitted('change').pop()[0] as MessageSequenceModel[]
    expect(sequences).to.have.lengthOf(1)
    expect(sequences[0].name).to.equal('OTA 进度')
  })

  it('fills a step from a message preset and leaves its schedule', () => {
    const value: MessageSequenceModel[] = [
      {
        id: 'seq-fill',
        name: 'fill me',
        enabled: true,
        trigger: 'manual',
        matchTopic: '',
        matchCondition: '',
        loop: false,
        steps: [
          {
            id: 's0',
            delayMs: 5000,
            topic: 'old/topic',
            payload: 'old',
            qos: 1,
            retain: true,
            actions: { setVariables: [{ name: 'water', value: '${water - 20}' }] },
          },
        ],
      },
    ]
    wrapper = buildWrapper(value)
    wrapper.setData({
      messagePresets: [
        {
          id: 'm1',
          name: 'water report',
          topic: 'device/${clientId}/water',
          payload: '{"remaining":${water}}',
        },
      ],
    })
    const step = (wrapper.vm as any).sequences[0].steps[0]
    ;(wrapper.vm as any).applyMessagePreset(step, 'missing')
    expect(wrapper.emitted('change')).to.equal(undefined)

    ;(wrapper.vm as any).applyMessagePreset(step, 'm1')
    const saved = (wrapper.emitted('change').pop()[0] as MessageSequenceModel[])[0].steps[0]
    expect(saved.topic).to.equal('device/${clientId}/water')
    expect(saved.payload).to.equal('{"remaining":${water}}')
    expect(saved.delayMs).to.equal(5000)
    expect(saved.qos).to.equal(1)
    expect(saved.retain).to.equal(true)
    expect(saved.actions && saved.actions.setVariables).to.deep.equal([{ name: 'water', value: '${water - 20}' }])
  })

  it('lets a topic preset replace only the topic of a step', () => {
    const value: MessageSequenceModel[] = [
      {
        id: 'seq-topic',
        name: 'topic only',
        enabled: true,
        trigger: 'manual',
        matchTopic: '',
        matchCondition: '',
        loop: false,
        steps: [{ id: 's0', delayMs: 0, topic: 'old/topic', payload: '{"n":1}', qos: 0, retain: false }],
      },
    ]
    wrapper = buildWrapper(value)
    const step = (wrapper.vm as any).sequences[0].steps[0]
    ;(wrapper.vm as any).applyStepTopic(step, 'app/${clientId}/state')
    const saved = (wrapper.emitted('change').pop()[0] as MessageSequenceModel[])[0].steps[0]
    expect(saved.topic).to.equal('app/${clientId}/state')
    expect(saved.payload).to.equal('{"n":1}')
  })

  it('emits run for a sequence that has a topic while the connection is up', () => {
    const value: MessageSequenceModel[] = [
      {
        id: 'seq-run',
        name: 'run me',
        enabled: true,
        trigger: 'manual',
        matchTopic: '',
        matchCondition: '',
        loop: false,
        steps: [{ id: 's0', delayMs: 0, topic: 'device/report', payload: '1', qos: 0, retain: false }],
      },
    ]
    wrapper = buildWrapper(value, { canRun: true, runningIds: [] })
    ;(wrapper.vm as any).requestRun(value[0])
    expect(wrapper.emitted('run').pop()[0]).to.equal('seq-run')
  })
})
