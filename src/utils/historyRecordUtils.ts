import useServices from '@/database/useServices'

/**
 * Looks for an already stored history record matching the given one.
 *
 * @param data the record about to be saved (topic + optional message)
 * @param matchMessage when true a record only matches if it carries the very same message,
 *                     when false only the topic/QoS/retain part is compared (used when the user
 *                     disabled "save message together").
 */
export const hasMessageHeaderID = async (
  data: HistoryMessageHeaderModel,
  matchMessage = true,
): Promise<string | null> => {
  const { historyMessageHeaderService } = useServices()
  // The lookup runs in SQL: loading the whole history (payloads included) on every publish was
  // the hot path for timed messages.
  return await historyMessageHeaderService.findMatchingId(data, matchMessage)
}

export default {}
