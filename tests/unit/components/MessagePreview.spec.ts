import { expect } from 'chai'
import Vue from 'vue'
import { createLocalVue, mount, Wrapper } from '@vue/test-utils'
import MessagePreview from '@/components/MessagePreview.vue'

const localVue = createLocalVue()

const createWrapper = (payload?: string): Wrapper<Vue> =>
  mount(MessagePreview, {
    localVue,
    propsData: { payload },
    mocks: {
      // The real app resolves the placeholder through vue-i18n; the key is enough here.
      $t: (key: string) => key,
    },
  })

describe('MessagePreview', () => {
  it('shows a formatted message on one line instead of its blank first line', () => {
    const wrapper = createWrapper('{\n    "cmd": "BINDING",\n    "ts": 0,\n    "nested": {\n        "a": 1\n    }\n}')

    expect(wrapper.text()).to.equal('{"cmd":"BINDING","ts":0,"nested":{"a":1}}')
    expect(wrapper.text()).to.not.contain('\n')
    expect(wrapper.classes()).to.not.contain('blank')
  })

  it('keeps a single line message untouched', () => {
    const wrapper = createWrapper('{"a":1}')

    expect(wrapper.text()).to.equal('{"a":1}')
    expect(wrapper.classes()).to.not.contain('blank')
  })

  it('shows a placeholder and marks the cell when the message has no visible content', () => {
    const wrapper = createWrapper('  \n\t\n ')

    expect(wrapper.text()).to.equal('configs.blankPayload')
    expect(wrapper.classes()).to.contain('blank')
  })

  it('shows the placeholder for a missing message', () => {
    const wrapper = createWrapper(undefined)

    expect(wrapper.text()).to.equal('configs.blankPayload')
    expect(wrapper.classes()).to.contain('blank')
  })
})
