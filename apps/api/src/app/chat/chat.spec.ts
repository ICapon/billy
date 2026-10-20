import {
  FakeLlmClient,
  type ConverseBlock,
  type EmbeddingProvider,
} from '@org/ai';
import type {
  ChatStatus,
  ConversationDetail,
  ConversationsPage,
  SendMessageResult,
} from '@org/shared';
import { createTestApp, type TestApp } from '../../testing/test-app';
import { FINAL_ANSWER_TOOL } from '@org/ai';

const toolUse = (
  id: string,
  name: string,
  input: unknown = {},
): ConverseBlock => ({
  type: 'tool_use',
  id,
  name,
  input,
});
const finalAnswer = (text: string, sourceFileIds: string[] = []) =>
  toolUse('fa', FINAL_ANSWER_TOOL, { text, sourceFileIds });

const fakeEmbeddings: EmbeddingProvider = {
  model: 'voyage-3.5-lite',
  dimensions: 1024,
  embed: async () => ({
    embeddings: [new Array(1024).fill(0.01)],
    totalTokens: 7,
  }),
};

describe('Chat API (integration)', () => {
  let t: TestApp | null = null;
  let llm: FakeLlmClient;
  const api = (path: string, init?: RequestInit) =>
    fetch(`${t!.base}/api/chat${path}`, init);
  const post = (path: string, body?: unknown) =>
    api(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const newConversation = async (): Promise<string> =>
    ((await (await post('/conversations')).json()) as { id: string }).id;
  const ask = (id: string, content: string) =>
    post(`/conversations/${id}/messages`, { content });

  const seedFile = async (name: string, type: 'payroll' | 'invoice') => {
    const file = await t!.repos.files.insert({
      originalName: name,
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${t!.ownerId}/${name}`,
      status: 'completed',
    });
    await t!.repos.files.update(file.id, { documentType: type });
    await t!.repos.documents.replaceForFile(file.id, [
      {
        type,
        typeConfidence: 0.9,
        periodStart: '2060-01-01',
        periodEnd: '2060-01-31',
        issueDate: null,
        currency: 'USD',
        consistency: 'ok',
        consistencyNotes: null,
        details: { totalCostMinor: 123456 },
      },
    ]);
    return file;
  };

  beforeEach(async () => {
    llm = new FakeLlmClient();
    t = await createTestApp(
      { CHAT_RATE_LIMIT_PER_MINUTE: '1000', CHAT_MAX_MESSAGE_CHARS: '200' },
      { llm, embeddings: fakeEmbeddings },
    );
  });

  afterEach(async () => {
    await t?.close();
  });

  it('answers from tool data, stores both messages and lists the sources', async () => {
    if (!t) return;
    const file = await seedFile('payroll-jan.pdf', 'payroll');
    llm
      .enqueueTurn({
        content: [toolUse('t1', 'list_documents', { types: ['payroll'] })],
      })
      .enqueueTurn({
        content: [
          finalAnswer('Payroll was 1,234.56 USD.', [file.id, 'not-a-real-id']),
        ],
      });
    const id = await newConversation();

    const response = await ask(id, 'How much payroll in January 2060?');
    expect(response.status).toBe(201);
    const result = (await response.json()) as SendMessageResult;

    expect(result.userMessage).toMatchObject({ role: 'user' });
    expect(result.assistantMessage.content).toBe('Payroll was 1,234.56 USD.');
    expect(result.assistantMessage.sources).toEqual([
      {
        fileId: file.id,
        name: 'payroll-jan.pdf',
        documentType: 'payroll',
        periodStart: '2060-01-01',
        periodEnd: '2060-01-31',
        available: true,
      },
    ]);
    // The model saw the document the tool found (as fenced data).
    const toolResult = llm.converseRequests[1].messages.at(-1)?.content[0];
    expect(toolResult?.type === 'tool_result' && toolResult.content).toContain(
      'payroll-jan.pdf',
    );
    // Model usage was recorded as cost without a file.
    expect(await t.repos.costs.monthToDate()).toBeGreaterThan(0);
    expect((await t.repos.costs.byKind()).llm_text).toBeGreaterThan(0);
  });

  it('records the embedding cost of a semantic search', async () => {
    if (!t) return;
    llm
      .enqueueTurn({
        content: [toolUse('t1', 'search_documents', { query: 'rent' })],
      })
      .enqueueTurn({ content: [finalAnswer('Nothing about rent was found.')] });
    const id = await newConversation();
    const response = await ask(id, 'what about rent?');
    expect(response.status).toBe(201);
    expect((await t.repos.costs.byKind()).embedding).toBeGreaterThan(0);
  });

  it('answers that the data is unavailable with no sources', async () => {
    if (!t) return;
    llm.enqueueTurn({
      content: [finalAnswer('I could not find that in your documents.')],
    });
    const id = await newConversation();
    const result = (await (
      await ask(id, 'What was my 1999 revenue?')
    ).json()) as SendMessageResult;
    expect(result.assistantMessage.sources).toEqual([]);
  });

  it('rejects empty and over-limit messages', async () => {
    if (!t) return;
    const id = await newConversation();
    expect((await ask(id, '   ')).status).toBe(400);
    expect((await ask(id, 'x'.repeat(201))).status).toBe(400);
    expect(llm.converseRequests).toHaveLength(0);
  });

  it('returns 404 for an unknown conversation', async () => {
    if (!t) return;
    const missing = '7f9c6c3e-5a39-4d2c-9a9a-0d6f1e3c1b11';
    expect((await ask(missing, 'hi')).status).toBe(404);
    expect((await api(`/conversations/${missing}`)).status).toBe(404);
    expect(
      (await api(`/conversations/${missing}`, { method: 'DELETE' })).status,
    ).toBe(404);
  });

  it('keeps the question when the model fails and does not duplicate it on retry', async () => {
    if (!t) return;
    llm.enqueueTurn(new Error('provider down'));
    const id = await newConversation();
    const failed = await ask(id, 'Total sales?');
    expect(failed.status).toBe(502);

    llm.enqueueTurn({ content: [finalAnswer('Sales were 10.')] });
    const retried = await ask(id, 'Total sales?');
    expect(retried.status).toBe(201);

    const detail = (await (
      await api(`/conversations/${id}`)
    ).json()) as ConversationDetail;
    expect(detail.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('maps a turn that never finishes to 502', async () => {
    if (!t) return;
    await t.close();
    llm = new FakeLlmClient();
    t = await createTestApp({ CHAT_TURN_TIMEOUT_MS: '50' }, { llm });
    llm.converse = () => new Promise(() => undefined);
    const id = await newConversation();
    expect((await ask(id, 'slow one')).status).toBe(502);
  });

  it('rate limits questions and sends Retry-After', async () => {
    if (!t) return;
    await t.close();
    llm = new FakeLlmClient();
    t = await createTestApp({ CHAT_RATE_LIMIT_PER_MINUTE: '1' }, { llm });
    llm.enqueueTurn({ content: [finalAnswer('one')] });
    const id = await newConversation();
    expect((await ask(id, 'first')).status).toBe(201);
    const limited = await ask(id, 'second');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
  });

  it('answers 503 when the chat has no model configured', async () => {
    if (!t) return;
    await t.close();
    t = await createTestApp({}, { llm: null });
    const id = await newConversation();
    expect((await ask(id, 'hello')).status).toBe(503);
    const status = await (await api('/status')).json();
    expect(status).toMatchObject({ enabled: false });
  });

  it('reports status: documents present and example questions', async () => {
    if (!t) return;
    const empty = (await (await api('/status')).json()) as ChatStatus;
    expect(empty).toMatchObject({ enabled: true, hasDocuments: false });
    expect(empty.suggestions.length).toBeGreaterThan(0);
    await seedFile('inv.pdf', 'invoice');
    expect(await (await api('/status')).json()).toMatchObject({
      hasDocuments: true,
    });
  });

  it('sends earlier turns as context and none for a new conversation', async () => {
    if (!t) return;
    llm
      .enqueueTurn({ content: [finalAnswer('January: 10.')] })
      .enqueueTurn({ content: [finalAnswer('December: 8.')] })
      .enqueueTurn({ content: [finalAnswer('Fresh start.')] });
    const id = await newConversation();
    await ask(id, 'payroll in January?');
    await ask(id, 'and the month before?');

    const followUp = llm.converseRequests[1].messages;
    expect(followUp.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(followUp[0].content[0]).toEqual({
      type: 'text',
      text: 'payroll in January?',
    });
    expect(followUp[1].content[0]).toEqual({
      type: 'text',
      text: 'January: 10.',
    });

    const other = await newConversation();
    await ask(other, 'something else');
    expect(llm.converseRequests[2].messages).toHaveLength(1);
  });

  it('limits the context window to the configured number of messages', async () => {
    if (!t) return;
    await t.close();
    llm = new FakeLlmClient();
    t = await createTestApp({ CHAT_CONTEXT_MESSAGES: '2' }, { llm });
    for (const text of ['a1', 'a2', 'a3']) {
      llm.enqueueTurn({ content: [finalAnswer(text)] });
    }
    const id = await newConversation();
    await ask(id, 'q1');
    await ask(id, 'q2');
    await ask(id, 'q3');
    // History for q3 = last 2 earlier messages (a1 is dropped with q1... a2 pair): q2, a2.
    const messages = llm.converseRequests[2].messages;
    expect(messages).toHaveLength(3);
    expect(messages[0].content[0]).toEqual({ type: 'text', text: 'q2' });
  });

  it('lists, reopens and deletes conversations', async () => {
    if (!t) return;
    llm
      .enqueueTurn({ content: [finalAnswer('a-one')] })
      .enqueueTurn({ content: [finalAnswer('a-two')] });
    const first = await newConversation();
    await ask(first, 'first question');
    const second = await newConversation();
    await ask(second, 'second question');
    await newConversation(); // empty: not listed

    const page = (await (
      await api('/conversations')
    ).json()) as ConversationsPage;
    expect(page.items.map((c) => c.title)).toEqual([
      'second question',
      'first question',
    ]);

    const small = (await (
      await api('/conversations?limit=1')
    ).json()) as ConversationsPage;
    expect(small.items).toHaveLength(1);
    expect(small.nextCursor).not.toBeNull();
    const next = (await (
      await api(`/conversations?limit=1&cursor=${small.nextCursor}`)
    ).json()) as ConversationsPage;
    expect(next.items[0].title).toBe('first question');
    expect((await api('/conversations?limit=0')).status).toBe(400);

    const detail = (await (
      await api(`/conversations/${first}`)
    ).json()) as ConversationDetail;
    expect(detail.messages.map((m) => m.content)).toEqual([
      'first question',
      'a-one',
    ]);

    expect(
      (await api(`/conversations/${first}`, { method: 'DELETE' })).status,
    ).toBe(204);
    expect((await api(`/conversations/${first}`)).status).toBe(404);
  });

  it('marks a source as unavailable once its file is deleted', async () => {
    if (!t) return;
    const file = await seedFile('gone.pdf', 'invoice');
    llm
      .enqueueTurn({ content: [toolUse('t1', 'list_documents')] })
      .enqueueTurn({ content: [finalAnswer('Found it.', [file.id])] });
    const id = await newConversation();
    await ask(id, 'what invoices?');
    await fetch(`${t.base}/api/files/${file.id}`, { method: 'DELETE' });
    const detail = (await (
      await api(`/conversations/${id}`)
    ).json()) as ConversationDetail;
    expect(detail.messages[1].sources[0]).toMatchObject({
      name: 'gone.pdf',
      available: false,
    });
  });

  it('flags files still being analyzed so the model can say so', async () => {
    if (!t) return;
    await t.repos.files.insert({
      originalName: 'pending.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1,
      sha256: Math.random().toString(16).slice(2).padEnd(64, '0'),
      storageKey: `${t.ownerId}/pending.pdf`,
      status: 'processing',
    });
    llm
      .enqueueTurn({ content: [toolUse('t1', 'list_documents')] })
      .enqueueTurn({
        content: [finalAnswer('pending.pdf is still being analyzed.')],
      });
    const id = await newConversation();
    await ask(id, 'what about pending.pdf?');
    const result = llm.converseRequests[1].messages.at(-1)?.content[0];
    expect(result?.type === 'tool_result' && result.content).toContain(
      'filesNotAnalyzed',
    );
    expect(result?.type === 'tool_result' && result.content).toContain(
      'processing',
    );
  });

  it('keeps conversations of another owner invisible', async () => {
    if (!t) return;
    llm.enqueueTurn({ content: [finalAnswer('mine')] });
    const id = await newConversation();
    await ask(id, 'secret question');
    const owner = t;
    const intruder = await createTestApp({}, { llm: new FakeLlmClient() });
    try {
      if (!intruder) return;
      expect(
        (await fetch(`${intruder.base}/api/chat/conversations/${id}`)).status,
      ).toBe(404);
      const page = (await (
        await fetch(`${intruder.base}/api/chat/conversations`)
      ).json()) as ConversationsPage;
      expect(page.items).toEqual([]);
      expect(
        (
          await fetch(
            `${intruder.base}/api/chat/conversations/${id}/messages`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ content: 'hi' }),
            },
          )
        ).status,
      ).toBe(404);
      // The owner's data is untouched.
      expect(
        (await fetch(`${owner.base}/api/chat/conversations/${id}`)).status,
      ).toBe(200);
    } finally {
      await intruder?.close();
    }
  });

  it('answers from the current data after a document is re-analyzed', async () => {
    if (!t) return;
    const file = await seedFile('payroll.pdf', 'payroll');
    llm
      .enqueueTurn({ content: [toolUse('t1', 'list_documents')] })
      .enqueueTurn({ content: [finalAnswer('first', [file.id])] })
      .enqueueTurn({ content: [toolUse('t2', 'list_documents')] })
      .enqueueTurn({ content: [finalAnswer('second', [file.id])] });
    const id = await newConversation();
    await ask(id, 'payroll?');
    await t.repos.documents.replaceForFile(file.id, [
      {
        type: 'payroll',
        typeConfidence: 0.9,
        periodStart: '2060-01-01',
        periodEnd: '2060-01-31',
        issueDate: null,
        currency: 'USD',
        consistency: 'ok',
        consistencyNotes: null,
        details: { totalCostMinor: 999999 },
      },
    ]);
    await ask(id, 'payroll again?');

    const before = llm.converseRequests[1].messages.at(-1)?.content[0];
    const after = llm.converseRequests[3].messages.at(-1)?.content[0];
    expect(before?.type === 'tool_result' && before.content).toContain(
      '123456',
    );
    expect(after?.type === 'tool_result' && after.content).toContain('999999');
    expect(after?.type === 'tool_result' && after.content).not.toContain(
      '123456',
    );
  });
});
