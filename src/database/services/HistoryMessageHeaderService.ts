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
      .getMany()
    if (!query) {
      return
    }
    return query
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
    return await this.messageRepository.save(data)
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
    const oldest = await this.messageRepository.find({
      order: {
        createAt: 'ASC',
      },
      take: total - maxCount,
    })
    if (!oldest.length) {
      return 0
    }
    await this.messageRepository.remove(oldest)
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
