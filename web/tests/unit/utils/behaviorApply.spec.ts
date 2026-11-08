import { expect } from 'chai'
import { applyBehaviorTemplateToRecord } from '@/utils/behaviorApply'

const createRecord = (overrides: Partial<ConnectionModel> = {}): ConnectionModel =>
  ({
    id: 'conn-behavior',
    clientId: 'dev-1',
    name: 'dev',
    host: 'broker.example.com',
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
    autoSubscriptions: [],
    connectReports: [],
    timedReports: [],
    autoReplies: [],
    messageSequences: [],
    ...overrides,
  } as unknown as ConnectionModel)

const template = (overrides: Partial<BehaviorTemplateModel> = {}): BehaviorTemplateModel =>
  ({
    id: 'tpl-1',
    name: 'device',
    parentId: null,
    username: 'device-user',
    password: 'device-pass',
    usernameFrom: 'template',
    passwordFrom: 'template',
    variables: { productType: 'gateway' },
    autoSubscriptions: [
      { id: 'group-1', enabled: true, delayMs: 0, merge: false, topics: [{ topic: 'app/dev/cmd', qos: 0 }] },
    ] as AutoSubscribeGroupModel[],
    connectReports: [{ id: 'report-1', delay: 0, topic: 'app/dev/online', payload: '{}' }] as ConnectReportModel[],
    timedReports: [{ id: 'timed-1', interval: 5, topic: 'app/dev/heart', payload: '{}' }] as TimedReportModel[],
    autoReplies: [
      {
        id: 'rule-1',
        name: 'ack',
        enabled: true,
        matchTopic: 'app/dev/cmd',
        matchCondition: '',
        reply: { topic: 'app/dev/ack', mode: 'fixed', payload: '{}', qos: 0 as QoS, retain: false, delayMs: 0 },
      },
    ] as AutoReplyRuleModel[],
    messageSequences: [
      {
        id: 'seq-1',
        name: 'boot',
        enabled: true,
        trigger: 'connect',
        matchTopic: '',
        matchCondition: '',
        loop: false,
        stopWhen: null,
        steps: [{ id: 'step-1', delayMs: 0, topic: 'app/dev/boot', payload: '{}', qos: 0 as QoS, retain: false }],
      },
    ] as MessageSequenceModel[],
    ...overrides,
  } as BehaviorTemplateModel)

describe('behaviour templates (web build)', () => {
  it('applies every automation list of the template', () => {
    const record = createRecord()

    const result = applyBehaviorTemplateToRecord(record, [template()], 'tpl-1', null)

    expect(result.applied).to.equal(true)
    expect(record.autoSubscriptions).to.have.length(1)
    expect(record.connectReports).to.have.length(1)
    expect(record.timedReports).to.have.length(1)
    expect(record.autoReplies).to.have.length(1)
    expect(record.messageSequences).to.have.length(1)
    expect(record.username).to.equal('device-user')
  })

  it('gives the applied rows new ids so they are not shared with the template', () => {
    const record = createRecord()
    const tpl = template()

    applyBehaviorTemplateToRecord(record, [tpl], 'tpl-1', null)

    expect(record.autoSubscriptions![0].id).to.not.equal(tpl.autoSubscriptions?.[0].id)
    expect(record.timedReports?.[0].id).to.not.equal(tpl.timedReports?.[0].id)
    expect(record.messageSequences?.[0].id).to.not.equal(tpl.messageSequences?.[0].id)
    // The template itself must not be touched by the copy.
    expect(tpl.autoSubscriptions?.[0].id).to.equal('group-1')
  })

  it('keeps the variables the connection already defines', () => {
    const record = createRecord({ variables: { productType: 'sensor', deviceId: 'd-1' } })

    applyBehaviorTemplateToRecord(record, [template()], 'tpl-1', null)

    expect(record.variables).to.deep.equal({ productType: 'sensor', deviceId: 'd-1' })
  })

  it('restores the form when the template is cleared', () => {
    const record = createRecord({ username: 'own-user' })
    const first = applyBehaviorTemplateToRecord(record, [template()], 'tpl-1', null)
    expect(record.username).to.equal('device-user')

    const cleared = applyBehaviorTemplateToRecord(record, [template()], null, first.baseline)

    expect(cleared.applied).to.equal(false)
    expect(cleared.baseline).to.equal(null)
    expect(record.username).to.equal('own-user')
    expect(record.autoSubscriptions).to.deep.equal([])
  })

  it('does not stack a second template on top of the first', () => {
    const record = createRecord()
    const first = applyBehaviorTemplateToRecord(record, [template()], 'tpl-1', null)
    const other = template({
      id: 'tpl-2',
      name: 'other',
      autoSubscriptions: [
        { id: 'group-2', enabled: true, delayMs: 0, merge: false, topics: [{ topic: 'app/other/cmd', qos: 0 }] },
      ] as AutoSubscribeGroupModel[],
    })

    applyBehaviorTemplateToRecord(record, [template(), other], 'tpl-2', first.baseline)

    expect(record.autoSubscriptions).to.have.length(1)
    expect(record.autoSubscriptions![0].topics[0].topic).to.equal('app/other/cmd')
  })

  it('does nothing when the template id is unknown', () => {
    const record = createRecord({ username: 'own-user' })

    const result = applyBehaviorTemplateToRecord(record, [], 'missing', null)

    expect(result.applied).to.equal(false)
    expect(record.username).to.equal('own-user')
  })

  it('appends the lists along the parent chain', () => {
    const parent = template({ id: 'tpl-parent', name: 'parent', messageSequences: [] as MessageSequenceModel[] })
    const child = template({ id: 'tpl-child', name: 'child', parentId: 'tpl-parent', autoReplies: [] as AutoReplyRuleModel[] })
    const record = createRecord()

    applyBehaviorTemplateToRecord(record, [parent, child], 'tpl-child', null)

    // Lists are appended from the root down (see `resolveBehaviorFrom`): the parent's reply and the
    // parent's sequence survive, even though the child sets neither. An empty list means "nothing to
    // add here", not "clear what the parent set".
    expect(record.messageSequences).to.have.length(1)
    expect(record.autoReplies).to.have.length(1)
  })
})
