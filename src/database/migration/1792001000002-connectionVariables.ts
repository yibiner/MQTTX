import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * A connection carries its own payload variables ("客户端变量"), e.g. the product type of the
 * device it talks to. They are referenced as `${name}` in a message topic or payload and win over
 * the global variables of the preset manager.
 *
 * The column is a `simple-json` one, so it stores the `{ name: value }` map as JSON text. Legacy
 * connections simply have no variables.
 */
export class connectionVariables1792001000002 implements MigrationInterface {
  name = 'connectionVariables1792001000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" ADD COLUMN "variables" text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ConnectionEntity" DROP COLUMN "variables"`)
  }
}
