import { expect } from 'chai'
import {
  deleteClientProfile,
  deleteGlobalVariable,
  deleteMessagePreset,
  getGlobalVariables,
  saveClientProfile,
  saveGlobalVariable,
  saveMessagePreset,
} from '@/utils/configProfiles'
import {
  applyLegacyInlineMigration,
  migrateLegacyInlineVariables,
  normalizeVariableDefinition,
  readPayloadCounter,
  resetAllVariableStates,
  resetPayloadCounters,
  resolvePayloadVariables,
  scanLegacyInlineVariables,
  writePayloadCounter,
} from '@/utils/payloadVariables'
import type { LegacyMigrationSources } from '@/utils/payloadVariables'

/**
 * One-click migration of the legacy inline forms (`${count:3}` / `${rssi:-30..-60}`).
 *
 * The scanner is driven with injected sources, so the tests describe the templates they mean without
 * needing a database or the electron store. A second block runs the default sources through the
 * preset manager to make sure that wiring is not dead code.
 */

const clearGlobalVariables = (ids: string[]): void => {
  ids.forEach((id) => deleteGlobalVariable(id))
}

/** A fixtures set that covers all four scan sources and one conflicting name. */
const migrationSources = (): LegacyMigrationSources => ({
  getMessagePresets: () => [
    {
      id: 'message-1',
      name: 'counter',
      topic: 'app/${count:1}/post',
      payload: '{"n":${count:1}}',
    },
  ],
  getClientProfiles: () => [
    {
      id: 'client-1',
      alias: 'device',
      clientId: 'device',
      variables: { mode: '${mode:1}' },
      autoSubscriptions: [
        {
          id: 'group-1',
          delayMs: 0,
          merge: false,
          enabled: true,
          topics: [{ topic: 'sensor/${rssi:-30..-60}', qos: 0 }],
        },
      ],
      autoReplies: [
        {
          id: 'rule-1',
          name: 'reply',
          enabled: true,
          matchTopic: 'in/#',
          matchCondition: '',
          reply: {
            topic: 'out/${rssi:-60..-30}',
            mode: 'fixed',
            payload: '{"mode":${mode:2}}',
            qos: 0,
            retain: false,
            delayMs: 0,
          },
        },
      ],
    },
  ],
  getGlobalVariables: () => [
    { id: 'global-1', name: 'line', value: 'PLC-${globalSeq:7}' },
    {
      id: 'global-2',
      name: 'note',
      value: 'x',
      definition: { kind: 'session', generator: 'template', value: '${sessionPair:8}' },
    },
  ],
  listConnections: async () => [
    {
      id: 'connection-1',
      name: 'connection-1',
      clientId: 'connection-1',
      variables: { device: '${connSeq:9}' },
      autoSubscriptions: [
        {
          id: 'group-2',
          delayMs: 0,
          merge: false,
          enabled: true,
          topics: [{ topic: 'c/${connRange:1..3}', qos: 0 }],
        },
      ],
      autoReplies: [
        {
          id: 'rule-2',
          name: 'reply',
          enabled: true,
          matchTopic: 'd/#',
          matchCondition: '',
          reply: {
            topic: 'e/${connSeq:9}',
            mode: 'fixed',
            payload: '{"x":1}',
            qos: 0,
            retain: false,
            delayMs: 0,
          },
        },
      ],
    } as unknown as ConnectionModel,
  ],
})

describe('legacy inline migration: scan', () => {
  beforeEach(() => {
    resetPayloadCounters()
    resetAllVariableStates()
  })

  it('finds the counter and range forms of every source and groups them by name', async () => {
    const plan = await scanLegacyInlineVariables(migrationSources())

    expect(plan.conflicts).to.deep.equal([{ name: 'mode', configs: ['counter:1', 'counter:2'] }])
    expect(plan.definitions.map((definition) => definition.name)).to.deep.equal([
      'count',
      'rssi',
      'globalSeq',
      'sessionPair',
      'connSeq',
      'connRange',
    ])
    // Every non-empty template text of the fixtures was inspected: 2 message preset fields,
    // 5 client preset fields, 3 global variable fields and 5 connection fields.
    expect(plan.scanned).to.equal(15)
  })

  it('classifies a counter as a sequence definition and a range as a random definition', async () => {
    const plan = await scanLegacyInlineVariables(migrationSources())
    const byName = new Map(plan.definitions.map((definition) => [definition.name, definition]))

    expect(byName.get('count')?.stored).to.deep.equal({
      kind: 'sequence',
      initial: 1,
      step: 1,
      value: '1',
    })
    // `${rssi:-30..-60}` and `${rssi:-60..-30}` are the same range: sorted bounds, no conflict.
    expect(byName.get('rssi')?.stored).to.deep.equal({
      kind: 'random',
      min: -60,
      max: -30,
      value: '-60..-30',
    })
  })

  it('reports the persisted legacy counter of a migrated name at scan time', async () => {
    writePayloadCounter('count', 41)

    const plan = await scanLegacyInlineVariables(migrationSources())
    const count = plan.definitions.find((definition) => definition.name === 'count')

    expect(count?.legacyCounter).to.equal(41)
    expect(plan.definitions.find((definition) => definition.name === 'rssi')?.legacyCounter).to.equal(undefined)
  })

  it('skips names that already exist as a global variable', async () => {
    const plan = await scanLegacyInlineVariables({
      ...migrationSources(),
      getGlobalVariables: () => [{ id: 'existing', name: 'count', value: 'manual' }],
    })

    expect(plan.definitions.map((definition) => definition.name)).to.not.include('count')
    expect(plan.conflicts).to.deep.equal([{ name: 'mode', configs: ['counter:1', 'counter:2'] }])
  })

  it('does not propose a definition for a config the inline provider would not execute', async () => {
    const plan = await scanLegacyInlineVariables({
      getMessagePresets: () => [{ id: 'm', name: 'odd', topic: '${odd:2..x}/${negative:-5}/${plain}', payload: '' }],
      getClientProfiles: () => [],
      getGlobalVariables: () => [],
      listConnections: () => [],
    })

    expect(plan.definitions.map((definition) => definition.name)).to.deep.equal(['negative'])
    expect(plan.scanned).to.equal(1)
  })
})

describe('legacy inline migration: apply', () => {
  const createdGlobalIds: string[] = []

  beforeEach(() => {
    createdGlobalIds.length = 0
    resetPayloadCounters()
    resetAllVariableStates()
  })

  afterEach(() => {
    clearGlobalVariables(createdGlobalIds)
    createdGlobalIds.length = 0
    resetPayloadCounters()
    resetAllVariableStates()
  })

  const createdGlobals = (): GlobalVariableModel[] => {
    const all = getGlobalVariables()
    const known = new Set(createdGlobalIds)
    return all.filter((variable) => known.has(variable.id))
  }

  it('creates the global definitions and moves the legacy counter into the runtime state', async () => {
    writePayloadCounter('count', 41)
    const plan = await scanLegacyInlineVariables(migrationSources())
    const result = applyLegacyInlineMigration(plan)

    expect(result.created).to.deep.equal(['count', 'rssi', 'globalSeq', 'sessionPair', 'connSeq', 'connRange'])
    expect(result.migratedState).to.deep.equal(['count'])
    expect(result.skipped).to.deep.equal([])

    getGlobalVariables().forEach((variable) => {
      if (result.created.includes(variable.name)) {
        createdGlobalIds.push(variable.id)
      }
    })
    expect(createdGlobals().map((variable) => variable.name)).to.have.members(result.created)

    const count = createdGlobals().find((variable) => variable.name === 'count')!
    expect(count.value).to.equal('1')
    expect(count.definition).to.deep.equal({ kind: 'sequence', initial: 1, step: 1, value: '1' })

    // The persisted counter became the state of the migrated definition: 41 is the next value, and
    // the legacy counter is gone (the definition now owns the sequence).
    expect(readPayloadCounter('count')).to.equal(undefined)
    const definition = normalizeVariableDefinition('count', count.definition, {
      scope: 'global',
      globalId: count.id,
    })
    expect(resolvePayloadVariables('${count}', { definitions: { count: definition } }).text).to.equal('41')
    expect(resolvePayloadVariables('${count}', { definitions: { count: definition } }).text).to.equal('42')
  })

  it('leaves the conflict behind and creates nothing for it', async () => {
    const plan = await scanLegacyInlineVariables(migrationSources())
    const result = applyLegacyInlineMigration(plan)

    getGlobalVariables().forEach((variable) => {
      if (result.created.includes(variable.name)) {
        createdGlobalIds.push(variable.id)
      }
    })
    expect(result.created).to.not.include('mode')
    expect(createdGlobals().map((variable) => variable.name)).to.not.include('mode')
  })

  it('is idempotent: a second scan finds nothing and a second apply creates nothing', async () => {
    writePayloadCounter('count', 41)
    const firstPlan = await scanLegacyInlineVariables(migrationSources())
    const first = applyLegacyInlineMigration(firstPlan)
    getGlobalVariables().forEach((variable) => {
      if (first.created.includes(variable.name)) {
        createdGlobalIds.push(variable.id)
      }
    })

    // The templates still contain the legacy forms, but the definitions now take precedence, so the
    // scan has nothing to propose. The real preset store is used, because that is where the
    // definitions were just created.
    const secondPlan = await scanLegacyInlineVariables({
      ...migrationSources(),
      getGlobalVariables: getGlobalVariables,
    })
    expect(secondPlan.definitions).to.deep.equal([])
    // A conflict is not auto-resolved, so it stays visible on the next run.
    expect(secondPlan.conflicts).to.deep.equal([{ name: 'mode', configs: ['counter:1', 'counter:2'] }])
    // The created variables are scanned as template values of the global list as well.
    expect(secondPlan.scanned).to.be.at.least(firstPlan.scanned)

    const second = applyLegacyInlineMigration(secondPlan)
    expect(second).to.deep.equal({ created: [], migratedState: [], skipped: [] })

    // Applying the old plan again skips every existing definition and does not touch the state.
    const repeated = applyLegacyInlineMigration(firstPlan)
    expect(repeated.created).to.deep.equal([])
    expect(repeated.migratedState).to.deep.equal([])
    expect(repeated.skipped).to.have.members(first.created)

    const count = createdGlobals().find((variable) => variable.name === 'count')!
    const definition = normalizeVariableDefinition('count', count.definition, { scope: 'global', globalId: count.id })
    expect(resolvePayloadVariables('${count}', { definitions: { count: definition } }).text).to.equal('41')
  })

  it('does not overwrite an existing global variable and leaves its value alone', async () => {
    const existing = saveGlobalVariable({ name: 'count', value: 'manual' })
    createdGlobalIds.push(existing.id)

    const plan = await scanLegacyInlineVariables(migrationSources())
    const result = applyLegacyInlineMigration(plan)

    findCreated(createdGlobalIds, result.created)
    expect(result.created).to.not.include('count')
    // The apply step also reads the global variables list, so it skips the existing name.
    expect(result.skipped).to.deep.equal(['count'])
    const stored = getGlobalVariables().find((variable) => variable.name === 'count')!
    expect(stored.id).to.equal(existing.id)
    expect(stored.value).to.equal('manual')
    expect(stored.definition).to.equal(undefined)
  })

  it('offers a single-shot migration helper', async () => {
    writePayloadCounter('count', 3)
    const { plan, result } = await migrateLegacyInlineVariables({
      getMessagePresets: () => [{ id: 'm', name: 'only', topic: '${count:1}', payload: '' }],
      getClientProfiles: () => [],
      getGlobalVariables: () => [],
      listConnections: () => [],
    })

    expect(plan.definitions.map((definition) => definition.name)).to.deep.equal(['count'])
    expect(result.created).to.deep.equal(['count'])
    expect(result.migratedState).to.deep.equal(['count'])
    getGlobalVariables().forEach((variable) => {
      if (result.created.includes(variable.name)) {
        createdGlobalIds.push(variable.id)
      }
    })
  })

  function findCreated(ids: string[], names: string[]): void {
    getGlobalVariables().forEach((variable) => {
      if (names.includes(variable.name) && !ids.includes(variable.id)) {
        ids.push(variable.id)
      }
    })
  }
})

describe('legacy inline migration: default preset sources', () => {
  const presetIds: string[] = []
  const profileIds: string[] = []
  const globalIds: string[] = []

  afterEach(() => {
    presetIds.splice(0).forEach((id) => deleteMessagePreset(id))
    profileIds.splice(0).forEach((id) => deleteClientProfile(id))
    globalIds.splice(0).forEach((id) => deleteGlobalVariable(id))
    resetPayloadCounters()
    resetAllVariableStates()
  })

  it('scans the message presets, client presets and global variables of the preset manager', async () => {
    presetIds.push(saveMessagePreset({ name: 'preset', topic: 'a/${presetCount:1}', payload: '' }).id)
    profileIds.push(
      saveClientProfile({
        alias: 'profile',
        clientId: 'profile',
        variables: { clientVar: '${clientCount:2}' },
      }).id,
    )
    globalIds.push(saveGlobalVariable({ name: 'line', value: 'app/${globalVar:3}' }).id)

    // The connection source is injected to keep the preset store test independent of the database.
    const plan = await scanLegacyInlineVariables({ listConnections: () => [] })

    expect(plan.definitions.map((definition) => definition.name)).to.deep.equal([
      'presetCount',
      'clientCount',
      'globalVar',
    ])
    expect(plan.scanned).to.equal(3)
  })
})

describe('migration writes', () => {
  it('creates all migrated definitions with one batch write', () => {
    const batches: number[] = []
    const plan = {
      scanned: 2,
      conflicts: [],
      definitions: [
        { name: 'alpha', stored: { kind: 'sequence' as const, initial: 5, step: 1, value: '5' } },
        { name: 'beta', stored: { kind: 'random' as const, min: -5, max: 5, value: '-5..5' } },
      ],
    }
    const result = applyLegacyInlineMigration(plan, {
      getGlobalVariables: () => [],
      saveGlobalVariables: (variables) => {
        batches.push(variables.length)
        return variables.map((variable, index) => ({ ...variable, id: `batch-${index}` }))
      },
    })

    expect(batches).to.deep.equal([2])
    expect(result.created).to.deep.equal(['alpha', 'beta'])
    expect(result.skipped).to.deep.equal([])
  })
})
