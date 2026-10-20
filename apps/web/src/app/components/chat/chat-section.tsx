'use client';

import { Button, Card } from '@heroui/react';
import type { ChatMessage, ChatStatus, Conversation } from '@org/shared';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createConversation,
  deleteConversation,
  getChatStatus,
  getConversation,
  listConversations,
  sendMessage,
} from '../../lib/chat-api';
import { ConversationList } from './conversation-list';
import { SourceChips } from './source-chips';

const MAX_INPUT_CHARS = 2000;

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'No se pudo obtener la respuesta';
}

/** A pending question whose answer failed: kept so the owner can retry without retyping. */
interface FailedTurn {
  text: string;
  message: string;
}

export function ChatSection() {
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<FailedTurn | null>(null);
  const [draft, setDraft] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadStatus = useCallback(() => {
    setStatusError(null);
    getChatStatus()
      .then(setStatus)
      .catch((e) => setStatusError(errorText(e)));
  }, []);
  useEffect(loadStatus, [loadStatus]);

  const loadHistory = useCallback(async (cursor?: string) => {
    try {
      const page = await listConversations({ cursor, limit: 20 });
      setHistory((current) =>
        cursor ? [...current, ...page.items] : page.items,
      );
      setNextCursor(page.nextCursor);
      setHistoryError(null);
    } catch (e) {
      setHistoryError(errorText(e));
    }
  }, []);
  useEffect(() => {
    if (showHistory) void loadHistory();
  }, [showHistory, loadHistory]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages, pending, failed]);

  const busy = pending !== null;
  const trimmed = draft.trim();
  const tooLong = draft.length > MAX_INPUT_CHARS;

  const ask = async (text: string) => {
    setFailed(null);
    setDraft('');
    setPending(text);
    try {
      // The conversation is created with the first question.
      const id = conversationId ?? (await createConversation()).id;
      setConversationId(id);
      const result = await sendMessage(id, text);
      setMessages((current) => [
        ...current,
        result.userMessage,
        result.assistantMessage,
      ]);
      if (showHistory) void loadHistory();
    } catch (e) {
      setFailed({ text, message: errorText(e) });
    } finally {
      setPending(null);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed || tooLong || busy) return;
    void ask(trimmed);
  };

  const startNew = () => {
    setConversationId(null);
    setMessages([]);
    setFailed(null);
    setPending(null);
    setDraft('');
  };

  const open = async (id: string) => {
    try {
      const detail = await getConversation(id);
      setConversationId(detail.conversation.id);
      setMessages(detail.messages);
      setFailed(null);
    } catch (e) {
      setHistoryError(errorText(e));
    }
  };

  const remove = async (conversation: Conversation) => {
    if (
      !window.confirm(
        `¿Eliminar la conversación "${conversation.title}"? No se puede deshacer.`,
      )
    ) {
      return;
    }
    try {
      await deleteConversation(conversation.id);
      setHistory((current) => current.filter((c) => c.id !== conversation.id));
      if (conversation.id === conversationId) startNew();
    } catch (e) {
      setHistoryError(errorText(e));
    }
  };

  const empty = messages.length === 0 && !pending && !failed;

  return (
    <Card>
      <Card.Header>
        <div className="flex w-full flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <Card.Title>Pregúntale a tus documentos</Card.Title>
            <span className="text-xs text-muted">
              Las respuestas salen de los datos extraídos de tus documentos
              analizados.
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
            >
              Historial
            </Button>
            <Button size="sm" variant="secondary" onPress={startNew}>
              Nueva conversación
            </Button>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <div className="flex flex-col gap-4">
          {showHistory && (
            <div className="rounded-xl border border-separator p-3">
              {historyError && (
                <p role="alert" className="mb-2 text-sm text-danger">
                  {historyError}
                </p>
              )}
              <ConversationList
                conversations={history}
                activeId={conversationId}
                hasMore={nextCursor !== null}
                onOpen={open}
                onDelete={remove}
                onMore={() => nextCursor && void loadHistory(nextCursor)}
              />
            </div>
          )}

          {statusError && !status && (
            <div
              role="alert"
              className="flex flex-col items-start gap-2 text-sm"
            >
              <p className="text-danger">{statusError}</p>
              <Button size="sm" variant="secondary" onPress={loadStatus}>
                Reintentar
              </Button>
            </div>
          )}

          {status && !status.enabled && (
            <p role="alert" className="text-sm text-warning">
              El chat no está configurado: falta la clave del modelo
              (ANTHROPIC_API_KEY).
            </p>
          )}

          {status && status.enabled && !status.hasDocuments && (
            <p className="text-sm text-muted">
              Todavía no hay documentos analizados para consultar.{' '}
              <Link href="/files" className="text-accent underline">
                Sube documentos
              </Link>{' '}
              para empezar.
            </p>
          )}

          {(messages.length > 0 || pending || failed) && (
            <ul
              className="flex max-h-96 flex-col gap-3 overflow-y-auto"
              aria-label="Conversación"
              aria-live="polite"
            >
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {pending && (
                <>
                  <li className="self-end rounded-2xl bg-accent/10 px-3 py-2 text-sm">
                    {pending}
                  </li>
                  <li role="status" className="self-start text-sm text-muted">
                    Buscando en tus documentos…
                  </li>
                </>
              )}
              {failed && (
                <>
                  <li className="self-end rounded-2xl bg-accent/10 px-3 py-2 text-sm">
                    {failed.text}
                  </li>
                  <li
                    role="alert"
                    className="flex flex-col items-start gap-2 self-start text-sm"
                  >
                    <span className="text-danger">{failed.message}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => void ask(failed.text)}
                    >
                      Reintentar
                    </Button>
                  </li>
                </>
              )}
              <div ref={endRef} />
            </ul>
          )}

          {empty && status?.enabled && status.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {status.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-separator px-3 py-1 text-xs hover:bg-default disabled:opacity-50"
                  onClick={() => void ask(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-2">
            <label htmlFor="chat-input" className="sr-only">
              Tu pregunta
            </label>
            <textarea
              id="chat-input"
              rows={2}
              value={draft}
              disabled={busy || (status !== null && !status.enabled)}
              placeholder="Escribe tu pregunta…"
              className="w-full resize-none rounded-xl border border-separator bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <span
                className={`text-xs ${tooLong ? 'text-danger' : 'text-muted'}`}
                role={tooLong ? 'alert' : undefined}
              >
                {tooLong
                  ? `El mensaje es demasiado largo (máximo ${MAX_INPUT_CHARS} caracteres).`
                  : `${draft.length}/${MAX_INPUT_CHARS}`}
              </span>
              <Button
                type="submit"
                size="sm"
                isDisabled={!trimmed || tooLong || busy}
              >
                Enviar
              </Button>
            </div>
          </form>
        </div>
      </Card.Content>
    </Card>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <li className="self-end whitespace-pre-wrap rounded-2xl bg-accent/10 px-3 py-2 text-sm">
        {message.content}
      </li>
    );
  }
  return (
    <li className="self-start rounded-2xl border border-separator px-3 py-2 text-sm">
      <p className="whitespace-pre-wrap">{message.content}</p>
      <SourceChips sources={message.sources} />
    </li>
  );
}
