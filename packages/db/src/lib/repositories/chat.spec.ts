import { randomUUID } from 'node:crypto';
import { ChatMessageEntity } from '../entities';
import { chatRepository } from './chat';
import { describeDb } from './testing';

describeDb('chatRepository', (ctx, dbIt) => {
  const repo = () => chatRepository(ctx().handle.db, ctx().ownerId);
  const other = () => chatRepository(ctx().handle.db, `other-${randomUUID()}`);

  dbIt('names the conversation after the first question, once', async () => {
    const conversation = await repo().createConversation();
    expect(conversation.title).toBe('');
    await repo().appendMessage(conversation.id, {
      role: 'user',
      content: '  How much   did I\nspend?  ',
    });
    await repo().appendMessage(conversation.id, {
      role: 'assistant',
      content: 'You spent 10.',
    });
    await repo().appendMessage(conversation.id, {
      role: 'user',
      content: 'And before?',
    });
    const found = await repo().findConversation(conversation.id);
    expect(found?.title).toBe('How much did I spend?');
  });

  dbIt('lists messages oldest first with their sources', async () => {
    const conversation = await repo().createConversation();
    const fileId = randomUUID();
    await repo().appendMessage(conversation.id, {
      role: 'user',
      content: 'q',
    });
    await repo().appendMessage(conversation.id, {
      role: 'assistant',
      content: 'a',
      sources: [
        {
          fileId,
          name: 'f.pdf',
          documentType: 'payroll',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
        },
      ],
    });
    const messages = await repo().listMessages(conversation.id);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].sources[0]).toMatchObject({ fileId, name: 'f.pdf' });
  });

  dbIt('bumps last activity and orders history by it', async () => {
    const first = await repo().createConversation();
    await repo().appendMessage(first.id, { role: 'user', content: 'one' });
    const second = await repo().createConversation();
    await repo().appendMessage(second.id, { role: 'user', content: 'two' });
    await repo().appendMessage(first.id, { role: 'assistant', content: 'x' });

    const page = await repo().listConversations({ limit: 10 });
    expect(page.items.map((c) => c.id).slice(0, 2)).toEqual([
      first.id,
      second.id,
    ]);
    const small = await repo().listConversations({ limit: 1 });
    expect(small.items).toHaveLength(1);
    expect(small.nextCursor).not.toBeNull();
    const next = await repo().listConversations({
      limit: 1,
      cursor: small.nextCursor ?? undefined,
    });
    expect(next.items[0].id).toBe(second.id);
  });

  dbIt('hides empty conversations from the history', async () => {
    const empty = await repo().createConversation();
    const page = await repo().listConversations({ limit: 50 });
    expect(page.items.find((c) => c.id === empty.id)).toBeUndefined();
  });

  dbIt('deleting a conversation cascades to its messages', async () => {
    const conversation = await repo().createConversation();
    await repo().appendMessage(conversation.id, { role: 'user', content: 'q' });
    expect(await repo().deleteConversation(conversation.id)).toBe(true);
    expect(await repo().findConversation(conversation.id)).toBeNull();
    const left = await ctx()
      .handle.db.getRepository(ChatMessageEntity)
      .countBy({ conversationId: conversation.id });
    expect(left).toBe(0);
    expect(await repo().deleteConversation(conversation.id)).toBe(false);
  });

  dbIt('never exposes another owner’s conversations', async () => {
    const conversation = await repo().createConversation();
    await repo().appendMessage(conversation.id, { role: 'user', content: 'q' });
    const intruder = other();
    expect(await intruder.findConversation(conversation.id)).toBeNull();
    expect(await intruder.listMessages(conversation.id)).toEqual([]);
    expect(
      await intruder.appendMessage(conversation.id, {
        role: 'user',
        content: 'hi',
      }),
    ).toBeNull();
    expect(await intruder.deleteConversation(conversation.id)).toBe(false);
    expect(await repo().findConversation(conversation.id)).not.toBeNull();
  });

  dbIt('keeps error rows out of the context window', async () => {
    const conversation = await repo().createConversation();
    for (const content of ['1', '2', '3']) {
      await repo().appendMessage(conversation.id, { role: 'user', content });
    }
    await ctx()
      .handle.db.getRepository(ChatMessageEntity)
      .update(
        { conversationId: conversation.id, content: '2' },
        { status: 'error' },
      );
    const recent = await repo().recentMessages(conversation.id, 5);
    expect(recent.map((m) => m.content)).toEqual(['1', '3']);
    const last = await repo().recentMessages(conversation.id, 1);
    expect(last.map((m) => m.content)).toEqual(['3']);
  });

  dbIt('counts user messages inside the window only', async () => {
    const conversation = await repo().createConversation();
    // Other tests of the suite share the owner, so compare against a baseline.
    const before = await repo().countUserMessagesSince(60);
    await repo().appendMessage(conversation.id, { role: 'user', content: 'a' });
    await repo().appendMessage(conversation.id, {
      role: 'assistant',
      content: 'b',
    });
    expect(await repo().countUserMessagesSince(60)).toBe(before + 1);
    await ctx()
      .handle.db.getRepository(ChatMessageEntity)
      .update(
        { conversationId: conversation.id, role: 'user' },
        { createdAt: new Date(Date.now() - 120_000) },
      );
    expect(await repo().countUserMessagesSince(60)).toBe(before);
  });
});
