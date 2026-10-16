import { expect } from 'chai'
import fs from 'fs-extra'
import path from 'path'
import { APP_BUNDLE_ID, APP_DATA_DIRECTORY_NAME, APP_NAME, APP_REPOSITORY_URL, applyAppIdentity } from '@/appIdentity'
import { getOriginalAppDataPath, getUnifiedAppDataPath } from '@/main/appDataPath'

// Plain Node.js view of the same file the app and electron-builder read.
const identity = require('../../app.identity.json')
const packageJson = require('../../package.json')
// Read as text on purpose: requiring vue.config.js would pull the webpack/monaco toolchain into the
// test bundle, and all we need to verify is that it takes its values from app.identity.json.
// mocha-webpack runs with the repository root as the working directory (__dirname is not usable
// inside the bundle).
const vueConfig = fs.readFileSync(path.join(process.cwd(), 'vue.config.js'), 'utf8')

// Product name of the official MQTTX release; this build must never use its directory.
const OFFICIAL_APP_NAME = 'MQTTX'

describe('app identity', () => {
  it('is the same in app.identity.json, in the app and in the build configuration', () => {
    expect(APP_NAME).to.equal(identity.name)
    expect(APP_BUNDLE_ID).to.equal(identity.bundleId)
    expect(APP_REPOSITORY_URL).to.equal(identity.repository)

    expect(vueConfig).to.contain("require('./app.identity.json')")
    expect(vueConfig).to.contain('appId: identity.bundleId')
    expect(vueConfig).to.contain('productName: identity.name')
    // The previous "dev edition" identity must not come back.
    expect(vueConfig).to.not.contain('com.mqttx.dev')
    expect(vueConfig).to.not.contain('MQTTX Dev')
  })

  it('names the package after the repository and keeps the product description in sync', () => {
    expect(packageJson.name).to.equal('mqttx-plus')
    expect(packageJson.description).to.equal(identity.description)
    expect(packageJson.repository).to.equal(APP_REPOSITORY_URL)
  })

  it('uses a data directory of its own, never the one of the official MQTTX', () => {
    expect(APP_DATA_DIRECTORY_NAME).to.equal(APP_NAME)
    expect(APP_DATA_DIRECTORY_NAME).to.not.equal(OFFICIAL_APP_NAME)
    expect(APP_DATA_DIRECTORY_NAME.toLowerCase()).to.not.equal(OFFICIAL_APP_NAME.toLowerCase())
  })

  it('applies the identity without throwing where electron has no setName/setPath (renderer, tests)', () => {
    expect(() => applyAppIdentity()).to.not.throw()
  })

  it('resolves the application data path from electron, with optional subdirectories', () => {
    expect(getUnifiedAppDataPath()).to.equal('/mock/path')
    expect(getUnifiedAppDataPath('logs')).to.equal('/mock/path/logs')
  })

  it('keeps the import feature pointed at the official MQTTX directory', () => {
    // A different directory than the one this app writes to, so importing never mixes the two.
    expect(getOriginalAppDataPath()).to.match(new RegExp(`${OFFICIAL_APP_NAME}$`))
    expect(getOriginalAppDataPath()).to.not.equal(getUnifiedAppDataPath())
  })
})
