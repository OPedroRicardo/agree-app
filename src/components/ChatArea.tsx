import { useEffect, useRef, useState } from 'react';
import { MessageCirclePlus, Send, Sparkles, Users } from 'lucide-react';
import type { AgreeChannel, AgreeServer, ChatMessage } from '@/lib/types';
import { Avatar, initialsOf } from './Avatar';

/** Formats an ISO timestamp as `HH:MM` (pt-BR). */
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Message list, composer and header for the active channel or DM. `dmMode`
 * reuses `channel` as a `{_id, name}` stand-in for the conversation and swaps
 * the channel/server-shaped header, empty states and placeholders for
 * conversation-shaped ones. Purely presentational.
 */
export function ChatArea({
  server,
  channel,
  dmMode = false,
  loadingChannels,
  messages,
  loading,
  connected,
  hasMoreMessages,
  loadingMoreMessages,
  onLoadMoreMessages,
  chatError,
  onDismissChatError,
  showMembers,
  onToggleMembers,
  onSend,
}: {
  server: AgreeServer | null;
  channel: Pick<AgreeChannel, '_id' | 'name'> | null;
  dmMode?: boolean;
  /** Ignored in `dmMode`. */
  loadingChannels: boolean;
  messages: ChatMessage[];
  loading: boolean;
  connected: boolean;
  /** Whether an older page of `messages` might still exist. */
  hasMoreMessages: boolean;
  loadingMoreMessages: boolean;
  onLoadMoreMessages: () => void;
  /** Chat WS error the app couldn't resolve on its own. */
  chatError: string | null;
  onDismissChatError: () => void;
  showMembers: boolean;
  onToggleMembers: () => void;
  onSend: (text: string) => void;
}) {
  const [composer, setComposer] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  /** Set right before requesting an older page, so the effect below restores the scroll offset instead of jumping to the bottom like it does for a new message. */
  const scrollHeightBeforeLoadRef = useRef<number | null>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (scrollHeightBeforeLoadRef.current !== null) {
      el.scrollTop = el.scrollHeight - scrollHeightBeforeLoadRef.current;
      scrollHeightBeforeLoadRef.current = null;
      return;
    }
    el.scrollTo({ top: el.scrollHeight });
  }, [messages]);

  function handleLoadMore() {
    scrollHeightBeforeLoadRef.current = messagesRef.current?.scrollHeight ?? null;
    onLoadMoreMessages();
  }

  useEffect(() => {
    if (!chatError) return;
    const timer = setTimeout(onDismissChatError, 5000);
    return () => clearTimeout(timer);
  }, [chatError, onDismissChatError]);

  function handleSend() {
    const text = composer.trim();
    if (!text || !channel) return;
    onSend(text);
    setComposer('');
  }

  return (
    <div
      className="flex min-w-0 flex-1 flex-col overflow-hidden"
      style={{ background: 'color-mix(in srgb, var(--agree-bg) var(--agree-glass-opacity, 30%), transparent)' }}
    >
      <div
        className="flex h-14 flex-none items-center gap-3 border-b border-divider px-5"
        style={{
          background: 'color-mix(in srgb, var(--agree-bg) var(--agree-glass-opacity, 35%), transparent)',
          backdropFilter: 'blur(var(--agree-blur, 16px))',
        }}
      >
        <div className="text-[15px] font-semibold">
          {dmMode
            ? channel
              ? `@ ${channel.name}`
              : 'Selecione uma conversa'
            : channel && server
              ? `# ${channel.name} · ${server.name}`
              : server
                ? 'Crie um canal para começar'
                : 'Nenhum servidor selecionado'}
        </div>
        <div
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${connected ? 'bg-online' : 'bg-neutral-600'}`}
          style={connected ? { animation: 'agree-pulse 2s ease-in-out infinite' } : undefined}
          title={connected ? 'WebSocket conectado' : 'WebSocket desconectado'}
        />
        <div className="flex-1" />
        {!dmMode && (
          <button
            type="button"
            onClick={onToggleMembers}
            title="Membros (em breve)"
            className="text-[17px] transition-all duration-200 hover:scale-110 active:scale-90"
            style={{ color: showMembers ? 'var(--agree-accent)' : 'var(--agree-neutral-500)' }}
          >
            <Users size={17} />
          </button>
        )}
      </div>

      <div ref={messagesRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-5" style={{ background: 'var(--agree-chat-bg)' }}>
        {!dmMode && !server && (
          <div className="m-auto text-[13px] text-neutral-500">
            Crie ou selecione um servidor para conversar.
          </div>
        )}
        {!dmMode && server && loadingChannels && (
          <div className="m-auto text-[13px] text-neutral-500">Carregando canais…</div>
        )}
        {!dmMode && server && !loadingChannels && !channel && (
          <div className="m-auto text-[13px] text-neutral-500">
            Este servidor ainda não tem canais. Crie um pra começar.
          </div>
        )}
        {dmMode && !channel && (
          <div className="m-auto flex flex-col items-center gap-3 text-center" style={{ animation: 'agree-fade-up 0.3s ease both' }}>
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-accent"
              style={{
                background: 'color-mix(in srgb, var(--agree-accent) 15%, transparent)',
                animation: 'agree-float 3s ease-in-out infinite',
              }}
            >
              <MessageCirclePlus size={24} />
            </div>
            <div className="text-[14px] font-medium text-text">Suas conversas estão ali do lado</div>
            <div className="text-[12px] text-neutral-500">Escolha alguém na lista ou comece uma DM nova.</div>
          </div>
        )}
        {channel && loading && (
          <div className="m-auto text-[13px] text-neutral-500">Carregando histórico…</div>
        )}
        {channel && !loading && messages.length > 0 && hasMoreMessages && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMoreMessages}
            className="mx-auto rounded-md px-3 py-1.5 text-[12px] text-neutral-500 transition-all duration-150 hover:bg-accent/10 hover:text-text disabled:opacity-50"
          >
            {loadingMoreMessages ? 'Carregando…' : 'Carregar mensagens mais antigas'}
          </button>
        )}
        {channel && !loading && messages.length === 0 && (
          <div className="m-auto flex flex-col items-center gap-3 text-center" style={{ animation: 'agree-fade-up 0.3s ease both' }}>
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-accent"
              style={{
                background: 'color-mix(in srgb, var(--agree-accent) 15%, transparent)',
                animation: 'agree-float 3s ease-in-out infinite',
              }}
            >
              <Sparkles size={24} />
            </div>
            <div className="text-[14px] font-medium text-text">
              {dmMode ? `Ainda não rolou papo com ${channel.name}` : `#${channel.name} está esperando a primeira mensagem`}
            </div>
            <div className="text-[12px] text-neutral-500">Manda um oi pra quebrar o gelo.</div>
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

      {chatError && (
        <div
          className="mx-5 mb-2.5 flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-danger"
          style={{ animation: 'agree-fade-up 0.2s ease both' }}
        >
          <span>{chatError}</span>
          <button
            type="button"
            onClick={onDismissChatError}
            className="text-[11px] font-medium underline-offset-2 hover:underline"
          >
            Fechar
          </button>
        </div>
      )}

      <div
        className="flex h-18 flex-none items-center gap-2.5"
        style={{
          background: 'var(--agree-bg)',
          backdropFilter: 'blur(var(--agree-blur, 16px))',
        }}
      >
        <input
          type="text"
          value={composer}
          disabled={!channel}
          onChange={(e) => setComposer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder={
            channel
              ? dmMode
                ? `Enviar mensagem para ${channel.name}`
                : `Enviar mensagem em #${channel.name}`
              : dmMode
                ? 'Selecione uma conversa'
                : 'Selecione um canal'
          }
          className="h-full flex-1 rounded-lg border-none bg-transparent pl-3 text-[14px] outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!channel || !composer.trim()}
          title="Enviar"
          className="mr-3 flex h-10 w-10 flex-none items-center justify-center rounded-full border border-accent text-accent transition-all duration-150 hover:scale-105 hover:bg-accent/10 hover:shadow-[0_0_0_4px_rgba(145,132,217,0.15)] active:scale-90 disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
