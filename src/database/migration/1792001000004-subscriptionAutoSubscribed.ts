import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Remembers that a subscription was created by the automatic subscriptions of a connection.
 *
 * The panel marks those rows so the user can tell them apart from the ones subscribed by hand. The
 * flag is dropped as soon as the user touches the row (or the topic is subscribed another way), so a
 * row is only ever marked for "the automation subscribed this and nobody has looked at it yet".
 * Legacy rows are `null`, i.e. not automatic.
 */
export class subscriptionAutoSubscribed1792001000004 implements MigrationInterface {
  name = 'subscriptionAutoSubscribed1792001000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "SubscriptionEntity" ADD COLUMN "autoSubscribed" boolean`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "SubscriptionEntity" DROP COLUMN "autoSubscribed"`)
  }
}
