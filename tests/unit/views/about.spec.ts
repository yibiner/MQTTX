import { expect } from 'chai'
import Vue from 'vue'
import Vuex from 'vuex'
import { createLocalVue, mount, Wrapper } from '@vue/test-utils'
import About from '@/views/about/index.vue'
import version from '@/version'
import { APP_NAME } from '@/appIdentity'

const { ipcRenderer } = require('electron')

const RESOURCE_PATHS = {
  data: '/mock/path',
  database: '/mock/path/MQTTX.db',
  config: '/mock/path/config.json',
  logs: '/mock/path/logs',
}

const localVue = createLocalVue()
localVue.use(Vuex)
// The clipboard directive is registered globally by the app (vue-clipboard2), not needed here.
localVue.directive('clipboard', {})

const originalInvoke = ipcRenderer.invoke

const createWrapper = (): Wrapper<Vue> =>
  mount(About, {
    localVue,
    store: new Vuex.Store({
      getters: {
        currentTheme: () => 'dark',
        currentLang: () => 'en',
      },
    }),
    mocks: {
      $t: (key: string) => key,
      $log: { error: () => undefined },
      $message: { error: () => undefined },
    },
  })

describe('about view', () => {
  let wrapper: Wrapper<Vue>

  beforeEach(async () => {
    ipcRenderer.invoke = () => Promise.resolve(RESOURCE_PATHS)
    wrapper = createWrapper()
    // `created()` asks the main process for the paths.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Vue.nextTick()
  })

  afterEach(() => {
    ipcRenderer.invoke = originalInvoke
    wrapper.destroy()
  })

  it('shows the name, the description and the running version', () => {
    const text = wrapper.text()

    expect(text).to.contain(APP_NAME)
    expect(text).to.contain('about.mqttxDesc')
    expect(text).to.contain(`v${version}`)
  })

  it('lists the local resources with the paths the main process reports', () => {
    expect(wrapper.findAll('.resource-item').length).to.equal(Object.keys(RESOURCE_PATHS).length)
    Object.values(RESOURCE_PATHS).forEach((resourcePath) => {
      expect(wrapper.text()).to.contain(resourcePath)
    })
  })

  it('links to no external page', () => {
    const hrefs = wrapper.findAll('a').wrappers.map((link) => link.attributes('href') || '')

    hrefs.forEach((href) => {
      expect(href.startsWith('http')).to.equal(false)
      expect(href.startsWith('//')).to.equal(false)
    })
    // No new-window links, no window.open and no external URL anywhere in the markup.
    expect(wrapper.html()).to.not.contain('target="_blank"')
    expect(wrapper.html()).to.not.match(/https?:\/\//)
  })
})
