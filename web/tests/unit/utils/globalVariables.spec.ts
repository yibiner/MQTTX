import { expect } from 'chai'
import { deleteGlobalVariable, getGlobalVariables, saveGlobalVariable } from '@/utils/configProfiles'
import { normalizeGlobalVariables } from '@/utils/payloadVariables'

/**
 * Covers the stateful form of a global variable.
 *
 * The preset page used to edit only `name` + `value`, which silently turned a counter or a random
 * variable into a constant as soon as somebody renamed it. These tests pin the round trip:
 * a definition written through `saveGlobalVariable` has to come back unchanged, and a constant has
 * to stay a plain string.
 */
describe('global variables with a definition (web build)', () => {
  afterEach(() => {
    getGlobalVariables().forEach((variable) => deleteGlobalVariable(variable.id))
  })

  it('keeps a stateful definition through save and read', () => {
    const saved = saveGlobalVariable({
      name: 'counter',
      value: '100',
      definition: { kind: 'sequence', initial: 100, step: -20, min: 0 } as VariableDefinitionConfig,
    })

    const read = getGlobalVariables().find((item) => item.id === saved.id)
    expect(read?.definition).to.deep.equal({ kind: 'sequence', initial: 100, step: -20, min: 0 })
  })

  it('resolves the stored definition into a sequence variable', () => {
    saveGlobalVariable({
      name: 'counter',
      value: '',
      definition: { kind: 'sequence', initial: 5, step: 1 } as VariableDefinitionConfig,
    })

    const definition = normalizeGlobalVariables(getGlobalVariables()).counter

    expect(definition.kind).to.equal('sequence')
    expect(definition.initial).to.equal(5)
    expect(definition.step).to.equal(1)
  })

  it('keeps a constant a plain string, without a leftover definition', () => {
    const saved = saveGlobalVariable({ name: 'productType', value: 'gateway', definition: undefined })

    const read = getGlobalVariables().find((item) => item.id === saved.id)
    expect(read?.value).to.equal('gateway')
    expect(read?.definition).to.equal(undefined)
    expect(normalizeGlobalVariables(getGlobalVariables()).productType.kind).to.equal('constant')
  })

  it('replaces the definition when a stateful variable becomes a constant', () => {
    const saved = saveGlobalVariable({
      name: 'mode',
      value: '',
      definition: { kind: 'random', min: 1, max: 6 } as VariableDefinitionConfig,
    })

    saveGlobalVariable({ id: saved.id, name: 'mode', value: 'fixed', definition: undefined })

    const read = getGlobalVariables().find((item) => item.id === saved.id)
    expect(read?.value).to.equal('fixed')
    expect(read?.definition).to.equal(undefined)
  })
})
