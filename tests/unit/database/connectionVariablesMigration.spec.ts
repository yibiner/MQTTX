import 'reflect-metadata'
import { expect } from 'chai'
import { createConnection } from 'typeorm'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { connectionVariables1792001000002 } from '@/database/migration/1792001000002-connectionVariables'

/**
 * The migration of the client variables runs against the real SQLite engine of the app: it only
 * needs the table the column is added to, so the test creates that shape instead of replaying
 * every migration of the project.
 */
describe('connection variables migration', () => {
  const columns = async (query: (sql: string) => Promise<any[]>): Promise<string[]> =>
    (await query(`PRAGMA table_info("ConnectionEntity")`)).map((column: any) => column.name)

  it('adds the variables column and removes it again', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mqttx-migration-test-'))
    const connection = await createConnection({
      name: 'connectionVariablesMigration',
      type: 'sqlite',
      database: path.join(directory, 'migration.db'),
      entities: [],
      migrations: [connectionVariables1792001000002],
      migrationsRun: false,
    })
    try {
      await connection.query(`CREATE TABLE "ConnectionEntity" ("id" varchar PRIMARY KEY NOT NULL)`)
      await connection.runMigrations()
      expect(await columns((sql) => connection.query(sql))).to.include('variables')

      await connection.undoLastMigration()
      expect(await columns((sql) => connection.query(sql))).to.not.include('variables')
    } finally {
      if (connection.isConnected) {
        await connection.close()
      }
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
