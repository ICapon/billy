'use client';

import { Button } from '@heroui/react';
import type { Conversation } from '@org/shared';
import { formatDateTime } from '../../lib/format';

export function ConversationList({
  conversations,
  activeId,
  hasMore,
  onOpen,
  onDelete,
  onMore,
}: {
  conversations: Conversation[];
  activeId: string | null;
  hasMore: boolean;
  onOpen: (id: string) => void;
  onDelete: (conversation: Conversation) => void;
  onMore: () => void;
}) {
  if (conversations.length === 0) {
    return <p className="text-sm text-muted">Aún no tienes conversaciones.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {conversations.map((conversation) => (
          <li
            key={conversation.id}
            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${
              conversation.id === activeId ? 'bg-default' : 'hover:bg-default'
            }`}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 flex-col items-start text-left"
              aria-current={conversation.id === activeId}
              onClick={() => onOpen(conversation.id)}
            >
              <span className="w-full truncate text-sm">
                {conversation.title}
              </span>
              <span className="text-xs text-muted">
                {formatDateTime(conversation.lastMessageAt)}
              </span>
            </button>
            <button
              type="button"
              className="shrink-0 text-xs text-muted hover:text-danger"
              aria-label={`Eliminar conversación: ${conversation.title}`}
              onClick={() => onDelete(conversation)}
            >
              Eliminar
            </button>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button size="sm" variant="secondary" onPress={onMore}>
          Ver más
        </Button>
      )}
    </div>
  );
}
