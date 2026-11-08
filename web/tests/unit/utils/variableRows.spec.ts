import { expect } from 'chai'
import { rowsToVariables, variablesToRows, VariableEditorRow } from '@/utils/variableRows'

const row = (overrides: Partial<VariableEditorRow> = {}): VariableEditorRow => ({
  name: '',
  kind: 'constant',
  value: '',
  initial: 0,
  step: 1,
  min: 0,
  max: 0,
  ...overrides,
})

describe('variable rows (web build)', () => {
  describe('reading the stored map', () => {
    it('turns constants and sequences into rows', () => {
      const rows = variablesToRows({
        productType: 'gateway',
        counter: { kind: 'sequence', initial: 10, step: -1 } as VariableDefinitionConfig,
      })

      expect(rows).to.have.length(2)
      const constant = rows.find((item) => item.name === 'productType')
      expect(constant?.kind).to.equal('constant')
      expect(constant?.value).to.equal('gateway')

      const sequence = rows.find((item) => item.name === 'counter')
      expect(sequence?.kind).to.equal('sequence')
      expect(sequence?.initial).to.equal(10)
      expect(sequence?.step).to.equal(-1)
    })

    it('handles a connection without variables', () => {
      expect(variablesToRows(undefined)).to.deep.equal([])
      expect(variablesToRows(null)).to.deep.equal([])
    })
  })

  describe('writing the map back', () => {
    it('saves constants as plain strings and sequences as definitions', () => {
      const { variables, issues } = rowsToVariables([
        row({ name: 'productType', value: 'gateway' }),
        row({ name: 'counter', kind: 'sequence', initial: 5, step: -1 }),
      ])

      expect(variables.productType).to.equal('gateway')
      expect(variables.counter).to.deep.equal({ kind: 'sequence', initial: 5, step: -1 })
      expect(issues).to.deep.equal([])
    })

    it('drops a row without a name instead of saving an empty key', () => {
      const { variables } = rowsToVariables([row({ name: '   ' }), row({ name: 'ok', value: 'v' })])

      expect(Object.keys(variables)).to.deep.equal(['ok'])
    })

    it('refuses reserved and invalid names, and reports them', () => {
      const { variables, issues } = rowsToVariables([
        row({ name: 'uuid', value: 'shadow' }),
        row({ name: '1abc', value: 'x' }),
        row({ name: 'good', value: 'y' }),
      ])

      expect(Object.keys(variables)).to.deep.equal(['good'])
      expect(issues.map((item) => item.issue)).to.deep.equal(['reserved', 'invalid'])
      // `clientId` is a connection field, not a reserved built-in: a user may define it deliberately.
    })

    it('refuses duplicate names and keeps the first one', () => {
      const { variables, issues } = rowsToVariables([
        row({ name: 'dup', value: 'first' }),
        row({ name: 'dup', value: 'second' }),
      ])

      expect(variables.dup).to.equal('first')
      expect(issues).to.have.length(1)
      expect(issues[0].issue).to.equal('duplicate')
    })

    it('shows a captured variable as locked and writes only its fallback value', () => {
      const stored = {
        water: { kind: 'captured', value: '2000', resetOn: [] } as VariableDefinitionConfig,
      } as { [name: string]: StoredVariable }
      const shown = variablesToRows(stored)[0]

      expect(shown.locked).to.equal(true)
      expect(shown.lockedKind).to.equal('captured')
      expect(shown.value).to.equal('2000')

      const { variables } = rowsToVariables(
        [row({ ...shown, value: '1500', kind: 'sequence' })],
        stored,
      )

      expect(variables.water).to.deep.equal({ kind: 'captured', value: '1500', resetOn: [] })
    })

    it('keeps a locked random definition when the displayed value changes', () => {
      const previous = {
        lucky: { kind: 'random', min: 1, max: 6 } as VariableDefinitionConfig,
      } as { [name: string]: StoredVariable }
      const shown = variablesToRows(previous)[0]

      const { variables } = rowsToVariables([row({ ...shown, value: 'unused', kind: 'sequence' })], previous)

      expect(variables.lucky).to.deep.equal({ kind: 'random', min: 1, max: 6 })
    })

    it('keeps a definition the editor does not offer to edit', () => {
      const previous = {
        lucky: { kind: 'random', min: 1, max: 6 } as VariableDefinitionConfig,
      } as { [name: string]: StoredVariable }

      const { variables } = rowsToVariables([row({ name: 'lucky', value: 'unused' })], previous)

      expect(variables.lucky).to.deep.equal({ kind: 'random', min: 1, max: 6 })
    })

    it('leaves a stateful definition untouched when it is saved as a constant row', () => {
      const previous = {
        counter: { kind: 'sequence', initial: 3, step: 2, max: 9 } as VariableDefinitionConfig,
      } as { [name: string]: StoredVariable }

      const { variables } = rowsToVariables([row({ name: 'counter', kind: 'sequence', initial: 3, step: 2 })], previous)

      // Saved from the sequence editor: the fields it shows are written, the rest stays.
      expect(variables.counter).to.deep.equal({ kind: 'sequence', initial: 3, step: 2 })
    })
  })
})
