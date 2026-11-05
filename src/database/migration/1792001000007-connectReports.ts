import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * One-shot publishes sent after a connection succeeds. See ConnectionModel['connectReports'].
 *
 * Stored as text like the timed reports. Older connections read `null`, which the editor
 * and the connect path treat as an empty list.
 */
export class connectReports1792001000007 implements MigrationInterface {
  name = 'connectReports1792001000007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" ADD COLUMN "connectReports" text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" DROP COLUMN "connectReports"`)
  }
}
