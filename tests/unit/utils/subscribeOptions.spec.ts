import { expect } from 'chai'
import { buildRowSubscribeOptions } from '@/utils/subscribeOptions'

const row = (overrides: Partial<SubscriptionModel> = {}) =>
  ({
    qos: 1,
    nl: true,
    rap: true,
    rh: 2,
    subscriptionIdentifier: 7,
    userProperties: { trace: 'abc' },
    ...overrides,
  } as SubscriptionModel)

/**
 * The panel and the connect-time subscription runner share this builder, so a saved subscription is
 * restored with exactly the options it was subscribed with. MQTT 3.1.1 has no such flags, and sending
 * them there would be wrong.
 */
describe('buildRowSubscribeOptions', () => {
  it('keeps the QoS and the MQTT 5 options of the row', () => {
    expect(buildRowSubscribeOptions('5.0', row())).to.deep.equal({
      qos: 1,
      nl: true,
      rap: true,
      rh: 2,
      properties: { subscriptionIdentifier: 7, userProperties: { trace: 'abc' } },
    })
  })

  it('drops the MQTT 5 flags and properties on an MQTT 3 connection', () => {
    expect(buildRowSubscribeOptions('3.1.1', row())).to.deep.equal({ qos: 1 })
    expect(buildRowSubscribeOptions('3.1', row())).to.deep.equal({ qos: 1 })
  })

  it('sends no properties when the row has none', () => {
    const options = buildRowSubscribeOptions('5.0', row({ subscriptionIdentifier: null, userProperties: null }))
    expect(options.properties).to.equal(undefined)
    expect(options.qos).to.equal(1)
  })
})
