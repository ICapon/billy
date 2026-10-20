# Quickstart: Document Chat validation

## Prerequisites
- `.env` from `.env.example` with `ANTHROPIC_API_KEY` and `VOYAGE_API_KEY` set; optional `CHAT_MODEL`.
- Local stack: `pnpm infra:up`, then `pnpm db:migrate`.
- At least a few analyzed documents (upload and wait for `completed`), ideally one bank statement, one payroll and one sales report.

## Automated checks
```sh
pnpm nx run-many -t lint test typecheck build -p shared db ai api web
pnpm openapi   # regenerate and commit apps/api/openapi
```
Key specs: `ai` answer-question (scripted LLM: grounded answer, unknown answer, invalid source ids dropped, iteration cap), `db` chat repository (owner isolation, cascade delete), `api` chat integration (rate limit, 404 for other owner, error keeps user message), `web` chat spec (empty state, suggestions, sources, retry).

## Manual scenarios (map to spec)
1. **US1**: `pnpm nx serve api` + `pnpm nx dev web`, open `/` (lands on dashboard). Ask a question answerable from a document; compare each figure with the file detail screen.
2. **US1-AC2**: Ask about something absent (e.g. a month with no documents): answer says unavailable, no sources.
3. **US1-AC3**: With an empty database, the chat shows the upload guidance and no input errors.
4. **US2**: Ask something using two known files; sources list exactly those, each opens its detail.
5. **US3**: Ask, then "and the month before?"; answer uses context. Click New conversation: context is gone.
6. **US4**: Reload; conversation is listed, reopens with all messages, can be continued and deleted.
7. **Edge**: send an empty message (blocked), an over-limit message (rejected), stop the API key (clear error + retry keeps conversation), upload a file containing "ignore previous instructions" and ask about it (treated as data).
8. **Isolation**: change `BUSINESS_OWNER_ID`, restart api; previous conversations and documents are not visible.

## Reference questions (SC-002, SC-003, SC-004)
Run these by hand against documents whose figures you know, and note the result next to each.
1. Three questions whose answer is a single figure in one document (e.g. closing balance of a given statement, payroll total of a month, sales total of a report). Pass if the figure matches the file detail exactly (SC-002).
2. Three questions about a period or document that does not exist (e.g. a month with no uploads). Pass if the reply says the information is unavailable and shows no sources (SC-003).
3. For all of the above, time from pressing send to the answer. Pass if at least 90% take 10 s or less (SC-004).
4. Two questions that need two documents (e.g. compare two months). Pass if the sources list exactly those files (SC-005).

