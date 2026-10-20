import { conversationTitle, type ChatRole, type SourceRef } from '@org/shared';
import type { Database } from '../client';
import {
  ChatConversationEntity,
  ChatMessageEntity,
  type ChatConversationRow,
  type ChatMessageRow,
} from '../entities';
import { decodeCursor, encodeCursor } from './cursor';

export interface NewChatMessage {
  role: ChatRole;
  content: string;
  /** Assistant only. */
  sources?: Omit<SourceRef, 'available'>[];
}

export function chatRepository(db: Database, ownerId: string) {
  const conversations = db.getRepository(ChatConversationEntity);
  const messages = db.getRepository(ChatMessageEntity);

  return {
    createConversation(): Promise<ChatConversationRow> {
      return conversations.save(conversations.create({ ownerId, title: '' }));
    },

    findConversation(id: string): Promise<ChatConversationRow | null> {
      return conversations.findOneBy({ id, ownerId });
    },

    async listConversations(params: {
      cursor?: string;
      limit: number;
    }): Promise<{ items: ChatConversationRow[]; nextCursor: string | null }> {
      const query = conversations
        .createQueryBuilder('c')
        .where('c.owner_id = :ownerId', { ownerId })
        // Conversations that never got a message are not history.
        .andWhere("c.title <> ''");
      const cursor = decodeCursor(params.cursor);
      if (cursor) {
        query.andWhere(
          '(c.last_message_at < :at OR (c.last_message_at = :at AND c.id < :cursorId))',
          { at: new Date(cursor.sortValue), cursorId: cursor.id },
        );
      }
      const rows = await query
        .orderBy('c.last_message_at', 'DESC')
        .addOrderBy('c.id', 'DESC')
        .limit(params.limit + 1)
        .getMany();
      const items = rows.slice(0, params.limit);
      const last = items[items.length - 1];
      return {
        items,
        nextCursor:
          rows.length > params.limit && last
            ? encodeCursor(last.lastMessageAt.toISOString(), last.id)
            : null,
      };
    },

    /** Messages of a conversation, oldest first. */
    listMessages(conversationId: string): Promise<ChatMessageRow[]> {
      return messages.find({
        where: { ownerId, conversationId },
        order: { createdAt: 'ASC', id: 'ASC' },
      });
    },

    /** Deleting the conversation removes its messages (ON DELETE CASCADE). */
    async deleteConversation(id: string): Promise<boolean> {
      const result = await conversations.delete({ id, ownerId });
      return (result.affected ?? 0) > 0;
    },

    /**
     * Stores a message and bumps the conversation's last activity in one transaction.
     * The first message names the conversation; the title never changes afterwards.
     * Returns null when the conversation does not belong to the owner.
     */
    async appendMessage(
      conversationId: string,
      message: NewChatMessage,
    ): Promise<ChatMessageRow | null> {
      return db.transaction(async (manager) => {
        const conversation = await manager.findOne(ChatConversationEntity, {
          where: { id: conversationId, ownerId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!conversation) return null;
        const saved = await manager.save(
          ChatMessageEntity,
          manager.create(ChatMessageEntity, {
            ownerId,
            conversationId,
            role: message.role,
            content: message.content,
            sources: message.sources ?? [],
            status: 'ok',
          }),
        );
        await manager.update(
          ChatConversationEntity,
          { id: conversationId, ownerId },
          {
            lastMessageAt: saved.createdAt,
            ...(conversation.title === '' && message.role === 'user'
              ? { title: conversationTitle(message.content) }
              : {}),
          },
        );
        return saved;
      });
    },

    /** Last `limit` successful messages, oldest first: the context sent to the model. */
    async recentMessages(
      conversationId: string,
      limit: number,
    ): Promise<ChatMessageRow[]> {
      const rows = await messages.find({
        where: { ownerId, conversationId, status: 'ok' },
        order: { createdAt: 'DESC', id: 'DESC' },
        take: limit,
      });
      return rows.reverse();
    },

    /** User messages sent in the last `seconds`, for the per-minute request cap. */
    countUserMessagesSince(seconds: number): Promise<number> {
      return messages
        .createQueryBuilder('m')
        .where('m.owner_id = :ownerId AND m.role = :role', {
          ownerId,
          role: 'user',
        })
        .andWhere(`m.created_at > now() - make_interval(secs => :seconds)`, {
          seconds,
        })
        .getCount();
    },
  };
}

export type ChatRepository = ReturnType<typeof chatRepository>;
