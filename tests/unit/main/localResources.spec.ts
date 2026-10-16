import { expect } from 'chai'
import path from 'path'
import {
  CONFIG_FILE_NAME,
  DATABASE_FILE_NAME,
  LOCAL_RESOURCE_KEYS,
  LOG_DIRECTORY_NAME,
  getLocalResourcePaths,
  openLocalResource,
} from '@/main/localResources'

describe('local resources', () => {
  it('lists every resource inside this application data directory', () => {
    const resources = getLocalResourcePaths()

    expect(Object.keys(resources).sort()).to.deep.equal([...LOCAL_RESOURCE_KEYS].sort())
    expect(resources.data).to.equal('/mock/path')
    expect(resources.database).to.equal(path.join(resources.data, DATABASE_FILE_NAME))
    expect(resources.config).to.equal(path.join(resources.data, CONFIG_FILE_NAME))
    expect(resources.logs).to.equal(path.join(resources.data, LOG_DIRECTORY_NAME))
  })

  it('never resolves a resource outside the data directory of this app', () => {
    const resources = getLocalResourcePaths()

    Object.values(resources).forEach((resourcePath) => {
      expect(path.resolve(resourcePath).startsWith(path.resolve(resources.data))).to.equal(true)
    })
  })

  it('refuses to open anything but a known resource key', async () => {
    // The renderer sends a key, never a path, so a path (or any other string) must be rejected.
    const relativePath = await openLocalResource('../../etc/passwd')
    expect(relativePath.ok).to.equal(false)
    expect(relativePath.error).to.contain('Unknown local resource')

    const unknownKey = await openLocalResource('secrets')
    expect(unknownKey.ok).to.equal(false)
  })
})
