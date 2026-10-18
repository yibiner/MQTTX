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
      if (!template || item?.disabled === true) {
        // A paused topic stays configured but is not subscribed, so pausing it in the subscription
        // panel is not undone by the next connect.
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

/**
 * Brings the configured groups back in line with what the subscription panel now holds.
 *
 * The topics of an automatic subscription are shown as ordinary rows in the panel, so the user may
 * delete or pause them there like any other subscription. Without this step the next connect would
 * subscribe them again (the deletion would look undone), so the panel is the source of truth - but
 * only for the rows it already knew about:
 *
 * - a topic whose row disappeared between `previousRows` and `rows` was deleted by the user, and is
 *   removed from the configuration (deleting the last one clears the automatic subscriptions);
 * - a topic with no row in either list is left alone. It is simply not subscribed yet (the panel only
 *   learns about the row once the delay has passed and the row was saved), and treating that as a
 *   deletion used to wipe a whole configuration on the first connect of a connection that also had a
 *   manually subscribed topic;
 * - a paused row marks its topic as paused, an enabled row clears that mark;
 * - a topic whose placeholder does not resolve cannot be compared with a row and stays as it is.
 */
export const reconcileAutoSubscriptions = (
  groups: AutoSubscribeGroupModel[] | null | undefined,
  rows: Array<{ topic: string; disabled?: boolean }>,
  previousRows: Array<{ topic: string; disabled?: boolean }>,
  variables: { [name: string]: string } = {},
): { groups: AutoSubscribeGroupModel[]; changed: boolean } => {
  if (!Array.isArray(groups) || !groups.length) {
    return { groups: [], changed: false }
  }
  const pausedByTopic = new Map<string, boolean>()
  rows.forEach((row) => pausedByTopic.set(row.topic, row.disabled === true))
  const knownBefore = new Set(previousRows.map((row) => row.topic))

  let changed = false
  const next: AutoSubscribeGroupModel[] = []

  for (const group of groups) {
    const topics: AutoSubscribeTopicModel[] = []
    // Whether this group's topic list differs from the configured one (a topic removed, or a paused
    // flag written), so the group object is rebuilt only when it has to be.
    let groupChanged = false
    for (const item of group.topics ?? []) {
      const template = (item?.topic ?? '').trim()
      if (!template) {
        continue
      }
      const { text, unresolved } = resolvePayloadVariables(template, { variables })
      if (unresolved.length) {
        // Cannot be compared with a row, and it is not subscribed either: leave it configured.
        topics.push(item)
        continue
      }
      if (!pausedByTopic.has(text)) {
        if (knownBefore.has(text)) {
          // The row was there before this change and is gone now: the user removed it in the panel.
          changed = true
          groupChanged = true
          continue
        }
        // The panel simply does not know this topic yet: it has not been subscribed, so no row for it.
        topics.push(item)
        continue
      }
      const paused = pausedByTopic.get(text) === true
      if ((item.disabled === true) !== paused) {
        changed = true
        groupChanged = true
        topics.push(paused ? { ...item, disabled: true } : { ...item, disabled: undefined })
        continue
      }
      topics.push(item)
    }
    if (!topics.length) {
      // Every topic of this group is gone: the group (delay and merge flag included) goes with them.
      changed = true
      continue
    }
    next.push(groupChanged ? { ...group, topics } : group)
  }

  return changed ? { groups: next, changed } : { groups, changed }
}
