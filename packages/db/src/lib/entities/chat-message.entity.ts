import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { chatRoles, type ChatRole, type SourceRef } from '@org/shared';
import { ChatConversationEntity } from './chat-conversation.entity';
import { OwnedEntity } from './owned-entity';

export const chatMessageStatuses = ['ok', 'error'] as const;
export type ChatMessageStatus = (typeof chatMessageStatuses)[number];

@Entity('chat_messages')
@Index('chat_messages_conversation_created_idx', [
  'conversationId',
  'createdAt',
])
export class ChatMessageEntity extends OwnedEntity {
  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => ChatConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: ChatConversationEntity;

  @Column({ type: 'enum', enum: chatRoles, enumName: 'chat_role' })
  role!: ChatRole;

  @Column({ type: 'text' })
  content!: string;

  /** Assistant only: snapshot of the documents used. No FK, so it survives file deletion. */
  @Column({ type: 'jsonb', default: () => `'[]'::jsonb` })
  sources!: Omit<SourceRef, 'available'>[];

  @Column({
    type: 'enum',
    enum: chatMessageStatuses,
    enumName: 'chat_status',
    default: 'ok',
  })
  status!: ChatMessageStatus;
}
