import type {
  BusinessFileRow,
  ChatConversationRow,
  ChatMessageRow,
  ExtractedDocumentRow,
} from '@org/db';
import type { ChatMessage, Conversation, SourceRef } from '@org/shared';

export function toConversation(row: ChatConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    lastMessageAt: row.lastMessageAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** `available` is computed on read: the snapshot survives the file, the link does not. */
export function toChatMessage(
  row: ChatMessageRow,
  existingFileIds: ReadonlySet<string>,
): ChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sources: row.sources.map((source) => ({
      ...source,
      available: existingFileIds.has(source.fileId),
    })),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Name, type and period of a file: the period spans all its documents. */
export function toSourceSnapshot(
  file: BusinessFileRow,
  documents: ExtractedDocumentRow[],
): Omit<SourceRef, 'available'> {
  const starts = documents
    .map((d) => d.periodStart ?? d.issueDate)
    .filter((d): d is string => d !== null);
  const ends = documents
    .map((d) => d.periodEnd ?? d.issueDate)
    .filter((d): d is string => d !== null);
  return {
    fileId: file.id,
    name: file.originalName,
    documentType: file.documentType ?? documents[0]?.type ?? null,
    periodStart: starts.length
      ? starts.reduce((a, b) => (a < b ? a : b))
      : null,
    periodEnd: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
  };
}
