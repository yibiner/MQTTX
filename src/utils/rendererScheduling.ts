/**
 * Keeps the renderer on the clock while a timer-based feature is running.
 *
 * Chromium throttles timers in a hidden window, which stretches a 60s step and a timed
 * message alike. Timed messages and message sequences share one switch: one of them
 * finishing must not allow throttling again while the other is still waiting.
 *
 * The IPC flag is inverted on purpose. `true` means "a scheduler is running, do not
 * throttle"; the main process turns that into `setBackgroundThrottling(false)`.
 */
const holders = new Set<string>()
let announced: boolean | undefined

const send = (active: boolean): void => {
  if (typeof process === 'undefined' || process.type !== 'renderer') {
    return
  }
  try {
    // Lazy so this module stays importable from unit tests, which have no Electron.
    const { ipcRenderer } = require('electron')
    ipcRenderer?.send?.('setBackgroundThrottling', active)
  } catch (error) {
    // The publish itself must not fail because the window could not be asked to stay awake.
    void error
  }
}

/** `active` is whether `holder` currently has a timer that must fire on time. */
export const setRendererScheduling = (holder: string, active: boolean): void => {
  if (active) {
    holders.add(holder)
  } else {
    holders.delete(holder)
  }
  const isActive = holders.size > 0
  if (announced === isActive) {
    return
  }
  announced = isActive
  send(isActive)
}
