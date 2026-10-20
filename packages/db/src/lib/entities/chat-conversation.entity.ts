import { Column, Entity, Index } from 'typeorm';
import { OwnedEntity } from './owned-entity';

@Entity('chat_conversations')
@Index('chat_conversations_owner_last_idx', ['ownerId', 'lastMessageAt'])
export class ChatConversationEntity extends OwnedEntity {
  /** The first question; empty until the first message is stored. */
  @Column({ type: 'varchar', length: 120, default: '' })
  title!: string;

  @Column({
    name: 'last_message_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastMessageAt!: Date;
}
