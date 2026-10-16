import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { getAppDataPath as getLegacyAppDataPath } from 'appdata-path'
import { APP_DATA_DIRECTORY_NAME, applyAppIdentity } from '@/appIdentity'

/**
 * Get the unified application data path
 * This fixes the Windows %APPDATA% redirect issue by using Electron's native API
 *
 * @param subDir - Optional subdirectory name within the user data path
 * @returns The application data path
 */
export const getUnifiedAppDataPath = (subDir?: string): string => {
  // Handle both main and renderer process
  const isRenderer = process.type === 'renderer'
  const electronApp = isRenderer ? require('@electron/remote').app : app

  // Safety net: never resolve a path before this app's own identity is applied, otherwise
  // electron-store and the SQLite file would be looked up in another application's directory.
  applyAppIdentity()

  // Use Electron's native API which handles Windows %APPDATA% redirection correctly
  let userDataPath: string
  if (electronApp && typeof electronApp.getPath === 'function') {
    userDataPath = electronApp.getPath('userData')
  } else {
    // CLI / pure Node.js environment (e.g. running TypeORM migrations): mirror what Electron
    // derives from the application name, so both resolve to the same directory.
    userDataPath = getLegacyAppDataPath(APP_DATA_DIRECTORY_NAME)
  }

  if (subDir) {
    return path.join(userDataPath, subDir)
  }

  return userDataPath
}

/**
 * Get the legacy path where data might have been stored
 * This is used for migration purposes only
 *
 * @param subDir - Optional subdirectory name
 * @returns The legacy application data path
 */
export const getLegacyDataPath = (subDir?: string): string => {
  try {
    return getLegacyAppDataPath(subDir || 'MQTTX')
  } catch (error) {
    console.warn('[AppDataPath] Failed to get legacy path:', error)
    // Fallback to Electron's native path if legacy method fails
    return getUnifiedAppDataPath(subDir)
  }
}

/**
 * Check if data migration is needed
 *
 * @param dbFileName - The database file name (default: 'MQTTX.db')
 * @returns Whether migration is needed and the paths involved
 */
export const checkMigrationNeeded = (
  dbFileName = 'MQTTX.db',
): {
  needed: boolean
  legacyPath?: string
  newPath?: string
  legacyDbPath?: string
  newDbPath?: string
} => {
  const newPath = getUnifiedAppDataPath()
  const legacyPath = getLegacyDataPath('MQTTX')

  // If paths are the same, no migration needed
  if (newPath === legacyPath) {
    return { needed: false }
  }

  const legacyDbPath = path.join(legacyPath, dbFileName)
  const newDbPath = path.join(newPath, dbFileName)

  // Check if legacy database exists but new one doesn't
  const legacyExists = fs.pathExistsSync(legacyDbPath)
  const newExists = fs.pathExistsSync(newDbPath)

  if (legacyExists && !newExists) {
    console.log('[AppDataPath] Migration needed:')
    console.log('  From:', legacyDbPath)
    console.log('  To:', newDbPath)
    return {
      needed: true,
      legacyPath,
      newPath,
      legacyDbPath,
      newDbPath,
    }
  }

  return { needed: false }
}

/**
 * Whether the destructive "copy everything from the legacy directory" migration is allowed.
 *
 * The migration was written for the Windows %APPDATA% redirect issue. Anywhere else it would
 * pick up the data directory of another installation (e.g. a second MQTTX build living next to
 * this one) and move it away, so it is opt-in.
 */
export const isLegacyMigrationEnabled = (): boolean =>
  process.platform === 'win32' || process.env.MQTTX_ENABLE_LEGACY_DATA_MIGRATION === '1'

/**
 * Absolute path of the *original* MQTTX data directory (used as the source of "import data").
 */
export const getOriginalAppDataPath = (): string => getLegacyDataPath('MQTTX')

/**
 * Migrate data from legacy path to new path
 *
 * @param dbFileName - The database file name (default: 'MQTTX.db')
 * @returns Success status and error message if failed
 */
export const migrateDataIfNeeded = async (
  dbFileName = 'MQTTX.db',
): Promise<{
  success: boolean
  migrated: boolean
  error?: string
}> => {
  try {
    // Safety guard: this legacy migration only exists for the Windows %APPDATA% redirect issue.
    // On every other platform (and for every custom build whose user data path differs from the
    // hard coded legacy path) it would silently hijack another installation's data directory,
    // so it must be opted in explicitly.
    if (!isLegacyMigrationEnabled()) {
      const migrationCheck = checkMigrationNeeded(dbFileName)
      if (migrationCheck.needed) {
        console.log(
          '[AppDataPath] Legacy data migration is disabled; skipping. ' +
            'Set MQTTX_ENABLE_LEGACY_DATA_MIGRATION=1 to enable it, ' +
            'or use the "import from MQTTX" action in Settings.',
        )
      }
      return { success: true, migrated: false }
    }

    const migrationCheck = checkMigrationNeeded(dbFileName)

    if (!migrationCheck.needed) {
      return { success: true, migrated: false }
    }

    const { legacyPath, newPath, legacyDbPath, newDbPath } = migrationCheck

    if (!legacyPath || !newPath || !legacyDbPath || !newDbPath) {
      return { success: true, migrated: false }
    }

    // Ensure new directory exists
    await fs.ensureDir(newPath)

    // Copy all files from legacy directory to new directory
    console.log('[AppDataPath] Starting data migration...')

    try {
      // Get all files in legacy directory
      const files = await fs.readdir(legacyPath)

      for (const file of files) {
        const srcFile = path.join(legacyPath, file)
        const destFile = path.join(newPath, file)

        // Skip if destination already exists
        if (await fs.pathExists(destFile)) {
          console.log(`[AppDataPath] Skipping ${file} (already exists in destination)`)
          continue
        }

        // Copy file or directory
        const stat = await fs.stat(srcFile)
        if (stat.isDirectory()) {
          await fs.copy(srcFile, destFile)
        } else {
          await fs.copyFile(srcFile, destFile)
        }
        console.log(`[AppDataPath] Migrated: ${file}`)
      }

      console.log('[AppDataPath] Data migration completed successfully')
      console.log(
        `[AppDataPath] Legacy directory kept untouched at: ${legacyPath} ` +
          '(never renamed: another installed MQTTX may still be using it)',
      )

      return { success: true, migrated: true }
    } catch (copyError) {
      console.error('[AppDataPath] Migration failed:', copyError)
      // If migration fails, we'll continue using the legacy path
      return {
        success: false,
        migrated: false,
        error: `Migration failed: ${copyError}`,
      }
    }
  } catch (error) {
    console.error('[AppDataPath] Error checking migration:', error)
    return {
      success: false,
      migrated: false,
      error: `Error checking migration: ${error}`,
    }
  }
}

/**
 * Ensure the app data directory exists
 *
 * @param dirPath - The directory path to ensure exists
 */
export const ensureAppDataDir = (dirPath: string): void => {
  try {
    if (!fs.pathExistsSync(dirPath)) {
      fs.mkdirpSync(dirPath)
    }
  } catch (err) {
    console.error('[AppDataPath] Failed to create app data directory:', err)
  }
}
