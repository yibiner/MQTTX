import { expect } from 'chai'
import { planAutoSubscribe } from '@/utils/autoSubscribe'

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
})
