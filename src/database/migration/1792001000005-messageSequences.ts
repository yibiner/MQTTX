import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Message sequences of a connection: ordered publishes with a delay relative to the
 * previous step, optional loop and a stop condition. See ConnectionModel['messageSequences'].
 *
 * Stored as text like the automatic replies. Older connections read `null`, which the
 * editors and the runner treat as an empty list.
 */
export class messageSequences1792001000005 implements MigrationInterface {
  name = 'messageSequences1792001000005'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" ADD COLUMN "messageSequences" text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" DROP COLUMN "messageSequences"`)
  }
}
