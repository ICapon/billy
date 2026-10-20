'use client';

import { ChatSection } from '../../components/chat/chat-section';

export default function ChatPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Chat</h1>
        <p className="text-sm text-muted">
          Pregunta sobre los documentos que has analizado.
        </p>
        
      </header>
      <ChatSection />
    </div>
  );
}
