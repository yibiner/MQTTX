/**
 * Which saved timed reports still have to be started.
 *
 * A report the runner already holds (matched by its id) is left alone, so a second successful
 * connect does not start a second interval for the same row. A report the user stopped is absent
 * from that set and is started again on the next successful connect. Rows without a topic or with
 * an interval below one second are skipped: the runner treats that interval as "do not start".
 */
export const pendingTimedReports = (
  runningReportIds: ReadonlySet<string>,
  reports: TimedReportModel[] | null | undefined,
): TimedReportModel[] => {
  const pending: TimedReportModel[] = []
  if (!Array.isArray(reports)) {
    return pending
  }
  reports.forEach((report) => {
    if (!report || report.enabled === false) {
      return
    }
    const topic = String(report.topic ?? '').trim()
    const interval = Number(report.interval)
    if (!topic || !Number.isFinite(interval) || interval < 1) {
      return
    }
    if (report.id && runningReportIds.has(report.id)) {
      return
    }
    pending.push(report)
  })
  return pending
}
