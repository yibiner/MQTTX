import { expect } from 'chai'
import { planAutoSubscribe, planConnectSubscriptions, reconcileAutoSubscriptions } from '@/utils/autoSubscribe'

const createGroup = (overrides: Partial<AutoSubscribeGroupModel> = {}): AutoSubscribeGroupModel => ({
  id: 'g1',
  delayMs: 0,
  merge: true,
  enabled: true,
  topics: [{ topic: 'app/${productType}/${clientId}/device/heart/post', qos: 1 }],
  ...overrides,
})

const variables = { productType: 'A1', clientId: 'AF0201' }

describe('autoSubscribe utility', () => {
  it('resolves the topic variables', () => {
    const plan = planAutoSubscribe([createGroup()], variables)
    expect(plan.unresolved).to.deep.equal([])
    expect(plan.batches).to.have.lengthOf(1)
    expect(plan.batches[0].topics).to.deep.equal([{ topic: 'app/A1/AF0201/device/heart/post', qos: 1 }])
    expect(plan.batches[0].merge).to.equal(true)
  })

  it('keeps one batch per group so each group keeps its own delay', () => {
    const first = createGroup({
      id: 'g1',
      delayMs: 0,
      topics: [
        { topic: 'a/b', qos: 0 },
        { topic: 'a/c', qos: 2 },
      ],
    })
    const second = createGroup({ id: 'g2', delayMs: 2000, merge: false, topics: [{ topic: 'a/d', qos: 1 }] })

    const plan = planAutoSubscribe([first, second], variables)
    expect(plan.batches).to.have.lengthOf(2)
    expect(plan.batches[0].topics).to.have.lengthOf(2)
    expect(plan.batches[0].delayMs).to.equal(0)
    expect(plan.batches[1].delayMs).to.equal(2000)
    expect(plan.batches[1].merge).to.equal(false)
  })

  it('skips disabled groups and topics with an unresolved placeholder', () => {
    const disabled = createGroup({ id: 'disabled', enabled: false })
    const unresolvedGroup = createGroup({
      id: 'unresolved',
      topics: [
        { topic: 'x/${missing}/y', qos: 0 },
        { topic: 'x/ok/y', qos: 0 },
      ],
    })
    const plan = planAutoSubscribe([disabled, unresolvedGroup], variables)
    expect(plan.batches).to.have.lengthOf(1)
    expect(plan.batches[0].topics.map((item) => item.topic)).to.deep.equal(['x/ok/y'])
    expect(plan.unresolved).to.deep.equal(['missing'])
  })

  it('drops duplicate topics and empty batches', () => {
    const plan = planAutoSubscribe(
      [
        createGroup({ id: 'g1', topics: [{ topic: 'a/b', qos: 0 }] }),
        createGroup({ id: 'g2', topics: [{ topic: 'a/b', qos: 1 }] }),
        createGroup({ id: 'g3', topics: [] }),
      ],
      variables,
    )
    expect(plan.batches).to.have.lengthOf(1)
    expect(plan.batches[0].topics).to.deep.equal([{ topic: 'a/b', qos: 0 }])
  })

  it('normalizes an invalid delay to zero', () => {
    const plan = planAutoSubscribe([createGroup({ delayMs: -5 })], variables)
    expect(plan.batches[0].delayMs).to.equal(0)
  })

  it('handles a connection without automatic subscriptions', () => {
    expect(planAutoSubscribe(null, variables)).to.deep.equal({ batches: [], unresolved: [] })
    expect(planAutoSubscribe(undefined, variables)).to.deep.equal({ batches: [], unresolved: [] })
  })

  it('skips a topic that the subscription panel paused', () => {
    const plan = planAutoSubscribe(
      [
        createGroup({
          topics: [
            { topic: 'a/b', qos: 0 },
            { topic: 'a/c', qos: 0, disabled: true },
          ],
        }),
      ],
      variables,
    )
    expect(plan.batches).to.have.lengthOf(1)
    expect(plan.batches[0].topics.map((item) => item.topic)).to.deep.equal(['a/b'])
  })
})

/**
 * The panel shows the automatic topics as ordinary rows, so deleting or pausing one there has to be
 * written back into the configuration - otherwise the next connect would subscribe it again.
 *
 * `before` is the list the panel had before the change, `after` the list it has now: a topic only
 * counts as deleted when it was there before.
 */
describe('reconcileAutoSubscriptions', () => {
  const groups = (): AutoSubscribeGroupModel[] => [
    {
      id: 'g1',
      delayMs: 1000,
      merge: true,
      enabled: true,
      topics: [
        { topic: 'app/${productType}/post', qos: 1 },
        { topic: 'app/${productType}/cmd', qos: 0 },
      ],
    },
    { id: 'g2', delayMs: 2000, merge: false, enabled: true, topics: [{ topic: 'app/${productType}/heart', qos: 0 }] },
  ]
  const rows = (...topics: string[]) => topics.map((topic) => ({ topic, disabled: false }))
  const reconcile = (
    current: AutoSubscribeGroupModel[] | null,
    before: Array<{ topic: string; disabled?: boolean }>,
    after: Array<{ topic: string; disabled?: boolean }>,
  ) => reconcileAutoSubscriptions(current, after, before, variables)

  it('drops a topic that was deleted in the panel and keeps the rest', () => {
    const before = rows('app/A1/post', 'app/A1/cmd', 'app/A1/heart')
    const after = rows('app/A1/post', 'app/A1/heart')
    const result = reconcile(groups(), before, after)
    expect(result.changed).to.equal(true)
    expect(result.groups.map((group) => group.id)).to.deep.equal(['g1', 'g2'])
    // the group keeps its delay and merge flag
    expect(result.groups[0].delayMs).to.equal(1000)
    expect(result.groups[0].merge).to.equal(true)
    expect(result.groups[0].topics).to.deep.equal([{ topic: 'app/${productType}/post', qos: 1 }])
    expect(result.groups[1].topics).to.deep.equal([{ topic: 'app/${productType}/heart', qos: 0 }])
  })

  it('clears the automatic subscriptions when every topic is gone', () => {
    const before = rows('app/A1/post', 'app/A1/cmd', 'app/A1/heart')
    const result = reconcile(groups(), before, [])
    expect(result.changed).to.equal(true)
    expect(result.groups).to.deep.equal([])
  })

  it('keeps a topic the panel does not know yet', () => {
    // The row only appears once the delay has passed and the row was saved: a connection with a
    // manually subscribed topic used to wipe the whole configuration on its first connect.
    const result = reconcile(groups(), rows('manual/keep'), rows('manual/keep'))
    expect(result.changed).to.equal(false)
    expect(result.groups).to.equal(groups.length ? result.groups : result.groups)
    expect(result.groups[0].topics).to.have.lengthOf(2)
  })

  it('marks a paused row as paused and clears the mark when it is enabled again', () => {
    const before = rows('app/A1/post', 'app/A1/cmd', 'app/A1/heart')
    const paused = reconcile(groups(), before, [
      { topic: 'app/A1/post', disabled: true },
      { topic: 'app/A1/cmd', disabled: false },
      { topic: 'app/A1/heart', disabled: false },
    ])
    expect(paused.changed).to.equal(true)
    expect(paused.groups[0].topics[0]).to.deep.equal({ topic: 'app/${productType}/post', qos: 1, disabled: true })

    const enabledAgain = reconcile(paused.groups, before, before)
    expect(enabledAgain.changed).to.equal(true)
    expect(enabledAgain.groups[0].topics[0]).to.deep.equal({
      topic: 'app/${productType}/post',
      qos: 1,
      disabled: undefined,
    })
  })

  it('reports no change when the panel still holds every topic', () => {
    const current = groups()
    const all = rows('app/A1/post', 'app/A1/cmd', 'app/A1/heart')
    const result = reconcile(current, all, all)
    expect(result.changed).to.equal(false)
    expect(result.groups).to.equal(current)
  })

  it('keeps a topic whose placeholder does not resolve, because no row can stand for it', () => {
    const result = reconcile([createGroup({ topics: [{ topic: 'app/${missing}/post', qos: 0 }] })], [], [])
    expect(result.changed).to.equal(false)
    expect(result.groups[0].topics).to.have.lengthOf(1)
  })

  it('handles a connection without automatic subscriptions', () => {
    expect(reconcile(null, [], [])).to.deep.equal({ groups: [], changed: false })
    expect(reconcile([], [], [])).to.deep.equal({ groups: [], changed: false })
  })
})

/**
 * The saved subscriptions of the panel and the automatic subscriptions of the connection are executed
 * by one place now, so their interaction (which used to be an exclusion list) is decided here.
 */
describe('planConnectSubscriptions', () => {
  const row = (topic: string, overrides: Partial<SubscriptionModel> = {}): SubscriptionModel => ({
    id: `row-${topic}`,
    topic,
    qos: 0,
    disabled: false,
    createAt: '2026-10-19 10:00:00:000',
    ...overrides,
  })
  const groups = (): AutoSubscribeGroupModel[] => [
    {
      id: 'g1',
      delayMs: 1500,
      merge: true,
      enabled: true,
      topics: [
        { topic: 'app/${productType}/post', qos: 1 },
        { topic: 'app/${productType}/cmd', qos: 0 },
      ],
    },
    { id: 'g2', delayMs: 0, merge: false, enabled: true, topics: [{ topic: 'app/${productType}/heart', qos: 0 }] },
  ]

  it('subscribes the saved rows right away and the automatic topics with their delay', () => {
    const plan = planConnectSubscriptions({
      rows: [row('manual/keep')],
      groups: groups(),
      variables,
    })
    const manual = plan.batches.filter((batch) => batch.source === 'manual')
    const auto = plan.batches.filter((batch) => batch.source === 'auto')
    expect(manual).to.have.lengthOf(1)
    expect(manual[0].delayMs).to.equal(0)
    expect(manual[0].merge).to.equal(false)
    expect(manual[0].topics[0].topic).to.equal('manual/keep')
    // the saved row travels with the batch, so its MQTT 5 options survive
    expect(manual[0].topics[0].row).to.deep.equal(row('manual/keep'))
    expect(auto.map((batch) => [batch.groupId, batch.delayMs, batch.merge])).to.deep.equal([
      ['g1', 1500, true],
      ['g2', 0, false],
    ])
  })

  it('lets a saved subscription win over the configured delay of the same topic', () => {
    const plan = planConnectSubscriptions({
      rows: [row('app/A1/post')],
      groups: groups(),
      variables,
    })
    const forPost = plan.batches.filter((batch) => batch.topics.some((item) => item.topic === 'app/A1/post'))
    expect(forPost).to.have.lengthOf(1)
    expect(forPost[0].source).to.equal('manual')
    expect(forPost[0].delayMs).to.equal(0)
    // the rest of the group is still subscribed with its delay
    const remaining = plan.batches.find((batch) => batch.groupId === 'g1')
    expect(remaining?.topics.map((item) => item.topic)).to.deep.equal(['app/A1/cmd'])
  })

  it('skips a paused saved row and a paused automatic topic', () => {
    const plan = planConnectSubscriptions({
      rows: [row('manual/paused', { disabled: true })],
      groups: [{ id: 'g', delayMs: 0, merge: true, enabled: true, topics: [{ topic: 'a/b', qos: 0, disabled: true }] }],
      variables,
    })
    expect(plan.batches).to.deep.equal([])
  })

  it('leaves the saved rows alone when "auto resubscribe" is off', () => {
    const plan = planConnectSubscriptions({
      rows: [row('manual/keep')],
      groups: groups(),
      variables,
      restoreManual: false,
    })
    expect(plan.batches.every((batch) => batch.source === 'auto')).to.equal(true)
  })

  it('keeps a row the automation created under its own delay', () => {
    // Reconnecting after the automatic topics were saved as rows must not turn them into ordinary
    // subscriptions: they would be subscribed immediately and the configured delay would be gone.
    const plan = planConnectSubscriptions({
      rows: [row('app/A1/cmd', { autoSubscribed: true }), row('manual/keep')],
      groups: groups(),
      variables,
    })
    const cmdBatches = plan.batches.filter((batch) => batch.topics.some((item) => item.topic === 'app/A1/cmd'))
    expect(cmdBatches).to.have.lengthOf(1)
    expect(cmdBatches[0].source).to.equal('auto')
    expect(cmdBatches[0].delayMs).to.equal(1500)
  })

  it('takes a row back as an ordinary subscription when the configuration dropped its topic', () => {
    const plan = planConnectSubscriptions({
      rows: [row('app/A1/old-topic', { autoSubscribed: true })],
      groups: groups(),
      variables,
    })
    const batches = plan.batches.filter((batch) => batch.topics.some((item) => item.topic === 'app/A1/old-topic'))
    expect(batches).to.have.lengthOf(1)
    expect(batches[0].source).to.equal('manual')
    expect(batches[0].delayMs).to.equal(0)
  })

  it('reports the unresolved placeholders of the automatic subscriptions', () => {
    const plan = planConnectSubscriptions({
      rows: null,
      groups: [{ id: 'g', delayMs: 0, merge: true, enabled: true, topics: [{ topic: 'x/${missing}/y', qos: 0 }] }],
      variables,
    })
    expect(plan.batches).to.deep.equal([])
    expect(plan.unresolved).to.deep.equal(['missing'])
  })
})
