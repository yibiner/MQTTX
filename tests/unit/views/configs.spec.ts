import { expect } from 'chai'
import Vue from 'vue'
import ElementUI from 'element-ui'
import { createLocalVue, shallowMount, Wrapper } from '@vue/test-utils'
import Configs from '@/views/configs/index.vue'
import MessagePreview from '@/components/MessagePreview.vue'
import { saveMessagePreset, deleteMessagePreset } from '@/utils/configProfiles'

const localVue = createLocalVue()
localVue.use(ElementUI)

let createdIds: string[] = []

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
})
