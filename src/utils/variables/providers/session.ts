import type { VariableProvider } from '../types'

/**
 * The variables of the current connection session, available while a connection context exists:
 *
 *   ${connectedAt}      epoch ms of the successful connect that started this session
 *   ${connectedAtSec}   the same as epoch seconds
 *   ${appStartedAt}     epoch ms when the app process started
 *   ${sessionSentCount} 1-based index of the message being built in this session
 *
 * They make a "device uptime" or a "message number since connect" possible without a script:
 * `${ts - connectedAt}` is the session uptime in milliseconds, `${connectedAtSec}` a stable base.
 *
 * The session counter is staged by the resolver and persisted with the other state, so a preview
 * does not consume a message number and a message used in both the topic and the payload counts
 * once.
 */
export const APP_STARTED_AT = Date.now()

const SESSION_NAMES = ['connectedAt', 'connectedAtSec', 'appStartedAt', 'sessionSentCount']

export const sessionVariablesProvider: VariableProvider = {
  id: 'session',
  // Reserved: the provider is asked before the user variables, so a user variable of one of these
  // names could never win. Rejecting the name is clearer than silently ignoring it.
  reserved: true,
  names: SESSION_NAMES,
  guide: [
    { name: '${connectedAt}', group: 'context' },
    { name: '${connectedAtSec}', group: 'context' },
    { name: '${appStartedAt}', group: 'context' },
    { name: '${sessionSentCount}', group: 'context' },
  ],
  resolve: (request, context) => {
    if (!context.session) {
      // A plain publish without a known connection has no session to talk about.
      return undefined
    }
    switch (request.name) {
      case 'connectedAt':
        return context.session.startedAt
      case 'connectedAtSec':
        return context.session.startedAt === undefined ? undefined : Math.floor(context.session.startedAt / 1000)
      case 'appStartedAt':
        return context.session.appStartedAt
      case 'sessionSentCount':
        return context.session.sentCount
      default:
        return undefined
    }
  },
}
