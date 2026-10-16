import { Service } from 'typedi'
import { InjectRepository } from 'typeorm-typedi-extensions'
import { Repository } from 'typeorm'
import time from '../../utils/time'
import { DEFAULT_HISTORY_MAX_COUNT } from '../../utils/data'
import HistoryMessageHeaderEntity from '../models/HistoryMessageHeaderEntity'

@Service()
export default class HistoryMessageHeaderService {
  constructor(
    // @ts-ignore - InjectRepository decorator typing from typeorm-typedi-extensions
    @InjectRepository(HistoryMessageHeaderEntity)
    private messageRepository: Repository<HistoryMessageHeaderEntity>,
  ) {}

  public async getAll(): Promise<HistoryMessageHeaderModel[] | undefined> {
    const query: HistoryMessageHeaderEntity[] | undefined = await this.messageRepository
      .createQueryBuilder('pld')
      .addOrderBy('createAt', 'ASC')
      // Records written within the same millisecond would otherwise come back in an arbitrary
      // order, which both the publish panel and the eviction below rely on being stable.
      .addOrderBy('id', 'ASC')
      .getMany()
    if (!query) {
      return
    }
    return query
  }

  /**
   * Id of the stored record matching the given one, or null when it is not stored yet.
   *
   * The comparison runs in SQL because publishing must not load the whole history (payloads
   * included) into the renderer, which is what the previous implementation did on every send.
   * The `CAST(...)` calls keep the comparison independent of how SQLite stored the value
   * (qos lives in a text column such as '0', retain holds 0/1).
   */
  public async findMatchingId(data: HistoryMessageHeaderModel, matchMessage = true): Promise<string | null> {
    const query = this.messageRepository
      .createQueryBuilder('h')
      .select('h.id', 'id')
      .where('h.topic = :topic', { topic: data.topic })
      .andWhere('CAST(h.qos AS TEXT) = :qos', { qos: String(data.qos) })
      .andWhere('CAST(h.retain AS INTEGER) = :retain', { retain: data.retain ? 1 : 0 })

    if (matchMessage) {
      // `IS` instead of `=`: a missing payload on both sides must still match (legacy records).
      query
        .andWhere('h.payload IS :payload', { payload: data.payload ?? null })
        .andWhere('h.payloadType IS :payloadType', { payloadType: data.payloadType ?? null })
    }

    const row = await query.orderBy('h.createAt', 'ASC').addOrderBy('h.id', 'ASC').limit(1).getRawOne<{ id: string }>()

    return row?.id ?? null
  }

  public async delete(id: string): Promise<HistoryMessageHeaderModel | undefined> {
    const query = await this.messageRepository.findOne(id)
    if (!query) {
      return
    }
    return await this.messageRepository.remove(query)
  }

  public async updateCreateAt(id: string): Promise<HistoryMessageHeaderModel | undefined> {
    const query: HistoryMessageHeaderEntity | undefined = await this.messageRepository.findOne(id)
    if (!query) {
      return
    }
    return await this.messageRepository.save({ ...query, createAt: time.getNowDate() })
  }

  public async create(data: HistoryMessageHeaderModel): Promise<HistoryMessageHeaderModel | undefined> {
    // Always write createAt through the same path as updateCreateAt() (TypeORM turns the local
    // string into UTC with millisecond precision). Leaving it to the column default stored
    // SQLite's CURRENT_TIMESTAMP instead: UTC with *second* precision, so a record created later
    // in a second ("...08:30:47") sorted before an older record that was re-sent in that second
    // ("...08:30:47.500") -- and that older record is the one trim() then kept.
    return await this.messageRepository.save({ ...data, createAt: data.createAt ?? time.getNowDate() })
  }

  /**
   * Keeps only the newest `maxCount` records (the user configures this in Settings).
   * @returns how many records were removed
   */
  public async trim(maxCount: number = DEFAULT_HISTORY_MAX_COUNT): Promise<number> {
    const total = await this.messageRepository.count()
    if (total <= maxCount) {
      return 0
    }
    const removeCount = total - maxCount
    // Only the ids are loaded (never the payloads) and the removal is a single statement:
    // repository.remove() emits one DELETE per entity, which is what made trimming expensive.
    const oldest = await this.messageRepository.find({
      select: ['id'],
      order: {
        createAt: 'ASC',
        // Deterministic tiebreaker, so records with the same timestamp are not evicted at random.
        id: 'ASC',
      },
      take: removeCount,
    })
    if (!oldest.length) {
      return 0
    }
    await this.messageRepository.delete(oldest.map((record) => record.id))
    return oldest.length
  }

  public async clean(): Promise<HistoryMessageHeaderModel[] | undefined> {
    const query: HistoryMessageHeaderEntity[] | undefined = await this.messageRepository.find()
    if (!query) {
      return
    }
    return await this.messageRepository.remove(query)
  }
}
