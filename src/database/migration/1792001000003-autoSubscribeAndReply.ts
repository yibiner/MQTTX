import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Two automation features of a connection, both stored as JSON text:
 *
 * - `autoSubscriptions`: topics subscribed automatically after the connection is established, one
 *   group per delay, so a device can be simulated that comes online and starts listening a moment
 *   later. Topics may reference payload variables.
 * - `autoReplies`: rules that answer a received message (matched by topic filter and a JMESPath
 *   condition) without writing a script.
 *
 * A client preset carries both as well. Legacy connections simply have none.
 */
export class autoSubscribeAndReply1792001000003 implements MigrationInterface {
  name = 'autoSubscribeAndReply1792001000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" ADD COLUMN "autoSubscriptions" text`)
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" ADD COLUMN "autoReplies" text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" DROP COLUMN "autoReplies"`)
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" DROP COLUMN "autoSubscriptions"`)
  }
}
