/**
 * Seconds to wait after connect. An empty delay sends immediately. A negative delay is refused.
 */
export const connectReportDelaySeconds = (delay: number | null | undefined): number | null => {
  if (delay === null || delay === undefined) {
    return 0
  }
  const value = Number(delay)
  if (!Number.isFinite(value)) {
    return 0
  }
  if (value < 0) {
    return null
  }
  return value
}

/**
 * Which saved connect-reports should be sent after this successful connect.
 *
 * Each row is sent once, after its delay. A row without a topic, or with a delay below zero,
 * is skipped. An empty delay sends immediately. Disabling a row keeps it in the editor but
 * does not send it.
 */
export const pendingConnectReports = (reports: ConnectReportModel[] | null | undefined): ConnectReportModel[] => {
  if (!Array.isArray(reports)) {
    return []
  }
  return reports.filter((report) => {
    if (!report || report.enabled === false) {
      return false
    }
    const topic = String(report.topic ?? '').trim()
    return !!topic && connectReportDelaySeconds(report.delay) !== null
  })
}
