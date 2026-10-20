import {
  chatStatusSchema,
  conversationDetailSchema,
  conversationSchema,
  conversationsPageSchema,
  sendMessageResultSchema,
  type ChatStatus,
  type Conversation,
  type ConversationDetail,
  type ConversationsPage,
  type SendMessageResult,
} from '@org/shared';
import { ApiError } from './files-api';

// The browser talks to the API through the /backend proxy (apps/web/src/app/backend).
const BASE = '/backend/chat';

async function request<T>(
  path: string,
  parse: (data: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    ...init,
  });
  if (!response.ok) throw await readError(response);
  return parse(await response.json());
}

async function readError(response: Response): Promise<ApiError> {
  let message = `Error ${response.status}`;
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (body.message) {
      message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message;
    }
  } catch {
    // keep the generic message
  }
  return new ApiError(message, response.status);
}

export function getChatStatus(): Promise<ChatStatus> {
  return request('/status', (data) => chatStatusSchema.parse(data));
}

export function listConversations(
  params: { cursor?: string; limit?: number } = {},
): Promise<ConversationsPage> {
  const query = new URLSearchParams();
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.limit) query.set('limit', String(params.limit));
  const suffix = query.size ? `?${query}` : '';
  return request(`/conversations${suffix}`, (data) =>
    conversationsPageSchema.parse(data),
  );
}

export function createConversation(): Promise<Conversation> {
  return request('/conversations', (data) => conversationSchema.parse(data), {
    method: 'POST',
  });
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return request(`/conversations/${id}`, (data) =>
    conversationDetailSchema.parse(data),
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`${BASE}/conversations/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw await readError(response);
}

export function sendMessage(
  conversationId: string,
  content: string,
): Promise<SendMessageResult> {
  return request(
    `/conversations/${conversationId}/messages`,
    (data) => sendMessageResultSchema.parse(data),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    },
  );
}
