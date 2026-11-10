import 'reflect-metadata'
import { expect } from 'chai'
import { Connection, createConnection, EntitySchema, Repository } from 'typeorm'
import MessageService from '@/database/services/MessageService'
import MessageEntity from '@/database/models/MessageEntity'

const history = new EntitySchema<MessageEntity>({
  name: 'KeywordHistory',
  columns: {
    id: { type: String, primary: true },
    connectionId: { type: String },
    topic: { type: String },
    payload: { type: String },
    createAt: { type: String },
    out: { type: Boolean },
    meta: { type: String, nullable: true },
  },
})

const rows = [
  { id: 'set', topic: 'app/SN0106/device/system/post', payload: '{"cmd":"SET"}', createAt: '2026-01-01 00:00:00', meta: '' },
  {
    id: 'beat-1',
    topic: 'app/SN0106/device/heart/post',
    payload: '{"cmd":"HEARTBEAT","count":1}',
    createAt: '2026-01-01 00:00:01',
    meta: '',
  },
  {
    id: 'beat-2',
    topic: 'app/SN0106/device/heart/post',
    payload: '{"cmd":"heartbeat","count":2}',
    createAt: '2026-01-01 00:00:02',
    meta: '',
  },
  {
    id: 'agent',
    topic: 'app/SN0106/device/system/post',
    payload: '{"cmd":"PING"}',
    createAt: '2026-01-01 00:00:03',
    meta: '{"agent":true}',
  },
  {
    id: 'agent-beat',
    topic: 'app/SN0106/device/heart/post',
    payload: '{"cmd":"HEARTBEAT","from":"agent"}',
    createAt: '2026-01-01 00:00:06',
    meta: '{"agent":true}',
  },
  { id: 'percent', topic: 'app/SN0106/state', payload: '1000 items', createAt: '2026-01-01 00:00:04', meta: '' },
  { id: 'literal', topic: 'app/SN0106/state', payload: 'progress 100%', createAt: '2026-01-01 00:00:05', meta: '' },
]

describe('MessageService keyword filter', () => {
  let database: Connection
  let repository: Repository<MessageEntity>
  let service: MessageService

  before(async () => {
    database = await createConnection({
      name: 'message-keyword-test',
      type: 'sqlite',
      database: ':memory:',
      entities: [history],
      synchronize: true,
    })
    repository = database.getRepository(history)
    service = new MessageService(repository, {} as any)
    await repository.save(
      rows.map((row) => ({
        ...row,
        connectionId: 'connection',
        out: true,
      })),
    )
  })

  after(async () => {
    if (database) await database.close()
  })

  it('hides keyword matches in history, including a matching agent row, and keeps the totals', async () => {
    const result = await service.get('connection', {
      keywordFilter: { keywords: 'HEARTBEAT', mode: 'hide' },
      limit: 10,
    })
    expect(result.list.map((message) => message.id)).to.deep.equal(['set', 'agent', 'percent', 'literal'])
    expect(result.total).to.equal(rows.length)
    expect(result.publishedTotal).to.equal(rows.length)
  })

  it('keeps only matches when the mode is show, including a matching agent row', async () => {
    const result = await service.get('connection', {
      keywordFilter: { keywords: 'HEARTBEAT', mode: 'show' },
      limit: 10,
    })
    expect(result.list.map((message) => message.id)).to.deep.equal(['beat-1', 'beat-2', 'agent-beat'])
  })

  it('treats % as a literal character', async () => {
    const hidden = await service.get('connection', {
      keywordFilter: { keywords: '100%', mode: 'hide' },
      limit: 10,
    })
    expect(hidden.list.map((message) => message.id)).to.not.include('literal')
    expect(hidden.list.map((message) => message.id)).to.include('percent')
  })

  it('pages through history without filling the page with hidden rows', async () => {
    const result = await service.loadMore('connection', '2026-01-01 00:00:05', 'before', {
      keywordFilter: { keywords: 'HEARTBEAT', mode: 'hide' },
      limit: 2,
    })
    expect(result.list.map((message) => message.id)).to.deep.equal(['agent', 'percent'])
    expect(result.moreMsg).to.equal('before')
  })

  it('returns every row when the keyword list is empty', async () => {
    const result = await service.get('connection', {
      keywordFilter: { keywords: '  ', mode: 'hide' },
      limit: 10,
    })
    expect(result.list).to.have.lengthOf(rows.length)
  })
})
