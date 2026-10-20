# Feature Specification: Document Chat

**Feature Branch**: `004-document-chat`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "I want to add a chat module on the home screen, where we can ask about the data of the documents we already analyzed through a conversation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask a question about my documents and get an answer (Priority: P1)

From the home screen, the owner sees a chat box. They type a question in natural language (for example "How much did I spend on payroll last month?" or "What was the closing balance of my March bank statement?") and receive an answer written from the data extracted from their already analyzed documents, shown in the conversation.

**Why this priority**: This is the core of the feature. Without answers grounded in the owner's analyzed documents, there is no chat module.

**Independent Test**: With several analyzed documents available, open the home screen, ask a question whose answer is in the extracted data, and verify the answer matches the data shown for those documents elsewhere in the app.

**Acceptance Scenarios**:

1. **Given** the owner has analyzed documents, **When** they send a question about figures contained in them, **Then** the chat replies with an answer whose figures match the extracted data.
2. **Given** a question whose answer is not in any analyzed document, **When** the owner sends it, **Then** the chat says it could not find that information instead of inventing an answer.
3. **Given** the owner has no analyzed documents yet, **When** they open the chat, **Then** they are told there is nothing to consult yet and are pointed to upload documents.
4. **Given** an answer is being prepared, **When** the owner waits, **Then** they see a clear in-progress indication and the answer appears in the conversation as soon as it is ready.

---

### User Story 2 - See which documents back each answer (Priority: P2)

Every answer that uses document data shows the documents (name, type, period) it was based on. The owner can open any of them from the answer to verify the figure at its source.

**Why this priority**: Financial answers must be verifiable. Trust in the chat depends on being able to check where a number came from.

**Independent Test**: Ask a question that uses two known documents and verify the answer lists exactly those documents and that each link opens the corresponding file.

**Acceptance Scenarios**:

1. **Given** an answer built from data in one or more documents, **When** it is displayed, **Then** it lists those documents with name, type and period.
2. **Given** a listed source, **When** the owner selects it, **Then** the corresponding file detail opens.

---

### User Story 3 - Hold a follow-up conversation (Priority: P2)

The owner can ask follow-up questions that rely on the previous ones ("and the month before?", "split that by supplier") and the chat understands the context of the ongoing conversation. They can start a fresh conversation at any time.

**Why this priority**: A conversation, rather than one-off questions, is what the owner asked for, and follow-ups are how people naturally dig into figures.

**Independent Test**: Ask a question, then a short follow-up that only makes sense with the first, and verify the answer uses the earlier context; start a new conversation and verify the earlier context no longer applies.

**Acceptance Scenarios**:

1. **Given** a conversation with earlier questions, **When** the owner sends a follow-up that refers to them, **Then** the answer reflects that context.
2. **Given** an ongoing conversation, **When** the owner starts a new one, **Then** the chat starts empty and ignores the previous context.

---

### User Story 4 - Come back to previous conversations (Priority: P3)

The owner can leave and return to the home screen and still find their earlier conversations, reopen one and continue it, or delete the ones they no longer want.

**Why this priority**: Useful for repeated analysis, but the chat delivers value without it.

**Independent Test**: Hold a conversation, reload the app, and verify it is listed, can be reopened with all messages and continued, and can be deleted.

**Acceptance Scenarios**:

1. **Given** earlier conversations, **When** the owner opens the home screen, **Then** they can see a list of them and reopen any.
2. **Given** a saved conversation, **When** the owner deletes it, **Then** it no longer appears and cannot be reopened.

---

### Edge Cases

- A question is ambiguous (for example, no period given): the chat answers using a stated default or asks a short clarifying question.
- A question refers to a document that is still being analyzed or failed analysis: the chat tells the owner that document's data is not available yet.
- A question is unrelated to the owner's documents (general chit-chat or topics outside their data): the chat politely says it only answers about the analyzed documents.
- Documents contain conflicting figures (for example, two statements overlapping the same period): the chat points out the discrepancy and the sources involved.
- The owner sends an empty or extremely long message: empty messages are not sent; very long ones are rejected with a clear message.
- The answer service is unavailable or takes too long: the owner sees a clear error and can retry without losing the conversation.
- The owner changes a document's type or re-analyzes it while a conversation exists: later answers use the current data.
- Instructions embedded inside document text (for example "ignore previous instructions") are treated as document content, never as commands.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The home screen MUST include a chat module where the owner can type a message and send it.
- **FR-002**: The system MUST answer questions in natural language using only the data extracted from the owner's analyzed documents (general records and type-specific data).
- **FR-003**: When the requested information is not available in the analyzed documents, the system MUST say so and MUST NOT present invented figures.
- **FR-004**: Answers that use document data MUST list the source documents (name, type, period), each linking to the file detail.
- **FR-005**: The system MUST keep the context of the current conversation so follow-up questions are understood.
- **FR-006**: The owner MUST be able to start a new, empty conversation at any time.
- **FR-007**: Conversations MUST be saved so the owner can list, reopen, continue and delete them.
- **FR-008**: The chat MUST only access documents and conversations belonging to the signed-in owner.
- **FR-009**: The chat MUST show progress while an answer is being prepared and a retryable error if it fails, preserving the conversation.
- **FR-010**: The chat MUST support questions in the language the owner writes in and reply in that same language.
- **FR-011**: The chat MUST show an empty state, with guidance to upload documents, when the owner has no analyzed documents.
- **FR-012**: Document text MUST be treated as data and MUST NOT be able to alter the chat's behavior or reveal other owners' data.
- **FR-013**: The chat MUST be read-only: it reports on documents but does not modify, delete or re-analyze them.
- **FR-014**: The chat MUST offer a few suggested example questions on an empty conversation to help the owner get started.

### Key Entities

- **Conversation**: A dialogue between the owner and the chat. Has a title (derived from the first question), creation and last-activity dates, and belongs to one owner.
- **Message**: One turn in a conversation, either from the owner or from the chat. Has text, a timestamp, and, for chat replies, the list of source documents used.
- **Source reference**: A link from an answer to an analyzed document (name, type, period).
- **Analyzed document data**: The existing extracted records and type-specific data of the owner's files, which the chat reads but does not change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can go from opening the home screen to reading an answer to their first question in under 30 seconds of their own effort (typing included, excluding answer preparation).
- **SC-002**: At least 95% of answers shown for a set of reference questions about known documents contain figures that exactly match the extracted data.
- **SC-003**: In reference questions whose answer is not present in the documents, at least 95% of replies state the information is unavailable rather than giving a figure.
- **SC-004**: 90% of answers appear within 10 seconds of sending the question.
- **SC-005**: 100% of answers that use document data list at least one source document that opens correctly.
- **SC-006**: 90% of owners can find a figure from their documents through the chat on their first attempt without help.
- **SC-007**: No test case allows one owner to obtain data from another owner's documents or conversations.

## Assumptions

- The app is used by an authenticated owner whose documents and extracted data already exist from earlier features (file upload, dashboard metrics and per-document-type data); this feature reads that data.
- The chat answers from extracted data, not from re-reading original files at question time.
- Conversations are private to their owner and kept until the owner deletes them.
- Answers are text, optionally with simple formatted figures or tables; generating charts inside the chat is out of scope for this version.
- The chat does not take actions (uploading, editing, deleting, re-analyzing); it is for consultation only.
- Voice input, attachments inside the chat, sharing conversations and exporting them are out of scope.
- Desktop and mobile web layouts are both supported, consistent with the rest of the app.
- Reasonable usage limits per owner (message length and request rate) apply to control cost; exact values are decided at planning time.
- Answer generation relies on the same AI provider already used for document analysis.
