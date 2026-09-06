'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, Users } from 'lucide-react';
import type { AgreeServer, ChatMessage } from '@/lib/types';
import { Avatar, initialsOf } from './Avatar';

/** Formats an ISO timestamp as `HH:MM` (pt-BR). */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Message list, composer and header for the active channel. Purely presentational. */
export function ChatArea({
  server,
  messages,
  loading,
  connected,
  showMembers,
  onToggleMembers,
  onSend,
}: {
  server: AgreeServer | null;
  messages: ChatMessage[];
  loading: boolean;
  connected: boolean;
  showMembers: boolean;
  onToggleMembers: () => void;
  onSend: (text: string) => void;
}) {
  const [composer, setComposer] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages]);

  function handleSend() {
    const text = composer.trim();
    if (!text || !server) return;
    onSend(text);
    setComposer('');
  }

  return (
    <div
      className="flex min-w-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'color-mix(in srgb, var(--agree-bg) 30%, transparent)' }}
    >
      <div
        className="flex h-14 flex-none items-center gap-3 border-b border-divider px-5"
        style={{
          background: 'color-mix(in srgb, var(--agree-bg) 35%, transparent)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="text-[15px] font-semibold">
          {server ? `# geral · ${server.name}` : 'Nenhum servidor selecionado'}
        </div>
        <div
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${connected ? 'bg-online' : 'bg-neutral-600'}`}
          style={connected ? { animation: 'agree-pulse 2s ease-in-out infinite' } : undefined}
          title={connected ? 'WebSocket conectado' : 'WebSocket desconectado'}
        />
        <div className="flex-1" />
        <button
          type="button"
          onClick={onToggleMembers}
          title="Membros (em breve)"
          className="text-[17px] transition-all duration-200 hover:scale-110 active:scale-90"
          style={{ color: showMembers ? 'var(--agree-accent)' : 'var(--agree-neutral-500)' }}
        >
          <Users size={17} />
        </button>
      </div>

      <div ref={messagesRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-5" style={{ background: 'var(--agree-chat-bg)' }}>
        {!server && (
          <div className="m-auto text-[13px] text-neutral-500">
            Crie ou selecione um servidor para conversar.
          </div>
        )}
        {server && loading && (
          <div className="m-auto text-[13px] text-neutral-500">Carregando histórico…</div>
        )}
        {server && !loading && messages.length === 0 && (
          <div className="m-auto text-[13px] text-neutral-500">
            Nenhuma mensagem ainda em #geral. Diga oi!
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className="flex gap-3 rounded-md p-1.5 transition-all duration-150 hover:translate-x-0.5 hover:bg-white/[.03]"
            style={{ animation: 'agree-fade-up 0.3s ease both' }}
          >
            <Avatar
              seed={msg.senderUsername || msg.senderId}
              avatarUrl={msg.senderAvatarUrl || undefined}
              size={36}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-semibold">
                  {msg.senderUsername || initialsOf(msg.senderId)}
                </span>
                <span className="text-[11px] text-neutral-500">
                  {formatTime(msg.createdAt)}
                </span>
              </div>
              <div className="wrap-break-word text-[14px] leading-relaxed">{msg.content}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="m-2 flex h-15 flex-none items-center gap-2.5 rounded-lg"
        style={{
          background: 'var(--agree-bg)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <input
          type="text"
          value={composer}
          disabled={!server}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder={server ? 'Enviar mensagem em #geral' : 'Selecione um servidor'}
          className="h-full flex-1 rounded-lg border-none bg-transparent pl-3 text-[14px] outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!server || !composer.trim()}
          title="Enviar"
          className="mr-3 flex h-10 w-10 flex-none items-center justify-center rounded-full border border-accent text-accent transition-all duration-150 hover:scale-105 hover:bg-accent/10 hover:shadow-[0_0_0_4px_rgba(145,132,217,0.15)] active:scale-90 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
