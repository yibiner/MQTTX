import {
  BehaviorFormBaseline,
  ResolvedBehavior,
  applyBehaviorAccount,
  applyBehaviorClientOptions,
  captureBehaviorBaseline,
  copyBehaviorLists,
  resolveBehaviorFrom,
  restoreBehaviorBaseline,
} from '@/utils/behaviorTemplates'

/**
 * Applies a behaviour template to a connection record ("行为模板").
 *
 * Kept out of the form component so the two rules that are easy to get wrong can be tested:
 *
 * 1. every applied list gets fresh ids, so the template and the connection never share the runtime
 *    state of a subscription group, a timed report or a sequence run;
 * 2. the form is captured before the first application, so switching or clearing templates restores
 *    what the user had instead of stacking templates on top of each other.
 */

export interface ApplyBehaviorResult {
  /** the form before the first application, to be kept and passed back in on the next call */
  baseline: BehaviorFormBaseline | null
  applied: boolean
}

/** Writes the resolved template onto the record: lists, variables, account and client options. */
export const applyResolvedBehavior = (record: ConnectionModel, resolved: ResolvedBehavior): void => {
  const lists = copyBehaviorLists(resolved)
  record.autoSubscriptions = lists.autoSubscriptions
  record.connectReports = lists.connectReports
  record.timedReports = lists.timedReports
  record.autoReplies = lists.autoReplies
  record.messageSequences = lists.messageSequences
  // The connection's own variables win: a template fills in what the connection does not define.
  record.variables = { ...resolved.variables, ...(record.variables ?? {}) }
  applyBehaviorAccount(record, resolved, undefined)
  applyBehaviorClientOptions(record, resolved.session, resolved.will)
}

/**
 * Applies the template `templateId`, or restores the form when the id is empty.
 *
 * `baseline` is the value returned by the previous call; pass `null` the first time.
 */
export const applyBehaviorTemplateToRecord = (
  record: ConnectionModel,
  templates: BehaviorTemplateModel[],
  templateId: string | null,
  baseline: BehaviorFormBaseline | null,
): ApplyBehaviorResult => {
  if (!templateId) {
    if (baseline) {
      restoreBehaviorBaseline(record, baseline)
    }
    return { baseline: null, applied: false }
  }

  const resolved = resolveBehaviorFrom(templates, templateId)
  if (!resolved) {
    return { baseline, applied: false }
  }

  const nextBaseline = baseline ?? captureBehaviorBaseline(record, null)
  if (baseline) {
    // Switching templates starts from the original form, not from the previously applied one.
    restoreBehaviorBaseline(record, baseline)
  }
  applyResolvedBehavior(record, resolved)
  return { baseline: nextBaseline, applied: true }
}
