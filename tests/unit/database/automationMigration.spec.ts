import 'reflect-metadata'
import { expect } from 'chai'
import { createConnection } from 'typeorm'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { autoSubscribeAndReply1792001000003 } from '@/database/migration/1792001000003-autoSubscribeAndReply'

/**
 * The two automation columns are added to an existing connection table, so the migration is checked
 * against the real SQLite engine: a database with only that table must come out with both columns,
 * and undoing it must leave the table as it was.
 */
describe('automatic subscriptions and replies migration', () => {
  const columns = async (query: (sql: string) => Promise<any[]>): Promise<string[]> =>
    (await query(`PRAGMA table_info("ConnectionEntity")`)).map((column: any) => column.name)

  it('adds both columns and removes them again', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mqttx-automation-migration-test-'))
    const connection = await createConnection({
      name: 'automationMigration',
      type: 'sqlite',
      database: path.join(directory, 'migration.db'),
      entities: [],
      migrations: [autoSubscribeAndReply1792001000003],
      migrationsRun: false,
    })
    try {
      await connection.query(`CREATE TABLE "ConnectionEntity" ("id" varchar PRIMARY KEY NOT NULL)`)
      await connection.runMigrations()
      const afterUp = await columns((sql) => connection.query(sql))
      expect(afterUp).to.include('autoSubscriptions')
      expect(afterUp).to.include('autoReplies')

      // Columns are nullable with a default of NULL, so existing connections keep working.
      await connection.query(`INSERT INTO "ConnectionEntity" ("id") VALUES ('legacy')`)
      const [legacy] = await connection.query('SELECT * FROM "ConnectionEntity" WHERE id = ?', ['legacy'])
      expect(legacy.autoSubscriptions).to.equal(null)
      expect(legacy.autoReplies).to.equal(null)

      await connection.undoLastMigration()
      const afterDown = await columns((sql) => connection.query(sql))
      expect(afterDown).to.not.include('autoSubscriptions')
      expect(afterDown).to.not.include('autoReplies')
    } finally {
      if (connection.isConnected) {
        await connection.close()
      }
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
