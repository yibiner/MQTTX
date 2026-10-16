import 'reflect-metadata'
import { expect } from 'chai'
import moment from 'moment'
import { Connection, createConnection, Repository } from 'typeorm'
import HistoryMessageHeaderEntity from '@/database/models/HistoryMessageHeaderEntity'
import HistoryMessageHeaderService from '@/database/services/HistoryMessageHeaderService'

/**
 * Covers the SQL that replaced the "load the whole publish history into the renderer" lookups:
 * the matching record is now found by the database, and the eviction order is decided there too.
 */
describe('HistoryMessageHeaderService (SQLite)', () => {
  let database: Connection
  let repository: Repository<HistoryMessageHeaderEntity>
  let service: HistoryMessageHeaderService

  const save = (overrides: Partial<HistoryMessageHeaderEntity> = {}) =>
    repository.save({
      topic: 'plant/line1/temp',
      qos: 0 as QoS,
      retain: false,
      payload: '{"value":1}',
      payloadType: 'JSON',
      createAt: '2026-10-16 15:20:00:100',
      ...overrides,
    })

  /** The stored text, as the ordering and the eviction SQL see it (entities hydrate a Date). */
  const rawCreateAt = async (id: string): Promise<string | undefined> => {
    const rows = await repository.query(`SELECT "createAt" FROM "historyMessageHeaderEntity" WHERE "id" = ?`, [id])
    return rows[0]?.createAt
  }

  /** Inserts a row with the exact stored timestamp text (no driver conversion). */
  const insertRaw = (id: string, createAt: string, topic = 'plant/line1/temp') =>
    repository.query(
      `INSERT INTO "historyMessageHeaderEntity" ("id", "retain", "topic", "qos", "payload", "payloadType", "createAt")
       VALUES (?, 0, ?, '0', NULL, NULL, ?)`,
      [id, topic, createAt],
    )

  const header = (overrides: Partial<HistoryMessageHeaderModel> = {}) =>
    ({
      topic: 'plant/line1/temp',
      qos: 0,
      retain: false,
      payload: '{"value":1}',
      payloadType: 'JSON',
      ...overrides,
    } as HistoryMessageHeaderModel)

  before(async () => {
    database = await createConnection({
      name: 'history-header-test',
      type: 'sqlite',
      database: ':memory:',
      entities: [HistoryMessageHeaderEntity],
      synchronize: true,
    })
    repository = database.getRepository(HistoryMessageHeaderEntity)
    service = new HistoryMessageHeaderService(repository)
  })

  after(async () => {
    if (database.isConnected) {
      await database.close()
    }
  })

  beforeEach(async () => {
    await repository.clear()
  })

  describe('findMatchingId', () => {
    it('matches on topic, qos, retain, payload and payload type', async () => {
      const saved = await save()

      expect(await service.findMatchingId(header())).to.equal(saved.id)
      // Same topic, different message.
      expect(await service.findMatchingId(header({ payload: '{"value":2}' }))).to.equal(null)
      // Same message, different header parts.
      expect(await service.findMatchingId(header({ qos: 1 }))).to.equal(null)
      expect(await service.findMatchingId(header({ retain: true }))).to.equal(null)
      expect(await service.findMatchingId(header({ topic: 'plant/line2/temp' }))).to.equal(null)
      expect(await service.findMatchingId(header({ payloadType: 'Plaintext' }))).to.equal(null)
    })

    it('compares every qos value and the retain flag (stored as text / 0-1)', async () => {
      const qos1 = await save({ qos: 1 as QoS, retain: true, topic: 't/qos1' })
      const qos2 = await save({ qos: 2 as QoS, retain: true, topic: 't/qos2' })

      expect(await service.findMatchingId(header({ topic: 't/qos1', qos: 1, retain: true }))).to.equal(qos1.id)
      expect(await service.findMatchingId(header({ topic: 't/qos2', qos: 2, retain: true }))).to.equal(qos2.id)
      expect(await service.findMatchingId(header({ topic: 't/qos1', qos: 2, retain: true }))).to.equal(null)
    })

    it('matches header parts only when the message is not compared', async () => {
      const saved = await save()

      expect(
        await service.findMatchingId(header({ payload: 'other payload', payloadType: 'Plaintext' }), false),
      ).to.equal(saved.id)
      expect(await service.findMatchingId(header({ topic: 'plant/line9/temp' }), false)).to.equal(null)
    })

    it('handles records without a stored message (legacy / save-message disabled)', async () => {
      const saved = await save({ payload: null, payloadType: null })

      expect(await service.findMatchingId(header({ payload: null, payloadType: null }))).to.equal(saved.id)
      // A missing payload must not be considered equal to a real one.
      expect(await service.findMatchingId(header())).to.equal(null)
    })
  })

  describe('create', () => {
    it('stores createAt exactly like updateCreateAt (UTC with millisecond precision)', async () => {
      const created = await service.create(header() as HistoryMessageHeaderModel)
      const createdRaw = await rawCreateAt(created?.id as string)

      // TypeORM normalizes a datetime column to "YYYY-MM-DD HH:MM:SS.mmm" in UTC; the column
      // default used to store "YYYY-MM-DD HH:MM:SS" instead, which is what broke the text order.
      expect(createdRaw).to.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
      expect(Math.abs(moment.utc(createdRaw, 'YYYY-MM-DD HH:mm:ss.SSS').valueOf() - Date.now())).to.be.lessThan(60_000)

      await service.updateCreateAt(created?.id as string)
      const bumpedRaw = await rawCreateAt(created?.id as string)
      expect(bumpedRaw).to.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
      // Same shape as the freshly created value: the two fields compare correctly as text.
      expect(bumpedRaw).to.have.length((createdRaw as string).length)
    })
  })

  describe('getAll / trim', () => {
    it('returns records oldest first and evicts the oldest ones', async () => {
      for (let position = 0; position < 5; position += 1) {
        await save({ topic: `t/${position}`, createAt: `2026-10-1${position} 10:00:00:000` })
      }

      expect((await service.getAll())?.map((record) => record.topic)).to.deep.equal(['t/0', 't/1', 't/2', 't/3', 't/4'])
      expect(await service.trim(2)).to.equal(3)
      expect((await service.getAll())?.map((record) => record.topic)).to.deep.equal(['t/3', 't/4'])
      // Nothing left to remove.
      expect(await service.trim(2)).to.equal(0)
    })

    it('orders records written in the same millisecond deterministically', async () => {
      await save({ id: 'aaaa', topic: 't/a', createAt: '2026-10-16 10:00:00:000' })
      await save({ id: 'bbbb', topic: 't/b', createAt: '2026-10-16 10:00:00:000' })

      const first = (await service.getAll())?.map((record) => record.id)
      const second = (await service.getAll())?.map((record) => record.id)
      expect(first).to.deep.equal(['aaaa', 'bbbb'])
      expect(second).to.deep.equal(first)

      // The eviction follows the same order, so it never removes a record at random.
      expect(await service.trim(1)).to.equal(1)
      expect((await service.getAll())?.map((record) => record.id)).to.deep.equal(['bbbb'])
    })
  })

  describe('legacy rows written by the column default', () => {
    it('still sort before later second-precision records', async () => {
      // Format used before the fix: UTC, second precision, 19 characters.
      await insertRaw('legacy-row', '2026-10-16 08:30:47', 't/legacy')
      // A record re-sent in that same second carries milliseconds and sorted after it.
      await insertRaw('bumped-row', '2026-10-16 08:30:47.500', 't/bumped')
      await insertRaw('later-row', '2026-10-16 08:30:48', 't/later')

      expect((await service.getAll())?.map((record) => record.id)).to.deep.equal([
        'legacy-row',
        'bumped-row',
        'later-row',
      ])
      expect(await service.trim(1)).to.equal(2)
      expect((await service.getAll())?.map((record) => record.id)).to.deep.equal(['later-row'])
    })
  })
})
