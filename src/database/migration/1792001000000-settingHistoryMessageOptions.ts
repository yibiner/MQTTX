import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Adds the two local publish history settings:
 *  - saveHistoryMessage: store the message (payload) together with its topic (default: enabled)
 *  - historyMaxCount: how many history records are kept (default 20, clamped to 1..200 by the UI)
 */
export class settingHistoryMessageOptions1792001000000 implements MigrationInterface {
  name = 'settingHistoryMessageOptions1792001000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "SettingEntity" ADD COLUMN "saveHistoryMessage" boolean NOT NULL DEFAULT (1)`)
    await queryRunner.query(`ALTER TABLE "SettingEntity" ADD COLUMN "historyMaxCount" integer NOT NULL DEFAULT (20)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "SettingEntity" DROP COLUMN "historyMaxCount"`)
    await queryRunner.query(`ALTER TABLE "SettingEntity" DROP COLUMN "saveHistoryMessage"`)
  }
}
