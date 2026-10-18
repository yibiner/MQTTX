import 'reflect-metadata'
import { expect } from 'chai'
import { createConnection } from 'typeorm'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { subscriptionAutoSubscribed1792001000004 } from '@/database/migration/1792001000004-subscriptionAutoSubscribed'

/**
 * The badge of an automatic subscription lives in the subscription table, so an existing database has
 * to gain the column. Checked against the real SQLite engine: legacy rows must end up as NULL ("not
 * automatic") and undoing the migration must remove the column again.
 */
describe('subscription auto-subscribed marker migration', () => {
  const columns = async (query: (sql: string) => Promise<any[]>): Promise<string[]> =>
    (await query(`PRAGMA table_info("SubscriptionEntity")`)).map((column: any) => column.name)

  it('adds the column as nullable and removes it again', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mqttx-sub-badge-migration-test-'))
    const connection = await createConnection({
      name: 'subscriptionAutoSubscribedMigration',
      type: 'sqlite',
      database: path.join(directory, 'migration.db'),
      entities: [],
      migrations: [subscriptionAutoSubscribed1792001000004],
      migrationsRun: false,
    })
    try {
      await connection.query(
        `CREATE TABLE "SubscriptionEntity" ("id" varchar PRIMARY KEY NOT NULL, "topic" varchar NOT NULL)`,
      )
      await connection.query(`INSERT INTO "SubscriptionEntity" ("id", "topic") VALUES ('old', 'a/b')`)
      await connection.runMigrations()
      expect(await columns((sql) => connection.query(sql))).to.include('autoSubscribed')

      const [legacy] = await connection.query('SELECT * FROM "SubscriptionEntity" WHERE id = ?', ['old'])
      expect(legacy.autoSubscribed).to.equal(null)

      await connection.undoLastMigration()
      expect(await columns((sql) => connection.query(sql))).to.not.include('autoSubscribed')
    } finally {
      if (connection.isConnected) {
        await connection.close()
      }
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
