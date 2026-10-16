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
  const headers = await historyMessageHeaderService.getAll()
  if (headers) {
    const res = headers.find((el: HistoryMessageHeaderModel) => {
      const sameHeader = data.qos === el.qos && data.topic === el.topic && data.retain === el.retain
      if (!sameHeader) {
        return false
      }
      if (!matchMessage) {
        return true
      }
      return (data.payload ?? null) === (el.payload ?? null) && (data.payloadType ?? null) === (el.payloadType ?? null)
    })
    return res?.id ?? null
  }
  return null
}

export default {}
