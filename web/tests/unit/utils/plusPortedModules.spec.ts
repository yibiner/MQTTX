import { expect } from 'chai'
import { createPersistentStore } from '@/utils/persistentStore'
import {
  deleteMessagePreset,
  getGlobalVariables,
  getMessagePresets,
  saveGlobalVariable,
  saveGlobalVariables,
  saveMessagePreset,
} from '@/utils/configProfiles'
import { resolvePayloadVariables } from '@/utils/payloadVariables'
import { planConnectSubscriptions } from '@/utils/autoSubscribe'

/**
 * Covers the modules ported from the desktop build, running in the browser test environment.
 *
 * The port replaced `electron-store` (a JSON file) with a `localStorage` adapter; these tests
 * therefore also prove that the preset and variable storage still behaves the same way without
 * Electron around.
 */
describe('MQTTX Plus modules in the web build', () => {
  describe('persistent store adapter', () => {
    it('round-trips values as JSON, per namespace', () => {
      const store = createPersistentStore({ name: 'unit-test' })
      const other = createPersistentStore({ name: 'unit-test-other' })

      store.set('list', [{ id: 'a', nested: { n: 1 } }])
      store.set('flag', true)

      expect(store.get('list')).to.deep.equal([{ id: 'a', nested: { n: 1 } }])
      expect(store.get('flag')).to.equal(true)
      // A second namespace must not see the first one's keys.
      expect(other.has('list')).to.equal(false)
    })

    it('supports has / delete / clear and a default value', () => {
      const store = createPersistentStore({ name: 'unit-test-crud' })

      expect(store.get('missing', 'fallback')).to.equal('fallback')
      store.set('k', 1)
      expect(store.has('k')).to.equal(true)
      store.delete('k')
      expect(store.has('k')).to.equal(false)

      store.set('a', 1)
      store.clear()
      expect(store.has('a')).to.equal(false)
    })
  })

  describe('preset management', () => {
    it('saves, updates and deletes a message preset', () => {
      const created = saveMessagePreset({ name: '心跳', topic: 'app/dev/heart', payload: '{"a":1}' })
      expect(created.id).to.be.a('string')
      expect(getMessagePresets().some((item) => item.id === created.id)).to.equal(true)

      saveMessagePreset({ id: created.id, name: '心跳2', topic: 'app/dev/heart', payload: 'x' })
      expect(getMessagePresets().find((item) => item.id === created.id)?.name).to.equal('心跳2')

      deleteMessagePreset(created.id)
      expect(getMessagePresets().some((item) => item.id === created.id)).to.equal(false)
    })

    it('keeps global variables addressable by name', () => {
      saveGlobalVariables([])
      const saved = saveGlobalVariable({ name: 'productType', value: 'gateway' })

      expect(saved.id).to.be.a('string')
      expect(getGlobalVariables().find((item) => item.id === saved.id)?.value).to.equal('gateway')
    })
  })

  describe('template variables', () => {
    it('fills placeholders from the connection variables', () => {
      const resolved = resolvePayloadVariables('app/${productType}/dev/${clientId}/heart', {
        variables: { productType: 'gateway', clientId: 'dev-1' },
      })

      expect(resolved.text).to.equal('app/gateway/dev/dev-1/heart')
      expect(resolved.unresolved).to.deep.equal([])
    })

    it('reports placeholders it cannot resolve instead of leaving them half-resolved', () => {
      const resolved = resolvePayloadVariables('app/${unknownName}/x', { variables: {} })

      expect(resolved.text).to.equal('app/${unknownName}/x')
      expect(resolved.unresolved).to.deep.equal(['unknownName'])
    })

    it('leaves text without placeholders untouched', () => {
      expect(resolvePayloadVariables('plain/topic').text).to.equal('plain/topic')
    })
  })

  describe('automatic subscriptions', () => {
    it('plans one batch per group, with its own delay and resolved topics', () => {
      const plan = planConnectSubscriptions({
        rows: null,
        groups: [
          {
            id: 'g1',
            enabled: true,
            delayMs: 0,
            merge: true,
            topics: [{ topic: 'app/${clientId}/cmd', qos: 0 }],
          },
          {
            id: 'g2',
            enabled: true,
            delayMs: 2000,
            merge: false,
            topics: [{ topic: 'app/${clientId}/ota', qos: 1 }],
          },
        ] as AutoSubscribeGroupModel[],
        variables: { clientId: 'dev-7' },
        restoreManual: false,
      })

      expect(plan.batches).to.have.length(2)
      expect(plan.batches.every((batch) => batch.topics.every((item) => !item.topic.includes('${')))).to.equal(true)
      expect(plan.unresolved).to.deep.equal([])
    })

    it('skips a group whose topic still has an unresolved placeholder and reports it', () => {
      const plan = planConnectSubscriptions({
        rows: null,
        groups: [
          {
            id: 'g1',
            enabled: true,
            delayMs: 0,
            merge: false,
            topics: [{ topic: 'app/${nowhere}/cmd', qos: 0 }],
          },
        ] as AutoSubscribeGroupModel[],
        variables: {},
        restoreManual: false,
      })

      expect(plan.batches).to.have.length(0)
      expect(plan.unresolved).to.include('nowhere')
    })
  })
})
