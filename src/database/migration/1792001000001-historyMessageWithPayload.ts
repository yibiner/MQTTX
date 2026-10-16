import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The publish history used to keep topics (historyMessageHeaderEntity) and payloads
 * (historyMessagePayloadEntity) in two independent lists, so restoring a history entry could only
 * restore one of them. A history record now carries the message next to its topic, which lets the
 * publish panel replace topic and message together.
 *
 * Legacy rows stay usable: they simply have no payload. The old payload-only rows are paired into
 * header rows by recency as a best effort and are left untouched in their own table.
 */
export class historyMessageWithPayload1792001000001 implements MigrationInterface {
  name = 'historyMessageWithPayload1792001000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "historyMessageHeaderEntity" ADD COLUMN "payload" varchar`)
    await queryRunner.query(`ALTER TABLE "historyMessageHeaderEntity" ADD COLUMN "payloadType" varchar`)

    // Pair the newest topic row with the newest payload row, and so on.
    await queryRunner.query(`
            CREATE TABLE "temporary_historyMessagePair" AS
            SELECT h."id" AS "headerId",
                p."payload" AS "payload",
                p."payloadType" AS "payloadType"
            FROM (
                    SELECT "id",
                        ROW_NUMBER() OVER (
                            ORDER BY "createAt" DESC,
                                "id" DESC
                        ) AS "rn"
                    FROM "historyMessageHeaderEntity"
                ) h
                INNER JOIN (
                    SELECT "payload",
                        "payloadType",
                        ROW_NUMBER() OVER (
                            ORDER BY "createAt" DESC
                        ) AS "rn"
                    FROM "historyMessagePayloadEntity"
                ) p ON h."rn" = p."rn"
        `)
    await queryRunner.query(`
            UPDATE "historyMessageHeaderEntity"
            SET "payload" = (
                    SELECT pair."payload"
                    FROM "temporary_historyMessagePair" pair
                    WHERE pair."headerId" = "historyMessageHeaderEntity"."id"
                ),
                "payloadType" = (
                    SELECT pair."payloadType"
                    FROM "temporary_historyMessagePair" pair
                    WHERE pair."headerId" = "historyMessageHeaderEntity"."id"
                )
            WHERE "id" IN (
                    SELECT "headerId"
                    FROM "temporary_historyMessagePair"
                )
        `)
    await queryRunner.query(`DROP TABLE "temporary_historyMessagePair"`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "historyMessageHeaderEntity" DROP COLUMN "payloadType"`)
    await queryRunner.query(`ALTER TABLE "historyMessageHeaderEntity" DROP COLUMN "payload"`)
  }
}
