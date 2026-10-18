# Data Model: Business File Upload & Ingestion

All tables include `owner_id text not null` (single fixed owner in v1) and `created_at`/`updated_at` timestamptz. Money is stored as integer minor units plus ISO currency code.

## business_files

| Field                | Type                        | Notes                                                                           |
| -------------------- | --------------------------- | ------------------------------------------------------------------------------- |
| id                   | uuid pk                     |                                                                                 |
| original_name        | text                        |                                                                                 |
| mime_type            | text                        | validated against allow-list                                                    |
| size_bytes           | bigint                      | ≤ MAX_FILE_SIZE_MB                                                              |
| sha256               | char(64)                    | unique per owner unless user chose keep-both (`duplicate_of` set)               |
| storage_key          | text                        | S3 object key `owner/yyyy/mm/<id>-<name>`                                       |
| status               | enum                        | `received`, `queued_limit`, `processing`, `completed`, `needs_review`, `failed` |
| failure_reason       | text null                   |                                                                                 |
| reading_method       | enum null                   | `digital`, `ocr`, `vision` (final successful tier)                              |
| total_cost_micro_usd | bigint                      | sum of its cost entries                                                         |
| duplicate_of         | uuid null fk business_files | set when owner chose keep-both                                                  |
| uploaded_at          | timestamptz                 |                                                                                 |

**State transitions**: `received → processing → completed | needs_review | failed`; `processing → queued_limit → processing` (limit raised/reset); `failed → received` (retry); `needs_review → completed` when all records confirmed or corrected (FR-013). Delete is permanent (row, object, records, chunks, costs of the file).

## extraction_runs

One row per processing attempt: `id`, `file_id fk`, `tier` (`digital|ocr|vision`), `status` (`succeeded|low_confidence|error`), `confidence numeric(3,2) null`, `error text null`, `started_at`, `finished_at`, `raw_text_key text null` (extracted text stored in S3 for audit/re-index).

## transactions

| Field           | Type                             | Notes                                                                                                                                                                                     |
| --------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id              | uuid pk                          |                                                                                                                                                                                           |
| file_id         | uuid fk business_files (cascade) |                                                                                                                                                                                           |
| occurred_on     | date                             |                                                                                                                                                                                           |
| amount_minor    | bigint                           | positive                                                                                                                                                                                  |
| currency        | char(3)                          | falls back to `BUSINESS_CURRENCY` when the document shows none                                                                                                                            |
| kind            | enum                             | `expense`, `income`                                                                                                                                                                       |
| category        | text                             | one of `transactionCategories` in `packages/shared` (`supplies`, `inventory`, `rent`, `utilities`, `staff`, `transport`, `marketing`, `taxes`, `equipment`, `sales`, `services`, `other`) |
| is_staff        | boolean                          | derived from category=`staff`, kept for fast filtering                                                                                                                                    |
| counterparty    | text null                        |                                                                                                                                                                                           |
| confidence      | numeric(3,2)                     |                                                                                                                                                                                           |
| confirmed       | boolean                          | default false; true after owner edit/confirm                                                                                                                                              |
| excluded_reason | enum null                        | `merged_duplicate` (excluded from totals)                                                                                                                                                 |

Indexes: `(owner_id, occurred_on)`, `(owner_id, kind, occurred_on)`, `(file_id)`.

## line_items

`id`, `transaction_id fk (cascade)`, `product_name text`, `quantity numeric(12,3)`, `unit_price_minor bigint null`, `total_minor bigint`, `direction enum(purchase|sale)`, `confidence`. Index `(direction, product_name)` (normalized lowercase column `product_key`).

## duplicate_candidates

`id`, `transaction_id fk`, `matches_transaction_id fk`, `status enum(pending|kept_both|merged)`, `resolved_at null`. Unique on the unordered pair. Merge sets `transactions.excluded_reason='merged_duplicate'` on the loser.

## document_chunks

`id`, `file_id fk (cascade)`, `chunk_index int`, `content text`, `embedding vector(1024)`, `token_count int`. HNSW index on `embedding` (cosine); btree `(file_id)`.

## cost_entries

`id`, `file_id fk (cascade) null`, `run_id fk null`, `kind enum(parse|ocr|llm_text|llm_vision|embedding)`, `model text null`, `input_tokens int null`, `output_tokens int null`, `cost_micro_usd bigint`, `created_at`. Month-to-date sum drives the limit guard.

## Relationships

`business_files 1—* extraction_runs`, `1—* transactions 1—* line_items`, `1—* document_chunks`, `1—* cost_entries`; `transactions *—* transactions` through `duplicate_candidates`.

## Shared zod schemas (packages/shared)

`fileStatusSchema`, `businessFileSchema`, `transactionSchema`, `lineItemSchema`, `extractedDocumentSchema` (LLM output contract), `recordsQuerySchema` (`from`, `to`, `kind`, `category`, `groupBy=week|month`), `jobPayloadSchema`. Validation rules mirror the tables (non-negative amounts, ISO dates/currency, name length limits).
