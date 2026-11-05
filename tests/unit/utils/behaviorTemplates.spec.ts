import { expect } from 'chai'
import { deleteBehaviorTemplate, saveBehaviorTemplate } from '@/utils/configProfiles'
import {
  applyBehaviorAccount,
  applyBehaviorClientOptions,
  behaviorParentChoices,
  behaviorTemplateHasChildren,
  captureBehaviorBaseline,
  detachBehaviorContent,
  detachBehaviorTemplate,
  resolveBehaviorFrom,
  resolveBehaviorTemplate,
  restoreBehaviorBaseline,
} from '@/utils/behaviorTemplates'
import { pendingTimedReports } from '@/utils/timedReports'

const template = (partial: Partial<BehaviorTemplateModel> & { id: string; name: string }): BehaviorTemplateModel => ({
  variables: {},
  autoSubscriptions: [],
  timedReports: [],
  autoReplies: [],
  messageSequences: [],
  ...partial,
})

const sub = (topic: string): AutoSubscribeGroupModel => ({
  id: `group-${topic}`,
  delayMs: 0,
  merge: true,
  enabled: true,
  topics: [{ topic, qos: 0 }],
})

const report = (topic: string, interval = 30): TimedReportModel => ({
  id: `report-${topic}`,
  interval,
  topic,
  payload: '{}',
  qos: 0,
  enabled: true,
})

describe('behavior templates', () => {
  const created: string[] = []

  afterEach(() => {
    created.splice(0).forEach((id) => deleteBehaviorTemplate(id))
  })

  const save = (partial: Partial<BehaviorTemplateModel> & { name: string }) => {
    const stored = saveBehaviorTemplate(partial)
    created.push(stored.id)
    return stored
  }

  it('appends lists from the root and lets the child override a variable and a password', () => {
    const base = template({
      id: 'base',
      name: '基础',
      username: 'category',
      password: 'category-secret',
      usernameFrom: 'template',
      passwordFrom: 'template',
      defaultServerId: 'server-a',
      variables: { productType: 'BASE' },
      autoSubscriptions: [sub('base/sub')],
      timedReports: [report('base/post', 60)],
    })
    const advanced = template({
      id: 'advanced',
      name: '进阶',
      parentId: 'base',
      variables: { productType: 'ADV' },
      autoSubscriptions: [sub('ota/sub')],
      messageSequences: [
        {
          id: 'seq-ota',
          name: 'OTA',
          enabled: true,
          trigger: 'message',
          matchTopic: 'ota/cmd',
          matchCondition: '',
          loop: false,
          stopWhen: { variable: '', op: 'lt', value: 0 },
          steps: [],
        },
      ],
    })
    const water = template({
      id: 'water',
      name: '饮水',
      parentId: 'base',
      password: 'water-secret',
      variables: { water: '2000' },
      autoReplies: [
        {
          id: 'cal',
          name: '校准',
          enabled: true,
          matchTopic: 'cal/sub',
          matchCondition: '',
          reply: { topic: 'cal/post', mode: 'fixed', payload: '{}', qos: 0, retain: false, delayMs: 0 },
        },
      ],
    })

    const resolved = resolveBehaviorFrom([base, advanced, water], 'water')
    expect(resolved?.chain.map((item) => item.name)).to.deep.equal(['基础', '饮水'])
    expect(resolved?.variables).to.deep.equal({ productType: 'BASE', water: '2000' })
    expect(resolved?.autoSubscriptions.map((group) => group.topics[0].topic)).to.deep.equal(['base/sub'])
    expect(resolved?.autoReplies.map((rule) => rule.name)).to.deep.equal(['校准'])
    expect(resolved?.timedReports.map((item) => item.topic)).to.deep.equal(['base/post'])
    expect(resolved?.password).to.equal('water-secret')
    expect(resolved?.username).to.equal('category')
    expect(resolved?.defaultServerId).to.equal('server-a')
    expect(resolved?.passwordFrom).to.equal('template')

    const advancedResolved = resolveBehaviorFrom([base, advanced, water], 'advanced')
    expect(advancedResolved?.autoSubscriptions.map((group) => group.topics[0].topic)).to.deep.equal([
      'base/sub',
      'ota/sub',
    ])
    expect(advancedResolved?.messageSequences.map((sequence) => sequence.name)).to.deep.equal(['OTA'])
    expect(advancedResolved?.variables.productType).to.equal('ADV')
  })

  it('lets a closer template override one advanced field and keeps the parent will', () => {
    const base = template({
      id: 'base',
      name: '基础',
      session: { mqttVersion: '3.1.1', keepalive: 30, clean: false, properties: { sessionExpiryInterval: 7200 } },
      will: { lastWillTopic: 'base/will', lastWillQos: 1 },
    })
    const child = template({
      id: 'child',
      name: '进阶',
      parentId: 'base',
      session: { mqttVersion: '5.0', properties: { sessionExpiryInterval: null } },
    })

    const resolved = resolveBehaviorFrom([base, child], 'child')
    expect(resolved?.session.mqttVersion).to.equal('5.0')
    expect(resolved?.session.keepalive).to.equal(30)
    expect(resolved?.session.clean).to.equal(false)
    expect(resolved?.session.properties?.sessionExpiryInterval).to.equal(null)
    expect(resolved?.will.lastWillTopic).to.equal('base/will')
    expect(resolved?.will.lastWillQos).to.equal(1)

    const record = {
      mqttVersion: '5.0',
      connectTimeout: 10,
      keepalive: 60,
      clean: true,
      properties: { sessionExpiryInterval: 0 },
      will: { lastWillTopic: '', lastWillPayload: '', lastWillQos: 0, lastWillRetain: false },
    } as ConnectionModel
    applyBehaviorClientOptions(record, resolved?.session, resolved?.will)
    expect(record.mqttVersion).to.equal('5.0')
    expect(record.keepalive).to.equal(30)
    expect(record.clean).to.equal(false)
    expect(record.connectTimeout).to.equal(10)
    expect(record.properties?.sessionExpiryInterval).to.equal(undefined)
    expect(record.will?.lastWillTopic).to.equal('base/will')
    expect(record.will?.lastWillQos).to.equal(1)
  })

  it('keeps an account already on the form when the template has no username', () => {
    const record = { username: 'alice', password: 'secret' } as unknown as ConnectionModel
    const fromDevice = applyBehaviorAccount(
      record,
      { usernameFrom: 'template', passwordFrom: 'template' },
      { username: 'device-user', password: 'device-secret' },
    )
    expect(fromDevice).to.equal(false)
    expect(record.username).to.equal('alice')
    expect(record.password).to.equal('secret')

    applyBehaviorAccount(record, { username: 'category', usernameFrom: 'template', passwordFrom: 'template' })
    expect(record.username).to.equal('category')
    expect(record.password).to.equal('secret')

    applyBehaviorAccount(
      record,
      { usernameFrom: 'device', passwordFrom: 'device' },
      { username: 'device-user', password: 'device-secret' },
    )
    expect(record.username).to.equal('device-user')
    expect(record.password).to.equal('device-secret')
  })

  it('drops the previous template advanced fields when the baseline is restored', () => {
    const record = {
      username: 'alice',
      password: '',
      host: 'broker.emqx.io',
      port: 1883,
      mqttVersion: '3.1.1',
      keepalive: 15,
      connectTimeout: 10,
      reconnect: true,
      reconnectPeriod: 4000,
      clean: true,
      variables: {},
      autoSubscriptions: [],
      timedReports: [],
      autoReplies: [],
      messageSequences: [],
      will: { lastWillTopic: '', lastWillPayload: '', lastWillQos: 0 as QoS, lastWillRetain: false },
    } as unknown as ConnectionModel
    const baseline = captureBehaviorBaseline(record, 'server-a')
    record.mqttVersion = '3.1'
    record.keepalive = 30
    record.will = { ...record.will!, lastWillTopic: 'a/will' }
    record.host = 'other.example.com'
    record.autoSubscriptions = [
      { id: 'g', delayMs: 0, merge: true, enabled: true, topics: [{ topic: 'a/sub', qos: 0 }] },
    ]

    restoreBehaviorBaseline(record, baseline)
    expect(record.mqttVersion).to.equal('3.1.1')
    expect(record.keepalive).to.equal(15)
    expect(record.will?.lastWillTopic).to.equal('')
    expect(record.host).to.equal('broker.emqx.io')
    expect(record.autoSubscriptions).to.deep.equal([])
    expect(baseline.serverProfileId).to.equal('server-a')

    applyBehaviorClientOptions(record, { keepalive: 20 }, {})
    expect(record.keepalive).to.equal(20)
    expect(record.mqttVersion).to.equal('3.1.1')
  })

  it('turns a cleared keepalive into the new-connection default', () => {
    const record = { keepalive: 30, properties: { sessionExpiryInterval: 7200 } } as ConnectionModel
    applyBehaviorClientOptions(record, { keepalive: null, properties: { sessionExpiryInterval: null } }, null)
    expect(record.keepalive).to.equal(60)
    expect(record.properties?.sessionExpiryInterval).to.equal(undefined)
  })

  it('lets a template sit on the base or on the advanced template, and refuses a cycle', () => {
    const base = template({ id: 'base', name: '基础' })
    const advanced = template({ id: 'advanced', name: '进阶', parentId: 'base' })
    const feed = template({ id: 'feed', name: '喂食', parentId: 'base' })
    const all = [base, advanced, feed]

    expect(behaviorParentChoices(all, 'feed').map((item) => item.id)).to.have.members(['base', 'advanced'])
    expect(behaviorParentChoices(all, 'base').map((item) => item.id)).to.deep.equal([])
    expect(behaviorParentChoices(all, 'advanced').map((item) => item.id)).to.have.members(['base', 'feed'])
    const feedOnAdvanced = { ...feed, parentId: 'advanced' }
    expect(behaviorParentChoices([base, advanced, feedOnAdvanced], 'advanced').map((item) => item.id)).to.deep.equal([
      'base',
    ])
    expect(behaviorTemplateHasChildren('base', all)).to.equal(true)
    expect(behaviorTemplateHasChildren('feed', all)).to.equal(false)
  })

  it('stops following the parent by copying the resolved behaviour onto the template', () => {
    const base = save({
      name: '基础',
      variables: { productType: 'BASE' },
      timedReports: [report('heart/post', 30)],
      usernameFrom: 'device',
      passwordFrom: 'device',
    })
    const child = save({
      name: '喂食',
      parentId: base.id,
      variables: { camera: 'on' },
      timedReports: [report('camera/post', 10)],
    })

    const before = resolveBehaviorTemplate(child.id)
    expect(before?.timedReports.map((item) => item.topic)).to.deep.equal(['heart/post', 'camera/post'])
    expect(before?.usernameFrom).to.equal('device')

    const detached = detachBehaviorTemplate(child.id)
    expect(detached?.parentId).to.equal(null)
    expect(detached?.timedReports?.map((item) => item.topic)).to.deep.equal(['heart/post', 'camera/post'])
    expect(detached?.variables).to.deep.equal({ productType: 'BASE', camera: 'on' })
    expect(detached?.passwordFrom).to.equal('device')
    expect(detached?.timedReports?.[0].id).to.not.equal('report-heart/post')

    saveBehaviorTemplate({
      ...base,
      timedReports: [report('heart/post', 5)],
    })
    const after = resolveBehaviorTemplate(child.id)
    expect(after?.timedReports?.map((item) => item.interval)).to.deep.equal([30, 10])
    expect(
      detachBehaviorContent(detached as BehaviorTemplateModel, [base, detached as BehaviorTemplateModel]).parentId,
    ).to.equal(null)
  })
})

describe('pending timed reports', () => {
  const row = (id: string, topic = 'heart/post', interval = 30): TimedReportModel => ({
    id,
    interval,
    topic,
    payload: '{}',
    enabled: true,
  })

  it('skips a report that is already running and one that is disabled or incomplete', () => {
    const reports = [
      row('a'),
      row('b'),
      { ...row('c'), enabled: false },
      { ...row('d'), topic: '  ' },
      { ...row('e'), interval: 0 },
    ]
    expect(pendingTimedReports(new Set(['a']), reports).map((item) => item.id)).to.deep.equal(['b'])
  })

  it('starts a stopped report again because its id is no longer running', () => {
    expect(pendingTimedReports(new Set(), [row('a')]).map((item) => item.id)).to.deep.equal(['a'])
  })
})
