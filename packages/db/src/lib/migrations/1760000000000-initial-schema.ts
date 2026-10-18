import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1760000000000 implements MigrationInterface {
  name = 'InitialSchema1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of UP) await queryRunner.query(statement);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const statement of DOWN) await queryRunner.query(statement);
  }
}

const UP = [
  `CREATE EXTENSION IF NOT EXISTS vector`,
  `CREATE TYPE "cost_kind" AS ENUM('parse', 'ocr', 'llm_text', 'llm_vision', 'embedding')`,
  `CREATE TYPE "duplicate_status" AS ENUM('pending', 'kept_both', 'merged')`,
  `CREATE TYPE "excluded_reason" AS ENUM('merged_duplicate')`,
  `CREATE TYPE "file_status" AS ENUM('received', 'queued_limit', 'processing', 'completed', 'needs_review', 'failed')`,
  `CREATE TYPE "line_direction" AS ENUM('purchase', 'sale')`,
  `CREATE TYPE "reading_method" AS ENUM('digital', 'ocr', 'vision')`,
  `CREATE TYPE "run_status" AS ENUM('succeeded', 'low_confidence', 'error')`,
  `CREATE TYPE "transaction_kind" AS ENUM('expense', 'income')`,
  `CREATE TABLE "business_files" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "original_name" text NOT NULL,
    "mime_type" text NOT NULL,
    "size_bytes" bigint NOT NULL,
    "sha256" char(64) NOT NULL,
    "storage_key" text NOT NULL,
    "status" "file_status" DEFAULT 'received' NOT NULL,
    "failure_reason" text,
    "reading_method" "reading_method",
    "total_cost_micro_usd" bigint DEFAULT 0 NOT NULL,
    "duplicate_of" uuid,
    "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "extraction_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "file_id" uuid NOT NULL,
    "tier" "reading_method" NOT NULL,
    "status" "run_status" NOT NULL,
    "confidence" numeric(3, 2),
    "error" text,
    "raw_text_key" text,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "finished_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "transactions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "file_id" uuid NOT NULL,
    "occurred_on" date NOT NULL,
    "amount_minor" bigint NOT NULL,
    "currency" char(3) NOT NULL,
    "kind" "transaction_kind" NOT NULL,
    "category" text NOT NULL,
    "is_staff" boolean DEFAULT false NOT NULL,
    "counterparty" text,
    "confidence" numeric(3, 2) NOT NULL,
    "confirmed" boolean DEFAULT false NOT NULL,
    "excluded_reason" "excluded_reason",
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "line_items" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "transaction_id" uuid NOT NULL,
    "product_name" text NOT NULL,
    "product_key" text NOT NULL,
    "quantity" numeric(12, 3) NOT NULL,
    "unit_price_minor" bigint,
    "total_minor" bigint NOT NULL,
    "direction" "line_direction" NOT NULL,
    "confidence" numeric(3, 2) DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "duplicate_candidates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "transaction_id" uuid NOT NULL,
    "matches_transaction_id" uuid NOT NULL,
    "status" "duplicate_status" DEFAULT 'pending' NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "document_chunks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "file_id" uuid NOT NULL,
    "chunk_index" integer NOT NULL,
    "content" text NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "token_count" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "cost_entries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "file_id" uuid,
    "run_id" uuid,
    "kind" "cost_kind" NOT NULL,
    "model" text,
    "input_tokens" integer,
    "output_tokens" integer,
    "cost_micro_usd" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "business_files" ADD CONSTRAINT "fk_business_files_duplicate_of" FOREIGN KEY ("duplicate_of") REFERENCES "business_files"("id") ON DELETE SET NULL`,
  `ALTER TABLE "extraction_runs" ADD CONSTRAINT "fk_extraction_runs_file" FOREIGN KEY ("file_id") REFERENCES "business_files"("id") ON DELETE CASCADE`,
  `ALTER TABLE "transactions" ADD CONSTRAINT "fk_transactions_file" FOREIGN KEY ("file_id") REFERENCES "business_files"("id") ON DELETE CASCADE`,
  `ALTER TABLE "line_items" ADD CONSTRAINT "fk_line_items_transaction" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE`,
  `ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "fk_duplicate_candidates_transaction" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE`,
  `ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "fk_duplicate_candidates_matches" FOREIGN KEY ("matches_transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE`,
  `ALTER TABLE "document_chunks" ADD CONSTRAINT "fk_document_chunks_file" FOREIGN KEY ("file_id") REFERENCES "business_files"("id") ON DELETE CASCADE`,
  `ALTER TABLE "cost_entries" ADD CONSTRAINT "fk_cost_entries_file" FOREIGN KEY ("file_id") REFERENCES "business_files"("id") ON DELETE SET NULL`,
  `ALTER TABLE "cost_entries" ADD CONSTRAINT "fk_cost_entries_run" FOREIGN KEY ("run_id") REFERENCES "extraction_runs"("id") ON DELETE SET NULL`,
  `CREATE UNIQUE INDEX "business_files_owner_sha256_uq" ON "business_files" ("owner_id", "sha256") WHERE "duplicate_of" IS NULL`,
  `CREATE INDEX "business_files_owner_status_idx" ON "business_files" ("owner_id", "status")`,
  `CREATE INDEX "business_files_owner_uploaded_idx" ON "business_files" ("owner_id", "uploaded_at")`,
  `CREATE INDEX "extraction_runs_file_idx" ON "extraction_runs" ("file_id")`,
  `CREATE INDEX "transactions_owner_date_idx" ON "transactions" ("owner_id", "occurred_on")`,
  `CREATE INDEX "transactions_owner_kind_date_idx" ON "transactions" ("owner_id", "kind", "occurred_on")`,
  `CREATE INDEX "transactions_file_idx" ON "transactions" ("file_id")`,
  `CREATE INDEX "line_items_transaction_idx" ON "line_items" ("transaction_id")`,
  `CREATE INDEX "line_items_direction_product_idx" ON "line_items" ("direction", "product_key")`,
  `CREATE UNIQUE INDEX "duplicate_candidates_pair_uq" ON "duplicate_candidates" ("transaction_id", "matches_transaction_id")`,
  `CREATE INDEX "document_chunks_file_idx" ON "document_chunks" ("file_id")`,
  `CREATE INDEX "document_chunks_embedding_idx" ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops)`,
  `CREATE INDEX "cost_entries_owner_created_idx" ON "cost_entries" ("owner_id", "created_at")`,
  `CREATE INDEX "cost_entries_file_idx" ON "cost_entries" ("file_id")`,
];

const DOWN = [
  `DROP TABLE "cost_entries"`,
  `DROP TABLE "document_chunks"`,
  `DROP TABLE "duplicate_candidates"`,
  `DROP TABLE "line_items"`,
  `DROP TABLE "transactions"`,
  `DROP TABLE "extraction_runs"`,
  `DROP TABLE "business_files"`,
  `DROP TYPE "transaction_kind"`,
  `DROP TYPE "run_status"`,
  `DROP TYPE "reading_method"`,
  `DROP TYPE "line_direction"`,
  `DROP TYPE "file_status"`,
  `DROP TYPE "excluded_reason"`,
  `DROP TYPE "duplicate_status"`,
  `DROP TYPE "cost_kind"`,
];
