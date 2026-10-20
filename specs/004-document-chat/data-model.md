# Data Model: Document Chat

All tables carry `owner_id` (text) and `id`, `created_at`, `updated_at` via the existing owned-entity pattern. Every repository call is filtered by the configured owner.

## chat_conversations
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| owner_id | text | indexed with `last_message_at` |
| title | varchar(120) | first question, whitespace-collapsed and truncated |
| last_message_at | timestamptz | updated on every appended message; sort key for history |
| created_at / updated_at | timestamptz | |

## chat_messages
| Field | Type | Notes |
|-------|------|-------|
| id | uuid PK | |
| owner_id | text | |
| conversation_id | uuid FK -> chat_conversations ON DELETE CASCADE | indexed with `created_at` |
| role | enum `chat_role` (`user`, `assistant`) | |
| content | text | user text <= `CHAT_MAX_MESSAGE_CHARS`; assistant answer |
| sources | jsonb, default `[]` | assistant only: `[{ fileId, name, documentType, periodStart, periodEnd }]`, snapshot at answer time |
| status | enum (`ok`, `error`) | `error` rows are not sent as context |
| created_at / updated_at | timestamptz | |

## Relationships
- Conversation 1 -> N Message; deleting a conversation cascades to its messages (FR-007).
- `sources[].fileId` references `business_files.id` logically (no FK, so a snapshot survives file deletion; the UI shows an unavailable state when the file no longer exists).
- The chat only **reads** `business_files`, `extracted_documents`, `payroll_lines`, `transactions`, `document_chunks`.

## Rules
- A conversation's title is set when its first user message is stored and never changed.
- Appending a message and updating `last_message_at` happen in one transaction.
- The user message is stored before the model runs; on failure an assistant row with `status = error` is not required: the API returns an error and the UI offers retry (the stored user message is reused, not duplicated).
- Rate limit: count of `user` messages for the owner in the last 60 s must be below `CHAT_RATE_LIMIT_PER_MINUTE`.

## Migration
`1762000000000-document-chat`: create `chat_role`/`chat_status` enums, both tables, indexes `chat_conversations(owner_id, last_message_at DESC)` and `chat_messages(conversation_id, created_at)`; `down` drops them in reverse. Register in `migrations/index.ts` and `entities/index.ts`.
