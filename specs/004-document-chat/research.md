# Research: Document Chat

## R1 - How the model reaches the data
- **Decision**: Tool use. The model gets read-only tools and answers from their results: `search_documents` (semantic search over `document_chunks`, optional file filter), `list_documents` (by type/period, with per-type key figures), `get_document` (full extracted details plus payroll lines), `get_totals` (income/expense totals by week/month, same logic as the results screen), `list_records` (filtered transactions, capped page).
- **Rationale**: Financial questions are mostly aggregations ("how much last month"). Embedding-only RAG retrieves text snippets and cannot sum reliably; the app already has correct, tested aggregation queries. Chunks and embeddings already exist (`searchChunks` is implemented but unused), so semantic search covers free-text questions at no extra ingestion cost.
- **Alternatives**: (a) RAG only: poor on totals and period comparisons. (b) Stuff all extracted data in the prompt: cost and size grow with every document and leak irrelevant data. (c) LLM-generated SQL: unsafe, hard to scope per owner.

## R2 - Where the loop lives
- **Decision**: Loop, prompt and `final_answer` validation in `@org/ai`; tool handlers injected from `apps/api`.
- **Rationale**: Constitution I forbids `ai` → `db`. Injection keeps the loop unit-testable with a scripted fake LLM.
- **Alternatives**: Put the loop in `api` (ties prompt logic to Nest, harder to test); make `ai` depend on `db` (forbidden).

## R3 - Grounding and sources
- **Decision**: The model ends by calling `final_answer { text, sourceFileIds[] }`. The server keeps the set of file ids returned by tools during the turn and drops any claimed id outside it; sources are then resolved to name/type/period.
- **Rationale**: Satisfies FR-004/SC-005 and prevents invented citations. A turn that produced no tool results and claims figures is allowed only if it states the information is unavailable (enforced by the system prompt and a spec case).
- **Alternatives**: Parse citations from free text (fragile); show all retrieved files (noisy).

## R4 - Prompt injection and privacy
- **Decision**: All repositories are already owner-scoped, tools take no owner argument, tools are read-only, tool results are wrapped as quoted data, and the system prompt states document text is never instructions. Input is length-limited.
- **Rationale**: FR-008, FR-012, FR-013. Removing write tools makes the worst case a wrong answer, not a data change.

## R5 - Conversation context
- **Decision**: Persist messages; send the last `CHAT_CONTEXT_MESSAGES` (default 12) user/assistant text turns, not past tool traces.
- **Rationale**: Follow-ups work (FR-005) while per-turn cost stays bounded. Tool results are re-fetched when needed, so they are always current after a re-analysis (edge case).

## R6 - Streaming
- **Decision**: v1 returns the complete answer in one JSON response; the UI shows a progress state.
- **Rationale**: Metering, source validation and persistence are simpler on a completed turn; 10 s target (SC-004) is met without streaming. The Next proxy already streams bodies, so SSE can be added later without changing the data model.
- **Alternatives**: SSE token streaming now (more moving parts, partial-answer persistence and error handling).

## R7 - Cost and limits
- **Decision**: Each model call is recorded in `cost_entries` as `llm_text` and the query embedding as `embedding`, with no file id. Chat is not blocked by the monthly *processing* limit (it is a different spend), but is limited by message length and a per-minute request cap read from config.
- **Rationale**: Reuses the existing cost screen without a new enum value (`ALTER TYPE ... ADD VALUE` adds migration risk for little benefit).
- **Verified**: `cost_entries.file_id` is already nullable (`ON DELETE SET NULL`), so no schema change is needed for entries without a file.
- **Defaults**: `CHAT_MAX_MESSAGE_CHARS=2000`, `CHAT_RATE_LIMIT_PER_MINUTE=20`, `CHAT_CONTEXT_MESSAGES=12`.
- **Open question for later**: whether chat spend should also count toward `PROCESSING_COST_LIMIT_USD`; deferred, noted in the spec assumptions.

## R8 - Model
- **Decision**: `CHAT_MODEL` env var, default `claude-sonnet-5-5` (multi-step tool use and arithmetic reliability matter more than raw cost here); `EXTRACTION_MODEL` stays Haiku.
- **Alternatives**: Haiku for cost; kept configurable so it can be switched without code changes.

## R9 - Where it appears
- **Decision**: "Home" is `/dashboard` (`/` redirects there). The chat is a section at the top of the dashboard page with a collapsible history list; no new route in v1.
- **Rationale**: Matches "al inicio" with minimal navigation change.

## R10 - Suggested questions
- **Decision**: `GET /chat/status` returns a fixed list of example questions (no model call). They are in Spanish (the app UI language) and shown on an empty conversation only; the answer language still follows what the owner types.
- **Rationale**: FR-014 needs only starter prompts; generating them would add cost and latency to every home screen load.

## R11 - Turn timeout
- **Decision**: Besides the 6-iteration cap, each turn has an overall timeout (`CHAT_TURN_TIMEOUT_MS`, default 45000). On timeout or cap the loop fails with a typed error, mapped to 502, and the user message is kept so the owner can retry.
- **Rationale**: Up to 6 sequential model calls can exceed the 10 s target (SC-004) in the worst case; the target covers typical turns (1-3 calls), the timeout bounds the rest.
