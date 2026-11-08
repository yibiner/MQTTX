import { expect } from 'chai'
import { findUnresolvedForPublish, resolveForPublish } from '@/utils/publishVariables'

const createConnection = (variables: { [name: string]: StoredVariable } = {}): ConnectionModel =>
  ({
    id: 'conn-publish',
    clientId: 'dev-1',
    name: 'dev',
    host: '127.0.0.1',
    port: 8083,
    protocol: 'ws',
    mqttVersion: '3.1.1',
    subscriptions: [],
    variables,
  } as unknown as ConnectionModel)

describe('publish variables (web build)', () => {
  describe('unresolved detection', () => {
    it('reports nothing when every placeholder can be resolved', () => {
      const connection = createConnection({ productType: 'gateway' })
      const unresolved = findUnresolvedForPublish(connection, {
        topic: 'app/${productType}/${clientId}/post',
        payload: '{"id":"${clientId}"}',
        type: 'JSON',
      })

      expect(unresolved).to.deep.equal([])
    })

    it('reports a placeholder that has no value', () => {
      const unresolved = findUnresolvedForPublish(createConnection(), {
        topic: 'app/${nowhere}/post',
        payload: '',
        type: 'JSON',
      })

      expect(unresolved).to.deep.equal(['nowhere'])
    })

    it('ignores the payload of a payload type that is not a template', () => {
      const connection = createConnection()
      const unresolved = findUnresolvedForPublish(connection, {
        topic: 'app/dev/post',
        payload: 'AB${notAVariable}CD',
        type: 'Hex',
      })

      expect(unresolved).to.deep.equal([])
    })

    it('does not advance a counter while checking', () => {
      const connection = createConnection({
        counter: { kind: 'sequence', initial: 1, step: 1 } as VariableDefinitionConfig,
      })
      const texts = { topic: 'app/dev/${counter}', payload: '', type: 'Plaintext' } as const

      const first = findUnresolvedForPublish(connection, texts)
      const second = findUnresolvedForPublish(connection, texts)

      expect(first).to.deep.equal([])
      expect(second).to.deep.equal([])
    })
  })

  describe('resolution', () => {
    it('fills topic and payload from connection variables', () => {
      const connection = createConnection({ productType: 'gateway' })
      const resolved = resolveForPublish(connection, {
        topic: 'app/${productType}/${clientId}/post',
        payload: '{"product":"${productType}"}',
        type: 'JSON',
      })

      expect(resolved.topic).to.equal('app/gateway/dev-1/post')
      expect(resolved.payload).to.equal('{"product":"gateway"}')
    })

    it('returns the texts untouched when they contain no placeholder', () => {
      const resolved = resolveForPublish(createConnection(), {
        topic: 'app/dev/plain',
        payload: 'plain payload',
        type: 'Plaintext',
      })

      expect(resolved.topic).to.equal('app/dev/plain')
      expect(resolved.payload).to.equal('plain payload')
    })

    it('leaves a hex payload alone even when it looks templated', () => {
      const resolved = resolveForPublish(createConnection({ x: 'y' }), {
        topic: 'app/dev/${x}',
        payload: 'ZZ${x}ZZ',
        type: 'Hex',
      })

      expect(resolved.topic).to.equal('app/dev/y')
      expect(resolved.payload).to.equal('ZZ${x}ZZ')
    })

    it('advances a counter once per message even when it is used twice', () => {
      const connection = createConnection({
        counter: { kind: 'sequence', initial: 1, step: 1 } as VariableDefinitionConfig,
      })

      const first = resolveForPublish(connection, {
        topic: 'app/dev/${counter}',
        payload: '{"n":"${counter}"}',
        type: 'JSON',
      })
      const second = resolveForPublish(connection, {
        topic: 'app/dev/${counter}',
        payload: '{"n":"${counter}"}',
        type: 'JSON',
      })

      // One value per message: the topic and the payload agree, and the next message is one higher.
      // The quotes around a numeric placeholder are dropped on purpose, so a JSON number keeps its
      // type instead of becoming the string "1" (see the quote handling in variables/resolver.ts).
      expect(first.topic).to.equal('app/dev/1')
      expect(first.payload).to.equal('{"n":1}')
      expect(second.topic).to.equal('app/dev/2')
      expect(second.payload).to.equal('{"n":2}')
    })

    it('keeps an unresolved placeholder as written instead of dropping it', () => {
      const resolved = resolveForPublish(createConnection(), {
        topic: 'app/${missing}/post',
        payload: '',
        type: 'Plaintext',
      })

      expect(resolved.topic).to.equal('app/${missing}/post')
    })
  })
})
