import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Document types: classification on files, extracted documents, payroll lines, record links. */
export class DocumentTypes1761000000000 implements MigrationInterface {
  name = 'DocumentTypes1761000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of UP) await queryRunner.query(statement);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const statement of DOWN) await queryRunner.query(statement);
  }
}

const UP = [
  `CREATE TYPE "document_type" AS ENUM('bank_statement', 'payroll', 'invoice', 'receipt', 'sales_report', 'other')`,
  `CREATE TYPE "document_consistency" AS ENUM('ok', 'inconsistent', 'unchecked')`,
  // null document_type = "not classified" (every file analyzed before this migration)
  `ALTER TABLE "business_files" ADD COLUMN "document_type" "document_type"`,
  `ALTER TABLE "business_files" ADD COLUMN "document_type_confidence" numeric(3, 2)`,
  `ALTER TABLE "business_files" ADD COLUMN "document_type_manual" boolean DEFAULT false NOT NULL`,
  `CREATE TABLE "extracted_documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "file_id" uuid NOT NULL,
    "ordinal" integer NOT NULL,
    "type" "document_type" NOT NULL,
    "type_confidence" numeric(3, 2) NOT NULL,
    "period_start" date,
    "period_end" date,
    "issue_date" date,
    "currency" char(3) NOT NULL,
    "consistency" "document_consistency" DEFAULT 'unchecked' NOT NULL,
    "consistency_notes" text,
    "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE "payroll_lines" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "owner_id" text NOT NULL,
    "document_id" uuid NOT NULL,
    "employee_name" varchar(200) NOT NULL,
    "employee_key" text NOT NULL,
    "gross_minor" bigint NOT NULL,
    "deductions_minor" bigint NOT NULL,
    "net_minor" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "payroll_lines_amounts_ck" CHECK ("gross_minor" >= 0 AND "deductions_minor" >= 0 AND "net_minor" >= 0)
  )`,
  `ALTER TABLE "transactions" ADD COLUMN "document_id" uuid`,
  `ALTER TABLE "extracted_documents" ADD CONSTRAINT "fk_extracted_documents_file" FOREIGN KEY ("file_id") REFERENCES "business_files"("id") ON DELETE CASCADE`,
  `ALTER TABLE "payroll_lines" ADD CONSTRAINT "fk_payroll_lines_document" FOREIGN KEY ("document_id") REFERENCES "extracted_documents"("id") ON DELETE CASCADE`,
  `ALTER TABLE "transactions" ADD CONSTRAINT "fk_transactions_document" FOREIGN KEY ("document_id") REFERENCES "extracted_documents"("id") ON DELETE SET NULL`,
  `CREATE INDEX "extracted_documents_owner_type_end_idx" ON "extracted_documents" ("owner_id", "type", "period_end")`,
  `CREATE INDEX "extracted_documents_file_idx" ON "extracted_documents" ("file_id")`,
  `CREATE INDEX "payroll_lines_document_idx" ON "payroll_lines" ("document_id")`,
  `CREATE INDEX "payroll_lines_owner_employee_idx" ON "payroll_lines" ("owner_id", "employee_key")`,
  `CREATE INDEX "transactions_document_idx" ON "transactions" ("document_id")`,
];

const DOWN = [
  `DROP INDEX "transactions_document_idx"`,
  `ALTER TABLE "transactions" DROP CONSTRAINT "fk_transactions_document"`,
  `ALTER TABLE "transactions" DROP COLUMN "document_id"`,
  `DROP TABLE "payroll_lines"`,
  `DROP TABLE "extracted_documents"`,
  `ALTER TABLE "business_files" DROP COLUMN "document_type_manual"`,
  `ALTER TABLE "business_files" DROP COLUMN "document_type_confidence"`,
  `ALTER TABLE "business_files" DROP COLUMN "document_type"`,
  `DROP TYPE "document_consistency"`,
  `DROP TYPE "document_type"`,
];
