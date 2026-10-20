import {
  CHAT_MESSAGE_CEILING_CHARS,
  CHAT_TITLE_MAX_CHARS,
  chatStatusSchema,
  conversationTitle,
  conversationsQuerySchema,
  sendMessageSchema,
  sourceRefSchema,
} from './chat';

describe('chat schemas', () => {
  it('trims the message and rejects empty or oversized content', () => {
    expect(sendMessageSchema.parse({ content: '  hola  ' }).content).toBe(
      'hola',
    );
    expect(sendMessageSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(sendMessageSchema.safeParse({}).success).toBe(false);
    expect(
      sendMessageSchema.safeParse({
        content: 'x'.repeat(CHAT_MESSAGE_CEILING_CHARS + 1),
      }).success,
    ).toBe(false);
  });

  it('defaults and bounds the conversations page size', () => {
    expect(conversationsQuerySchema.parse({}).limit).toBe(20);
    expect(conversationsQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(conversationsQuerySchema.safeParse({ limit: '0' }).success).toBe(
      false,
    );
    expect(conversationsQuerySchema.safeParse({ limit: '51' }).success).toBe(
      false,
    );
  });

  it('accepts a source without type or period', () => {
    const source = sourceRefSchema.parse({
      fileId: '7f9c6c3e-5a39-4d2c-9a9a-0d6f1e3c1b11',
      name: 'march.pdf',
      documentType: null,
      periodStart: null,
      periodEnd: null,
      available: false,
    });
    expect(source.available).toBe(false);
  });

  it('validates the status payload', () => {
    expect(
      chatStatusSchema.safeParse({
        enabled: true,
        hasDocuments: false,
        suggestions: ['a'],
      }).success,
    ).toBe(true);
    expect(chatStatusSchema.safeParse({ enabled: true }).success).toBe(false);
  });
});

describe('conversationTitle', () => {
  it('collapses whitespace', () => {
    expect(conversationTitle('  how   much\n did I\tspend? ')).toBe(
      'how much did I spend?',
    );
  });

  it('truncates to the title limit', () => {
    const title = conversationTitle('a'.repeat(500));
    expect(title).toHaveLength(CHAT_TITLE_MAX_CHARS);
    expect(title.endsWith('…')).toBe(true);
  });
});
