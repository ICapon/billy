import { z } from 'zod';
import { documentTypeSchema } from './document-types';

/** Hard ceiling of a chat message; the configured `CHAT_MAX_MESSAGE_CHARS` can only lower it. */
export const CHAT_MESSAGE_CEILING_CHARS = 10_000;
export const CHAT_TITLE_MAX_CHARS = 120;

export const chatRoles = ['user', 'assistant'] as const;
export const chatRoleSchema = z.enum(chatRoles);
export type ChatRole = z.infer<typeof chatRoleSchema>;

/** A document an answer was based on; a snapshot taken when the answer was written. */
export const sourceRefSchema = z.object({
  fileId: z.uuid(),
  name: z.string(),
  documentType: documentTypeSchema.nullable(),
  periodStart: z.iso.date().nullable(),
  periodEnd: z.iso.date().nullable(),
  /** False when the file no longer exists. */
  available: z.boolean(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const chatMessageSchema = z.object({
  id: z.uuid(),
  role: chatRoleSchema,
  content: z.string(),
  sources: z.array(sourceRefSchema),
  createdAt: z.iso.datetime(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string().max(CHAT_TITLE_MAX_CHARS),
  lastMessageAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const conversationDetailSchema = z.object({
  conversation: conversationSchema,
  messages: z.array(chatMessageSchema),
});
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;

export const conversationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ConversationsQuery = z.infer<typeof conversationsQuerySchema>;

export const conversationsPageSchema = z.object({
  items: z.array(conversationSchema),
  nextCursor: z.string().nullable(),
});
export type ConversationsPage = z.infer<typeof conversationsPageSchema>;

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(CHAT_MESSAGE_CEILING_CHARS),
});
export type SendMessage = z.infer<typeof sendMessageSchema>;

export const sendMessageResultSchema = z.object({
  userMessage: chatMessageSchema,
  assistantMessage: chatMessageSchema,
});
export type SendMessageResult = z.infer<typeof sendMessageResultSchema>;

export const chatStatusSchema = z.object({
  /** False when the chat has no model API key. */
  enabled: z.boolean(),
  hasDocuments: z.boolean(),
  suggestions: z.array(z.string()),
});
export type ChatStatus = z.infer<typeof chatStatusSchema>;

/** Title of a conversation: the first question, whitespace-collapsed and truncated. */
export function conversationTitle(firstMessage: string): string {
  const collapsed = firstMessage.replace(/\s+/g, ' ').trim();
  return collapsed.length > CHAT_TITLE_MAX_CHARS
    ? `${collapsed.slice(0, CHAT_TITLE_MAX_CHARS - 1).trimEnd()}…`
    : collapsed;
}

/** Example questions shown on an empty conversation (the app UI is in Spanish). */
export const chatSuggestions = [
  '¿Cuánto gasté en nómina el mes pasado?',
  '¿Cuál fue el saldo final de mi último estado de cuenta?',
  '¿Qué productos se vendieron más este mes?',
  '¿Tengo facturas pendientes de pago?',
] as const;
