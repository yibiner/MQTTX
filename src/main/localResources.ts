import fs from 'fs-extra'
import path from 'path'
import { shell } from 'electron'
import { getUnifiedAppDataPath } from './appDataPath'

/**
 * Everything this app stores on the machine lives inside its own data directory (see
 * `appIdentity.ts`), so the About view can describe it with a fixed, well known list.
 *
 * The file names are the ones the rest of the app uses: `database.config.ts` creates
 * `MQTTX.db`, electron-store creates `config.json` and `utils/logger.ts` writes into `logs`.
 */
export const DATABASE_FILE_NAME = 'MQTTX.db'
export const CONFIG_FILE_NAME = 'config.json'
export const LOG_DIRECTORY_NAME = 'logs'

export const LOCAL_RESOURCE_KEYS = ['data', 'database', 'config', 'logs'] as const

export type LocalResourceKey = typeof LOCAL_RESOURCE_KEYS[number]

/** Resources that are directories: opening them shows their content. */
const DIRECTORY_KEYS: readonly LocalResourceKey[] = ['data', 'logs']

const isLocalResourceKey = (key: string): key is LocalResourceKey =>
  (LOCAL_RESOURCE_KEYS as readonly string[]).includes(key)

/**
 * Absolute paths of the local resources, resolved in the main process only. The renderer asks for
 * these paths instead of building them, so both sides can never disagree about the data directory.
 */
export const getLocalResourcePaths = (): Record<LocalResourceKey, string> => {
  const dataPath = getUnifiedAppDataPath()

  return {
    data: dataPath,
    database: path.join(dataPath, DATABASE_FILE_NAME),
    config: path.join(dataPath, CONFIG_FILE_NAME),
    logs: path.join(dataPath, LOG_DIRECTORY_NAME),
  }
}

/**
 * Opens one of the resources above with the file manager: directories are opened, files are
 * revealed in their folder (opening a database file with the default application is not useful).
 *
 * Only the known keys are accepted -- the renderer sends a key, never a path, so it cannot ask the
 * main process to open an arbitrary location.
 */
export const openLocalResource = async (key: string): Promise<{ ok: boolean; error?: string }> => {
  if (!isLocalResourceKey(key)) {
    return { ok: false, error: `Unknown local resource: ${key}` }
  }

  const resourcePath = getLocalResourcePaths()[key]

  try {
    if (DIRECTORY_KEYS.includes(key)) {
      // The log directory may not exist yet on a freshly installed app.
      await fs.ensureDir(resourcePath)
      const openError = await shell.openPath(resourcePath)
      return openError ? { ok: false, error: openError } : { ok: true }
    }

    if (!(await fs.pathExists(resourcePath))) {
      return { ok: false, error: `${resourcePath} does not exist` }
    }

    shell.showItemInFolder(resourcePath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}
