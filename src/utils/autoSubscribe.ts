import { resolvePayloadVariables } from '@/utils/payloadVariables'

/**
 * Turns the configured automatic subscriptions of a connection into the batches that are sent to
 * the broker after connecting.
 *
 * Every group waits `delayMs` from the moment the connection succeeded, so a device can be
 * simulated that comes online and only then starts listening (`0` = right away, `2000` = two
 * seconds later). Groups are independent: a second group never waits for the first one, it just
 * has its own delay.
 *
 * Topics are templates (`app/${productType}/${clientId}/device/heart/post`): they are resolved with
 * the "客户端变量", the global variables and the fields of the connection. A topic that still has an
 * unresolved placeholder is not subscribed (subscribing to a literal `${...}` topic would silently
 * create a subscription nobody ever publishes to); its placeholder names are reported instead.
 */
export interface PlannedAutoSubscribeBatch {
  groupId: string
  delayMs: number
  /** send this batch as a single SUBSCRIBE packet */
  merge: boolean
  topics: AutoSubscribeTopicModel[]
}

export interface AutoSubscribePlan {
  batches: PlannedAutoSubscribeBatch[]
  /** names of the placeholders that could not be resolved, in order of first appearance */
  unresolved: string[]
}

const normalizeDelay = (delayMs: number): number => {
  const value = Number(delayMs)
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  // setTimeout() treats anything above 2^31-1 as 1ms
  return Math.min(Math.round(value), 2147483647)
}

export const planAutoSubscribe = (
  groups: AutoSubscribeGroupModel[] | null | undefined,
  variables: { [name: string]: string } = {},
): AutoSubscribePlan => {
  const plan: AutoSubscribePlan = { batches: [], unresolved: [] }
  if (!Array.isArray(groups)) {
    return plan
  }
  const seen = new Set<string>()

  groups.forEach((group) => {
    if (!group || group.enabled === false || !Array.isArray(group.topics)) {
      return
    }
    const topics: AutoSubscribeTopicModel[] = []
    group.topics.forEach((item) => {
      const template = (item?.topic ?? '').trim()
      if (!template) {
        return
      }
      const { text, unresolved } = resolvePayloadVariables(template, { variables })
      unresolved.forEach((name) => {
        if (!plan.unresolved.includes(name)) {
          plan.unresolved.push(name)
        }
      })
      if (unresolved.length) {
        return
      }
      if (seen.has(text)) {
        return
      }
      seen.add(text)
      topics.push({ topic: text, qos: item.qos ?? 0 })
    })

    if (!topics.length) {
      return
    }
    plan.batches.push({
      groupId: group.id,
      delayMs: normalizeDelay(group.delayMs),
      merge: group.merge !== false,
      topics,
    })
  })

  return plan
}
