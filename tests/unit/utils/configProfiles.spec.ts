import { expect } from 'chai'
import {
  deleteClientProfile,
  getClientProfile,
  getClientProfiles,
  saveClientProfile,
  deleteGlobalVariable,
  getGlobalVariable,
  getGlobalVariableMap,
  getGlobalVariables,
  getGlobalVariablesRevision,
  saveGlobalVariable,
  saveGlobalVariables,
} from '@/utils/configProfiles'
import { resolvePayloadVariables } from '@/utils/payloadVariables'

describe('configProfiles client presets', () => {
  let createdIds: string[] = []

  afterEach(() => {
    createdIds.forEach((id) => deleteClientProfile(id))
    createdIds = []
  })

  it('keeps the variables of a client preset', () => {
    const saved = saveClientProfile({ alias: 'sn0106', clientId: 'sn0106-1', variables: { productType: 'A1' } })
    createdIds.push(saved.id)

    expect(getClientProfile(saved.id)?.variables).to.deep.equal({ productType: 'A1' })

    saveClientProfile({ ...saved, variables: { productType: 'A2', site: 'north' } })
    expect(getClientProfiles().filter((profile) => profile.id === saved.id)).to.have.lengthOf(1)
    expect(getClientProfile(saved.id)?.variables).to.deep.equal({ productType: 'A2', site: 'north' })
  })
})

// Outside Electron the variables live in memory (see getStore), which is what these tests use.
describe('configProfiles global variables', () => {
  let createdIds: string[] = []

  afterEach(() => {
    createdIds.forEach((id) => deleteGlobalVariable(id))
    createdIds = []
  })

  const add = (name: string, value: string): string => {
    const saved = saveGlobalVariable({ name, value })
    createdIds.push(saved.id)
    return saved.id
  }

  it('saves, updates and deletes a variable', () => {
    const id = add('sn', 'SN0400')
    expect(getGlobalVariable(id)).to.deep.include({ id, name: 'sn', value: 'SN0400' })

    saveGlobalVariable({ id, name: 'sn', value: 'SN0402' })
    expect(getGlobalVariables().filter((variable) => variable.id === id)).to.have.lengthOf(1)
    expect(getGlobalVariable(id)?.value).to.equal('SN0402')

    deleteGlobalVariable(id)
    expect(getGlobalVariable(id)).to.equal(undefined)
    createdIds = createdIds.filter((created) => created !== id)
  })

  it('exposes the variables as a name/value map', () => {
    add('sn', 'SN0400')
    add('prefix', 'app')

    const map = getGlobalVariableMap()
    expect(map.sn).to.equal('SN0400')
    expect(map.prefix).to.equal('app')
  })

  it('ignores a variable without a name and keeps the first definition of a duplicated name', () => {
    add('', 'ignored')
    const older = saveGlobalVariable({ name: 'dup', value: 'older' })
    createdIds.push(older.id)
    add('dup', 'newer')

    const map = getGlobalVariableMap()
    expect(map['']).to.equal(undefined)
    // The list is newest first, so the row shown on top wins.
    expect(map.dup).to.equal('newer')
  })

  it('is what the payload resolver consumes', () => {
    add('sn', 'SN0400')

    const result = resolvePayloadVariables('{"sn":"${sn}","missing":"${nope}"}', {
      variables: getGlobalVariableMap(),
    })
    expect(result.text).to.equal('{"sn":"SN0400","missing":"${nope}"}')
    expect(result.unresolved).to.deep.equal(['nope'])
  })
})

describe('configProfiles list cache', () => {
  it('returns an edit immediately: a local write refreshes the cached list', () => {
    // The lists are cached per process now (`conf` re-reads config.json on every `get()`), so a
    // save, an update and a delete all have to be visible on the very next read.
    const saved = saveClientProfile({ alias: 'cached', clientId: 'cached-1', variables: { a: '1' } })
    expect(getClientProfile(saved.id)?.alias).to.equal('cached')

    saveClientProfile({ ...saved, alias: 'cached-renamed' })
    expect(getClientProfile(saved.id)?.alias).to.equal('cached-renamed')

    deleteClientProfile(saved.id)
    expect(getClientProfile(saved.id)).to.equal(undefined)
  })

  it('serves the hot path, the global variable map, from the cached list', () => {
    // getGlobalVariableMap() runs once per received message, so it must not reach the store again.
    const saved = saveGlobalVariable({ name: 'cachedVar', value: 'v1' })
    expect(getGlobalVariableMap().cachedVar).to.equal('v1')

    saveGlobalVariable({ ...saved, value: 'v2' })
    expect(getGlobalVariableMap().cachedVar).to.equal('v2')
    deleteGlobalVariable(saved.id)
    expect(getGlobalVariableMap().cachedVar).to.equal(undefined)
  })
})

describe('configProfiles global variable batch and revision', () => {
  it('creates a batch with one write and one revision bump', () => {
    const before = getGlobalVariablesRevision()
    const saved = saveGlobalVariables([
      { name: 'batchAlpha', value: '1' },
      { name: 'batchBeta', value: '2' },
    ])
    try {
      expect(saved).to.have.lengthOf(2)
      expect(saved.map((variable) => variable.name)).to.deep.equal(['batchAlpha', 'batchBeta'])
      expect(saved.every((variable) => Boolean(variable.id))).to.equal(true)
      expect(getGlobalVariablesRevision()).to.equal(before + 1)
      expect(
        getGlobalVariables()
          .slice(0, 2)
          .map((variable) => variable.name),
      ).to.deep.equal(['batchAlpha', 'batchBeta'])
    } finally {
      saved.forEach((variable) => deleteGlobalVariable(variable.id))
    }
  })

  it('bumps the revision on an edit and a delete', () => {
    const saved = saveGlobalVariable({ name: 'revisionVar', value: '1' })
    const afterSave = getGlobalVariablesRevision()
    saveGlobalVariable({ id: saved.id, name: 'revisionVar', value: '2' })
    const afterEdit = getGlobalVariablesRevision()
    deleteGlobalVariable(saved.id)
    const afterDelete = getGlobalVariablesRevision()

    expect(afterEdit).to.equal(afterSave + 1)
    expect(afterDelete).to.equal(afterEdit + 1)
  })
})
