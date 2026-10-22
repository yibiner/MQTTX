import { expect } from 'chai'
import { mount, createLocalVue } from '@vue/test-utils'
import ElementUI from 'element-ui'
import VariablesHelp from '@/components/VariablesHelp.vue'

const localVue = createLocalVue()
localVue.use(ElementUI)

describe('VariablesHelp.vue', () => {
  let wrapper: any

  const buildWrapper = () =>
    mount(VariablesHelp, {
      localVue,
      mocks: { $t: (key: string) => key },
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

  it('opens the reference with the scope, the variable guide, the definitions and the rules', async () => {
    wrapper = buildWrapper()

    wrapper.find('.variables-help-trigger').trigger('click')
    await wrapper.vm.$nextTick()

    // The dialog is appended to the body, so it is not part of the wrapper
    const text = document.body.textContent as string
    expect(text).to.contain('configs.variablesHelpScopeTitle')
    expect(text).to.contain('configs.variablesHelpScope')
    expect(text).to.contain('configs.variablesGuideTitle')
    expect(text).to.contain('configs.variablesGuideGroupBuiltin')
    expect(text).to.contain('configs.variablesHelpBuiltins')
    expect(text).to.contain('configs.variablesHelpDefinitionsTitle')
    expect(text).to.contain('configs.variablesHelpDefinitions')
    expect(text).to.contain('configs.variablesHelpStateTitle')
    expect(text).to.contain('configs.variablesHelpState')
    expect(text).to.contain('configs.variablesHelpResetTitle')
    expect(text).to.contain('configs.variablesHelpReset')
    expect(text).to.contain('configs.variablesHelpFormatTitle')
    expect(text).to.contain('configs.variablesHelpFormat')
    expect(text).to.contain('configs.variablesHelpLegacyTitle')
    expect(text).to.contain('configs.variablesHelpLegacy')
    expect(text).to.contain('configs.variablesHelpMigration')
    expect(text).to.contain('configs.variablesHelpRulesTitle')
    expect(text).to.contain('configs.variablesHelpRules')
    expect(text).to.contain('configs.variablesHelpExampleTitle')
    expect(text).to.contain('configs.variablesHelpExample')
  })
})
