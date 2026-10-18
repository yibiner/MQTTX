import { Service } from 'typedi'
import { InjectRepository } from 'typeorm-typedi-extensions'
import SubscriptionEntity from '@/database/models/SubscriptionEntity'
import { Repository } from 'typeorm'

@Service()
export default class SubscriptionService {
  constructor(
    // @ts-ignore - InjectRepository decorator typing from typeorm-typedi-extensions
    @InjectRepository(SubscriptionEntity)
    private subscriptionRepository: Repository<SubscriptionEntity>,
  ) {}

  /**
   * Reads the subscriptions of a connection.
   *
   * The `where` of a query builder is raw SQL, so it has to name the *column* (`connection_id`) -
   * the entity property `connectionId` only exists on the TypeScript side and made every call fail
   * with "no such column: connectionId". `find` maps the property for us.
   */
  public async getSubscriptions(connectionId: string) {
    return await this.subscriptionRepository.find({
      where: { connectionId },
      order: { createAt: 'DESC' },
    })
  }

  /**
   * Adds rows without touching the ones that already exist.
   *
   * The automatic subscriptions use this instead of read-modify-write through
   * `updateSubscriptions`, which deletes and re-inserts the whole list: a subscription the user adds
   * at the same moment would be lost by that write, while an insert of only the new rows cannot
   * drop anything.
   */
  public async addSubscriptions(connectionId: string, subs: SubscriptionModel[]) {
    const entities: Partial<SubscriptionEntity>[] = subs.map((sub) => ({
      ...sub,
      connectionId,
      userProperties: sub.userProperties ? JSON.stringify(sub.userProperties) : null,
    }))
    if (!entities.length) {
      return
    }
    await this.subscriptionRepository.insert(entities)
  }

  public async updateSubscriptions(connectionId: string, subs: SubscriptionModel[]) {
    const entities: Partial<SubscriptionEntity>[] = subs.map((sub) => ({
      ...sub,
      connectionId,
      userProperties: sub.userProperties ? JSON.stringify(sub.userProperties) : null,
    }))
    await this.subscriptionRepository.delete({ connectionId })
    await this.subscriptionRepository.save(entities)
  }
}
