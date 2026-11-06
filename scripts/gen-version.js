// Keeps `src/version.ts` in step with package.json, so the number shown in the app, the local
// agent and the artifact file names always come from a single place.
//
// Two numbers, on purpose:
//   - `version` tracks the upstream MQTTX release this fork is based on (1.13.1), so rebasing onto
//     a newer upstream release needs no renumbering of our own;
//   - `mqttxPlusVersion` identifies our build (2026.11.06.1 = year.month.day.nth build that day).
//
// `node scripts/gen-version.js` only copies package.json into src/version.ts. Dev startup uses
// that, so opening the app does not burn a build number.
// `node scripts/gen-version.js --bump` advances the build number, writes it back to package.json,
// then regenerates src/version.ts. The packaging scripts pass --bump.
const fs = require('fs')
const path = require('path')

const packageJsonPath = path.resolve(__dirname, '../package.json')
const versionTsPath = path.resolve(__dirname, '../src/version.ts')

/** `2026.11.06` from a local date. The day boundary follows the machine clock. */
const dayStamp = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}`
}

/**
 * Next Plus build number. A number from today grows by one. Anything else, including another
 * day or a blank value, starts again at `.1`.
 */
const nextPlusVersion = (current, now = new Date()) => {
  const today = dayStamp(now)
  const match = /^(\d{4}\.\d{2}\.\d{2})\.(\d+)$/.exec(String(current || ''))
  if (match && match[1] === today) {
    return `${today}.${Number(match[2]) + 1}`
  }
  return `${today}.1`
}

const readPackageJson = () => JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

const writePlusVersion = (plusVersion) => {
  const raw = fs.readFileSync(packageJsonPath, 'utf8')
  const next = raw.replace(/"mqttxPlusVersion":\s*"[^"]*"/, `"mqttxPlusVersion": "${plusVersion}"`)
  if (next === raw) {
    throw new Error('package.json is missing mqttxPlusVersion')
  }
  fs.writeFileSync(packageJsonPath, next)
}

const quote = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const writeVersionTs = (version, plusVersion) => {
  const fullVersion = plusVersion ? `${version}+${plusVersion}` : version
  fs.writeFileSync(
    versionTsPath,
    [
      '/** Upstream MQTTX version this build is based on. Generated from package.json. */',
      `export default '${quote(version)}'`,
      '',
      '/** MQTTX Plus build number: year.month.day.nth build that day. */',
      `export const mqttxPlusVersion = '${quote(plusVersion)}'`,
      '',
      '/** Upstream version and Plus build, the same pair used in installer file names. */',
      `export const fullVersion = '${quote(fullVersion)}'`,
      '',
    ].join('\n'),
  )
}

const main = () => {
  const bump = process.argv.includes('--bump')
  const pkg = readPackageJson()
  const plusVersion = bump ? nextPlusVersion(pkg.mqttxPlusVersion) : pkg.mqttxPlusVersion || ''
  if (bump) {
    writePlusVersion(plusVersion)
  }
  writeVersionTs(pkg.version, plusVersion)
}

if (require.main === module) {
  main()
}

module.exports = { dayStamp, nextPlusVersion }
