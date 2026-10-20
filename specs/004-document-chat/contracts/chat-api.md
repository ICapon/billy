# Contract: Chat API

Base path `/api` (browser reaches it as `/backend/...`). Schemas are zod in `packages/shared/src/lib/chat.ts`, exposed through `nestjs-zod` DTOs in `apps/api/src/app/dto.ts`, and regenerated into `apps/api/openapi` with `pnpm openapi`. Single owner is implicit (no auth in v1).

## Types
```ts
SourceRef   = { fileId: uuid, name: string, documentType: DocumentType | null,
                periodStart: date | null, periodEnd: date | null, available: boolean }
ChatMessage = { id: uuid, role: 'user' | 'assistant', content: string,
                sources: SourceRef[], createdAt: iso-datetime }
Conversation = { id: uuid, title: string, lastMessageAt: iso-datetime, createdAt: iso-datetime }
```

## Endpoints

| Method & path | Request | Success | Errors |
|---------------|---------|---------|--------|
| `GET /chat/conversations` | query `cursor?`, `limit?` (1-50, default 20) | 200 `{ items: Conversation[], nextCursor: string \| null }`, newest activity first | 400 bad query |
| `POST /chat/conversations` | none | 201 `Conversation` (empty, title `''` until first message) | - |
| `GET /chat/conversations/:id` | | 200 `{ conversation, messages: ChatMessage[] }` oldest first | 404 unknown/other owner |
| `DELETE /chat/conversations/:id` | | 204 | 404 |
| `POST /chat/conversations/:id/messages` | `{ content: string }` (trimmed, 1..`CHAT_MAX_MESSAGE_CHARS`) | 201 `{ userMessage: ChatMessage, assistantMessage: ChatMessage }` | 400 empty/too long; 404; 429 rate limited (`Retry-After`); 502 model/provider failure (user message kept); 503 chat not configured (missing API key) |
| `GET /chat/status` | | 200 `{ enabled: boolean, hasDocuments: boolean, suggestions: string[] }` | - |

`hasDocuments` drives the empty state (FR-011); `suggestions` feeds FR-014.

## Behavior guarantees
- The assistant message `content` is in the language of the user's message.
- `sources` contains only files returned by tools during that turn and still owned by the caller.
- A question with no supporting data yields a normal 201 whose answer states the data is unavailable and `sources: []`.
- The endpoint is idempotent only per request; the UI must not resend on 201.

## Internal tool contract (model-facing, not HTTP)
`search_documents{query,fileId?,limit?≤8}`, `list_documents{types?,from?,to?}`, `get_document{documentId}`, `get_totals{from,to,groupBy,kind?}`, `list_records{from?,to?,category?,fileId?,limit?≤50}`, and the terminal `final_answer{text,sourceFileIds[]}`. Every tool is read-only; outputs are JSON capped at a fixed size and flagged `truncated` when cut.
