import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Timed reports of a connection: publishes prepared ahead of time and started after every
 * successful connect. See ConnectionModel['timedReports'].
 *
 * Stored as text like the message sequences. Older connections read `null`, which the editor
 * and the runner treat as an empty list.
 */
export class timedReports1792001000006 implements MigrationInterface {
  name = 'timedReports1792001000006'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" ADD COLUMN "timedReports" text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" DROP COLUMN "timedReports"`)
  }
}
