import type { IClientSubscribeOptions } from 'mqtt'
import { setSubscribeMQTT5Properties } from '@/utils/subscriptionUtils'

/** The per-row options of a stored subscription, i.e. everything except the topic itself. */
export type SubscriptionRowOptions = Pick<
  SubscriptionModel,
  'qos' | 'nl' | 'rap' | 'rh' | 'subscriptionIdentifier' | 'userProperties'
>

/**
 * Builds the subscribe options of one stored subscription row.
 *
 * Shared by the subscription panel (when the user subscribes) and by the connect-time subscription
 * runner (when the saved rows are restored after reconnecting): a row keeps its QoS, its "no local" /
 * "retain as published" / "retain handling" flags and its MQTT 5 subscribe properties, so restoring a
 * subscription must send exactly what subscribing it sent in the first place.
 *
 * The three flags exist in MQTT 5 only; on an MQTT 3.1.1 connection they are dropped instead of being
 * sent to a broker that has no idea what they are.
 */
export const buildRowSubscribeOptions = (
  mqttVersion: ConnectionModel['mqttVersion'],
  row: SubscriptionRowOptions,
): IClientSubscribeOptions => {
  if (mqttVersion !== '5.0') {
    return { qos: row.qos }
  }
  const options: IClientSubscribeOptions = { qos: row.qos }
  if (row.nl !== undefined) {
    options.nl = row.nl
  }
  if (row.rap !== undefined) {
    options.rap = row.rap
  }
  if (row.rh !== undefined) {
    options.rh = row.rh
  }
  const properties = setSubscribeMQTT5Properties({
    subscriptionIdentifier: row.subscriptionIdentifier,
    userProperties: row.userProperties,
  })
  if (properties) {
    options.properties = properties
  }
  return options
}

export default {}
