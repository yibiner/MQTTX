import { app } from 'electron'
import path from 'path'
import { name, description, bundleId, repository } from '../app.identity.json'

/**
 * Single source of truth for this application's identity.
 *
 * The values live in `app.identity.json` because electron-builder (vue.config.js, plain Node.js)
 * has to read the very same product name and bundle id that the running app uses. Renaming the app
 * therefore means editing one file, not four.
 */
export const APP_NAME: string = name
export const APP_DESCRIPTION: string = description
export const APP_BUNDLE_ID: string = bundleId
export const APP_REPOSITORY_URL: string = repository

/**
 * Name of the directory inside the OS application data folder ("~/Library/Application Support" on
 * macOS, "%APPDATA%" on Windows, "$XDG_CONFIG_HOME" on Linux).
 *
 * Derived from the product name, so the data of this build can never end up in the directory of
 * the official MQTTX ("<appData>/MQTTX") or of any other build.
 */
export const APP_DATA_DIRECTORY_NAME: string = APP_NAME

let identityApplied = false

/**
 * Applies the name and the user data directory this app must use.
 *
 * Must run before anything reads `app.getPath('userData')` (logger, electron-store, the SQLite
 * path) because electron-store resolves its file at construction time. `background.ts` therefore
 * imports this module before every other import; the function is idempotent and safe to call again.
 */
export const applyAppIdentity = (): void => {
  if (identityApplied) {
    return
  }
  identityApplied = true

  try {
    // The renderer (which only has @electron/remote) and the unit tests' electron mock do not
    // expose setName/setPath: the main process has already applied the identity by then.
    if (!app || typeof app.setName !== 'function' || typeof app.setPath !== 'function') {
      return
    }

    app.setName(APP_NAME)

    if (typeof app.getPath === 'function') {
      const appDataPath = app.getPath('appData')
      if (appDataPath) {
        const userDataPath = path.join(appDataPath, APP_DATA_DIRECTORY_NAME)
        app.setPath('userData', userDataPath)
        console.log(`[Identity] ${APP_NAME} (${APP_BUNDLE_ID}) uses user data at ${userDataPath}`)
      }
    }
  } catch (error) {
    console.warn('[Identity] Could not apply the application identity:', error)
  }
}

// Keep the identity applied as soon as this module is evaluated, so an import order mistake in one
// entry point cannot silently move this app's data into another application's directory.
applyAppIdentity()
