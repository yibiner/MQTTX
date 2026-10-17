import { expect } from 'chai'
import { mount, createLocalVue } from '@vue/test-utils'
import ElementUI from 'element-ui'
import VariablesHelp from '@/components/VariablesHelp.vue'

const localVue = createLocalVue()
localVue.use(ElementUI)

describe('VariablesHelp.vue', () => {
  let wrapper: any

  const buildWrapper = (tooltip = '') =>
    mount(VariablesHelp, {
      localVue,
      mocks: { $t: (key: string) => key },
      propsData: { tooltip },
    })

  afterEach(() => {
    wrapper?.destroy()
    wrapper = undefined
    document.querySelectorAll('.el-dialog__wrapper, .el-dialog, .el-tooltip__popper').forEach((el) => el.remove())
  })

  it('renders a trigger without opening the dialog', () => {
    wrapper = buildWrapper()

    expect(wrapper.find('.variables-help-trigger').text()).to.equal('configs.variablesHelp')
    expect(wrapper.find('.variables-help-body').exists()).to.equal(false)
  })

  it('renders no question mark when no hover text is given', () => {
    wrapper = buildWrapper()

    expect(wrapper.find('.variables-help-icon').exists()).to.equal(false)
  })

  it('shows the hover text of the question mark', async () => {
    wrapper = buildWrapper('hover text')
    expect(wrapper.find('.variables-help-icon').exists()).to.equal(true)

    wrapper.find('.variables-help-icon').trigger('mouseenter')
    // element-ui opens a tooltip after its `open-delay`, the popper lives in the body
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(document.body.textContent).to.contain('hover text')
  })

  it('opens the reference with the scope, the built-ins, the rules and an example', async () => {
    wrapper = buildWrapper()

    wrapper.find('.variables-help-trigger').trigger('click')
    await wrapper.vm.$nextTick()

    // The dialog is appended to the body, so it is not part of the wrapper
    const text = document.body.textContent as string
    expect(text).to.contain('configs.variablesHelpScopeTitle')
    expect(text).to.contain('configs.variablesHelpScope')
    expect(text).to.contain('configs.variablesHelpBuiltinsTitle')
    expect(text).to.contain('configs.variablesHelpBuiltins')
    expect(text).to.contain('configs.variablesHelpRulesTitle')
    expect(text).to.contain('configs.variablesHelpRules')
    expect(text).to.contain('configs.variablesHelpExampleTitle')
    expect(text).to.contain('configs.variablesHelpExample')
  })
})
