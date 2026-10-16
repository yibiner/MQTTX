import fs from 'fs-extra'
import path from 'path'
import { app } from 'electron'
import { getUnifiedAppDataPath, getOriginalAppDataPath } from './appDataPath'

/**
 * "Import data from the original MQTTX" support.
 *
 * The import must not touch the database while this process has it open, so the renderer only
 * drops a marker file; the actual copy happens at the beginning of the next startup, before the
 * SQLite connection is created.
 */
const IMPORT_MARKER_FILE = '.mqttx-import-pending'

const IMPORTABLE_FILES = ['MQTTX.db', 'config.json']

const getImportMarkerPath = (): string => path.join(getUnifiedAppDataPath('MQTTX'), IMPORT_MARKER_FILE)

/** True when both paths point at the very same file (the target may not exist yet). */
const isSameFile = (source: string, target: string): boolean => {
  try {
    return fs.realpathSync(source) === fs.realpathSync(target)
  } catch (error) {
    return path.resolve(source) === path.resolve(target)
  }
}

export interface ImportRequestResult {
  ok: boolean
  /** reason code for the renderer, so it can translate the message itself */
  reason?: 'no-original-data' | 'already-pending'
  sourcePath: string
  targetPath: string
}

/**
 * Marks the original MQTTX data directory as the source of the next startup import.
 */
export const requestImportFromOriginal = (): ImportRequestResult => {
  const sourcePath = getOriginalAppDataPath()
  const targetPath = getUnifiedAppDataPath('MQTTX')
  const sourceDb = path.join(sourcePath, 'MQTTX.db')

  if (!fs.pathExistsSync(sourceDb)) {
    return { ok: false, reason: 'no-original-data', sourcePath, targetPath }
  }

  fs.ensureDirSync(targetPath)
  const markerPath = getImportMarkerPath()
  if (fs.pathExistsSync(markerPath)) {
    return { ok: false, reason: 'already-pending', sourcePath, targetPath }
  }

  fs.writeFileSync(
    markerPath,
    JSON.stringify({ sourcePath, targetPath, requestedAt: new Date().toISOString() }, null, 2),
  )
  console.log(`[Import] Queued data import from ${sourcePath}`)
  return { ok: true, sourcePath, targetPath }
}

/**
 * Applies a previously requested import. Must run before the database connection is created.
 * Existing files are backed up next to the new ones, and the original directory is only ever read.
 */
export const applyPendingImport = (): void => {
  const markerPath = getImportMarkerPath()
  if (!fs.pathExistsSync(markerPath)) {
    return
  }

  let sourcePath = getOriginalAppDataPath()
  try {
    const pending = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    if (pending && typeof pending.sourcePath === 'string' && pending.sourcePath) {
      sourcePath = pending.sourcePath
    }
  } catch (error) {
    console.warn('[Import] Could not read the pending import marker, using the default source:', error)
  }

  const targetPath = getUnifiedAppDataPath('MQTTX')
  const timestamp = Date.now()

  try {
    fs.ensureDirSync(targetPath)
    for (const fileName of IMPORTABLE_FILES) {
      const source = path.join(sourcePath, fileName)
      if (!fs.pathExistsSync(source)) {
        console.log(`[Import] Skipped ${fileName}: not found in ${sourcePath}`)
        continue
      }
      const target = path.join(targetPath, fileName)
      if (isSameFile(source, target)) {
        // Dev builds share the data directory with the "original" installation: there is nothing
        // to import (and copying a file onto itself only produced a useless backup).
        console.log(`[Import] Skipped ${fileName}: source and target are the same file`)
        continue
      }
      if (fs.pathExistsSync(target)) {
        fs.copyFileSync(target, `${target}.bak-${timestamp}`)
      }
      fs.copyFileSync(source, target)
      console.log(`[Import] Imported ${fileName} from ${sourcePath}`)
    }

    // A database copied from a running MQTTX may leave sidecar files behind; they belong to the
    // previous database and must not be replayed on top of the imported one. A stale `-journal`
    // can even be rolled back into the freshly imported file.
    for (const suffix of ['-wal', '-shm', '-journal']) {
      const sidecar = path.join(targetPath, `MQTTX.db${suffix}`)
      if (fs.pathExistsSync(sidecar)) {
        fs.removeSync(sidecar)
      }
    }

    // Make the imported app settings effective right away instead of on the next launch.
    const importedConfig = path.join(targetPath, 'config.json')
    if (fs.pathExistsSync(importedConfig)) {
      try {
        const Store = require('electron-store')
        new Store().store = JSON.parse(fs.readFileSync(importedConfig, 'utf8'))
      } catch (configError) {
        console.warn('[Import] Imported config.json will be applied on the next launch:', configError)
      }
    }

    console.log('[Import] Import finished. The original data directory was left untouched.')
  } catch (error) {
    console.error('[Import] Data import failed:', error)
  } finally {
    try {
      fs.removeSync(markerPath)
    } catch (error) {
      console.warn('[Import] Could not remove the import marker:', error)
    }
  }
}

/** Used by the renderer to show where the data is read from and written to. */
export const getImportPaths = (): { sourcePath: string; targetPath: string; sourceAvailable: boolean } => {
  const sourcePath = getOriginalAppDataPath()
  return {
    sourcePath,
    targetPath: getUnifiedAppDataPath('MQTTX'),
    sourceAvailable: fs.pathExistsSync(path.join(sourcePath, 'MQTTX.db')),
  }
}

export const getAppName = (): string => app.getName()
