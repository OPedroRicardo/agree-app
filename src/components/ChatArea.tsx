import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MessageCirclePlus, Send, Smile, Sparkles, Users } from 'lucide-react';
import type { AgreeChannel, AgreeCustomEmoji, AgreeServer, ChatMessage } from '@/lib/types';
import { replaceShortcodes, SHORTCODE_PREFIX_REGEX } from '@/lib/emoji';
import { useEscapeKey } from '@/lib/use-escape-key';
import { COMPOSER_INPUT_ID } from '@/lib/use-keyboard-shortcuts';
import { Avatar, initialsOf } from './Avatar';
import { EmojiPicker, EmojiSuggestions, searchEmojis, type EmojiSuggestion } from './EmojiPicker';
import { MessageContent } from './MessageContent';
import { RelativeTime } from './RelativeTime';

/**
 * Message list, composer and header for the active channel or DM. `dmMode`
 * reuses `channel` as a `{_id, name}` stand-in for the conversation and swaps
 * the channel/server-shaped header, empty states and placeholders for
 * conversation-shaped ones. Purely presentational. `voiceView`, when given
 * (a voice channel), replaces the message list and composer — the header stays.
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
  voiceView,
  customEmojis,
  onManageEmojis,
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
  /** Call view for a voice channel, in place of the messages and the composer. */
  voiceView?: ReactNode;
  /** Emojis `:nome:` resolvíveis aqui — os do servidor aberto, ou a união de todos em DM. */
  customEmojis: AgreeCustomEmoji[];
  /** Abre a gestão de emojis do servidor; ausente em DM. */
  onManageEmojis?: () => void;
}) {
  const [composer, setComposer] = useState('');
  /** Posição do cursor no composer, para o autocomplete olhar só o que vem antes dele e para inserir emoji no lugar certo. */
  const [caret, setCaret] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  /** O `:nome` que o usuário mandou fechar com Esc — some até ele digitar outra coisa. */
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Cursor a aplicar depois que o React pintar o `composer` novo (inserção de emoji). */
  const pendingCaretRef = useRef<number | null>(null);
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

  // O `:nom` logo antes do cursor, se houver — é o que alimenta as sugestões.
  const shortcodeMatch = useMemo(() => SHORTCODE_PREFIX_REGEX.exec(composer.slice(0, caret)), [composer, caret]);
  const suggestions = useMemo(
    () => (shortcodeMatch && shortcodeMatch[0] !== dismissedQuery ? searchEmojis(shortcodeMatch[1], customEmojis) : []),
    [shortcodeMatch, dismissedQuery, customEmojis],
  );
  const suggestionsOpen = suggestions.length > 0;

  useEffect(() => setSuggestionIndex(0), [suggestions]);
  useEscapeKey(() => setDismissedQuery(shortcodeMatch?.[0] ?? null), suggestionsOpen);

  useEffect(() => {
    if (pendingCaretRef.current === null) return;
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
    }
    pendingCaretRef.current = null;
  }, [composer]);

  /** Troca `[from, to)` do composer por `text` e deixa o cursor logo depois. */
  function replaceRange(from: number, to: number, text: string) {
    setComposer(composer.slice(0, from) + text + composer.slice(to));
    const next = from + text.length;
    setCaret(next);
    pendingCaretRef.current = next;
  }

  function applySuggestion(suggestion: EmojiSuggestion) {
    if (!shortcodeMatch) return;
    replaceRange(caret - shortcodeMatch[0].length, caret, `${suggestion.insert} `);
    setDismissedQuery(null);
  }

  function handlePickFromPicker(suggestion: EmojiSuggestion) {
    replaceRange(caret, caret, suggestion.insert);
    setShowPicker(false);
  }

  function handleComposerKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (suggestionsOpen && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestionIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[suggestionIndex]);
        return;
      }
    }
    if (e.key === 'Enter') handleSend();
  }

  function handleSend() {
    const text = composer.trim();
    if (!text || !channel) return;
    onSend(replaceShortcodes(text, customEmojis));
    setComposer('');
    setCaret(0);
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
            title="Membros"
            className="text-[17px] transition-all duration-200 hover:scale-110 active:scale-90"
            style={{ color: showMembers ? 'var(--agree-accent)' : 'var(--agree-neutral-500)' }}
          >
            <Users size={17} />
          </button>
        )}
      </div>

      {voiceView ?? (
        <>
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
                    <RelativeTime iso={msg.createdAt} className="text-[11px] text-neutral-500" />
                  </div>
                  <MessageContent text={msg.content} customEmojis={customEmojis} />
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
            className="relative flex h-18 flex-none items-center gap-2.5"
            style={{
              background: 'var(--agree-bg)',
              backdropFilter: 'blur(var(--agree-blur, 16px))',
            }}
          >
            {suggestionsOpen && (
              <EmojiSuggestions
                suggestions={suggestions}
                activeIndex={suggestionIndex}
                onPick={applySuggestion}
                onHover={setSuggestionIndex}
              />
            )}
            {showPicker && (
              <EmojiPicker
                customEmojis={customEmojis}
                onPick={handlePickFromPicker}
                onClose={() => setShowPicker(false)}
                onManageEmojis={
                  onManageEmojis &&
                  (() => {
                    setShowPicker(false);
                    onManageEmojis();
                  })
                }
              />
            )}
            <input
              ref={inputRef}
              id={COMPOSER_INPUT_ID}
              type="text"
              value={composer}
              disabled={!channel}
              onChange={(e) => {
                setComposer(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setDismissedQuery(null);
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? composer.length)}
              onKeyDown={handleComposerKeyDown}
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
              onClick={() => setShowPicker((v) => !v)}
              disabled={!channel}
              title="Emoji"
              className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-neutral-500 transition-all duration-150 hover:scale-105 hover:bg-accent/10 hover:text-text active:scale-90 disabled:opacity-40"
              style={showPicker ? { color: 'var(--agree-accent)' } : undefined}
            >
              <Smile size={18} />
            </button>
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
        </>
      )}
    </div>
  );
}
