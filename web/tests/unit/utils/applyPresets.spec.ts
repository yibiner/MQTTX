import { expect } from 'chai'
import {
  applyClientProfileToRecord,
  applyServerProfileToRecord,
  clientProfileFromRecord,
  serverProfileFromRecord,
} from '@/utils/applyPresets'

const createRecord = (overrides: Partial<ConnectionModel> = {}): ConnectionModel =>
  ({
    id: 'conn-preset',
    clientId: 'dev-1',
    name: 'dev',
    host: 'old.example.com',
    port: 8083,
    protocol: 'ws',
    mqttVersion: '3.1.1',
    subscriptions: [],
    username: '',
    password: '',
    keepalive: 60,
    connectTimeout: 10,
    reconnect: true,
    reconnectPeriod: 4000,
    clean: true,
    path: '',
    ssl: false,
    variables: {},
    ...overrides,
  } as unknown as ConnectionModel)

const serverProfile = (overrides: Partial<ServerProfileModel> = {}): ServerProfileModel =>
  ({
    id: 'srv-1',
    alias: 'dev broker',
    host: 'broker.example.com',
    port: 8084,
    protocol: 'wss',
    ...overrides,
  } as ServerProfileModel)

const clientProfile = (overrides: Partial<ClientProfileModel> = {}): ClientProfileModel =>
  ({
    id: 'cli-1',
    alias: 'device',
    clientId: 'device-42',
    username: 'u',
    password: 'p',
    mqttVersion: '5.0',
    ...overrides,
  } as ClientProfileModel)

describe('presets (web build)', () => {
  describe('server presets', () => {
    it('applies protocol, host, port and path', () => {
      const record = createRecord()

      const result = applyServerProfileToRecord(record, serverProfile({ path: '/mqtt' }))

      expect(result.applied).to.equal(true)
      expect(record.protocol).to.equal('wss')
      expect(record.host).to.equal('broker.example.com')
      expect(record.port).to.equal(8084)
      expect(record.path).to.equal('/mqtt')
    })

    it('refuses a preset that uses a protocol a browser cannot open', () => {
      const record = createRecord()

      const result = applyServerProfileToRecord(record, serverProfile({ protocol: 'mqtt', port: 1883 }))

      expect(result.applied).to.equal(false)
      expect(result.reason).to.equal('protocolNotSupportedInBrowser')
      // The form is untouched: no silent rewrite to a websocket port.
      expect(record.host).to.equal('old.example.com')
      expect(record.port).to.equal(8083)
      expect(record.protocol).to.equal('ws')
    })

    it('reports a missing preset', () => {
      expect(applyServerProfileToRecord(createRecord(), null).reason).to.equal('notFound')
    })

    it('reads the current form back into a preset', () => {
      const record = createRecord({ host: 'h.example.com', port: 9001, protocol: 'wss', path: '/ws' })

      const profile = serverProfileFromRecord(record, '')

      expect(profile.alias).to.equal('h.example.com')
      expect(profile.protocol).to.equal('wss')
      expect(profile.port).to.equal(9001)
      expect(profile.path).to.equal('/ws')
    })
  })

  describe('client presets', () => {
    it('applies the identity and the session parameters', () => {
      const record = createRecord()

      const result = applyClientProfileToRecord(
        record,
        clientProfile({ keepalive: 30, connectTimeout: 5, clean: false, reconnect: false }),
      )

      expect(result.applied).to.equal(true)
      expect(record.clientId).to.equal('device-42')
      expect(record.username).to.equal('u')
      expect(record.password).to.equal('p')
      expect(record.mqttVersion).to.equal('5.0')
      expect(record.keepalive).to.equal(30)
      expect(record.clean).to.equal(false)
      expect(record.reconnect).to.equal(false)
    })

    it('leaves values the preset does not set untouched', () => {
      const record = createRecord({ keepalive: 45, connectTimeout: 12 })

      applyClientProfileToRecord(record, clientProfile({ keepalive: undefined, connectTimeout: undefined }))

      expect(record.keepalive).to.equal(45)
      expect(record.connectTimeout).to.equal(12)
    })

    it('keeps the variables the connection already has', () => {
      const record = createRecord({ variables: { productType: 'sensor' } })

      applyClientProfileToRecord(
        record,
        clientProfile({ variables: { productType: 'gateway', deviceId: 'd-1' } as $TSFixed }),
      )

      expect(record.variables).to.deep.equal({ productType: 'sensor', deviceId: 'd-1' })
    })

    it('skips MQTT 3.1, which the web client does not offer', () => {
      const record = createRecord({ mqttVersion: '3.1.1' })

      applyClientProfileToRecord(record, clientProfile({ mqttVersion: '3.1' as $TSFixed }))

      expect(record.mqttVersion).to.equal('3.1.1')
    })

    it('reads the identity back into a preset', () => {
      const record = createRecord({ name: 'my device', clientId: 'c-9', username: 'me' })

      const profile = clientProfileFromRecord(record, '')

      expect(profile.alias).to.equal('my device')
      expect(profile.clientId).to.equal('c-9')
      expect(profile.username).to.equal('me')
      expect(profile.password).to.equal(undefined)
    })
  })
})
