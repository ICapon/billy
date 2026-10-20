import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Document chat: conversations and their messages. */
export class DocumentChat1762000000000 implements MigrationInterface {
  name = 'DocumentChat1762000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of UP) await queryRunner.query(statement);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const statement of DOWN) await queryRunner.query(statement);
  }
}

const UP = [
  `CREATE TYPE "chat_role" AS ENUM('user', 'assistant')`,
  `CREATE TYPE "chat_status" AS ENUM('ok', 'error')`,
  `CREATE TABLE "chat_conversations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "title" varchar(120) DEFAULT '' NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "chat_messages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "conversation_id" uuid NOT NULL,
    "role" "chat_role" NOT NULL,
    "content" text NOT NULL,
    "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "status" "chat_status" DEFAULT 'ok' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "chat_messages" ADD CONSTRAINT "fk_chat_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE`,
  `CREATE INDEX "chat_conversations_owner_last_idx" ON "chat_conversations" ("owner_id", "last_message_at" DESC)`,
  `CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages" ("conversation_id", "created_at")`,
];

const DOWN = [
  `DROP TABLE "chat_messages"`,
  `DROP TABLE "chat_conversations"`,
  `DROP TYPE "chat_status"`,
  `DROP TYPE "chat_role"`,
];
