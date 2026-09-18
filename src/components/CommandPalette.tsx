import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type TransitionEvent } from 'react';
import { Hash, MessageCircle, Search, Server, Volume2 } from 'lucide-react';
import { conversationLabel } from '@/lib/dm';
import { useEscapeKey } from '@/lib/use-escape-key';
import type { AgreeChannel, AgreeConversation, AgreeServer } from '@/lib/types';

export type PaletteItem =
  | { kind: 'server'; id: string; label: string }
  | { kind: 'channel'; id: string; label: string; channelType: AgreeChannel['type']; serverName: string }
  | { kind: 'dm'; id: string; label: string; conversation: AgreeConversation };

/**
 * Busca rápida (Ctrl+K) por servidor, canal do servidor aberto e conversa.
 * Overlay no topo da tela, acima das outras modais (`z-30`), com o mesmo
 * fade/scale delas.
 */
export function CommandPalette({
  servers,
  activeServer,
  channels,
  conversations,
  loadingConversations,
  selfId,
  onClose,
  onPick,
}: {
  servers: AgreeServer[];
  activeServer: AgreeServer | null;
  /** Canais do servidor aberto — os únicos carregados; canais de outros servidores não entram na busca. */
  channels: AgreeChannel[];
  conversations: AgreeConversation[];
  loadingConversations: boolean;
  selfId: string;
  onClose: () => void;
  onPick: (item: PaletteItem) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setVisible(true);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEscapeKey(() => setVisible(false));

  function handleBackdropTransitionEnd(e: TransitionEvent) {
    if (e.target === e.currentTarget && !visible) onClose();
  }

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = (label: string) => !q || label.toLowerCase().includes(q);

    const channelItems: PaletteItem[] = activeServer
      ? channels
          .filter((c) => matches(c.name))
          .map((c) => ({ kind: 'channel', id: c._id, label: c.name, channelType: c.type, serverName: activeServer.name }))
      : [];
    const serverItems: PaletteItem[] = servers
      .filter((s) => matches(s.name))
      .map((s) => ({ kind: 'server', id: s._id, label: s.name }));
    const dmItems: PaletteItem[] = conversations
      .map((c) => ({ c, label: conversationLabel(c, selfId) }))
      .filter(({ label }) => matches(label))
      .map(({ c, label }) => ({ kind: 'dm', id: c.id, label, conversation: c }));

    return [...channelItems, ...serverItems, ...dmItems].slice(0, 40);
  }, [query, servers, activeServer, channels, conversations, selfId]);

  useEffect(() => setActiveIndex(0), [items]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function pick(item: PaletteItem) {
    onPick(item);
    setVisible(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length) setActiveIndex((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length) setActiveIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[activeIndex];
      if (item) pick(item);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-30 flex items-start justify-center p-4 pt-[15vh] transition-opacity duration-150 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ background: 'color-mix(in srgb, #06070f 65%, transparent)' }}
      onClick={() => setVisible(false)}
      onTransitionEnd={handleBackdropTransitionEnd}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-[520px] flex-col overflow-hidden rounded-lg shadow-xl transition-all duration-200 ease-out ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        style={{
          background: 'color-mix(in srgb, var(--agree-surface) var(--agree-glass-opacity, 70%), transparent)',
          backdropFilter: 'blur(var(--agree-blur, 20px)) saturate(160%)',
        }}
      >
        <div className="flex items-center gap-2.5 border-b border-divider px-4">
          <Search size={16} className="flex-none text-neutral-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ir para servidor, canal ou conversa…"
            className="h-12 flex-1 bg-transparent text-[14px] outline-none"
          />
          <kbd className="rounded border border-divider px-1.5 py-0.5 text-[10px] text-neutral-500">Esc</kbd>
        </div>

        <div ref={listRef} className="flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto p-2">
          {items.length === 0 && (
            <div className="px-2 py-4 text-center text-[13px] text-neutral-500">
              {loadingConversations ? 'Carregando conversas…' : 'Nada encontrado.'}
            </div>
          )}
          {items.map((item, index) => (
            <button
              key={`${item.kind}:${item.id}`}
              type="button"
              data-index={index}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => pick(item)}
              className={`flex h-10 items-center gap-2.5 rounded-md px-2.5 text-left text-[14px] transition-colors duration-100 ${
                index === activeIndex ? 'bg-accent/15 text-text' : 'text-neutral-300 hover:bg-accent/10 hover:text-text'
              }`}
            >
              <span className="flex w-5 flex-none justify-center text-neutral-500">
                {item.kind === 'server' ? (
                  <Server size={15} />
                ) : item.kind === 'dm' ? (
                  <MessageCircle size={15} />
                ) : item.channelType === 'voice' ? (
                  <Volume2 size={15} />
                ) : (
                  <Hash size={15} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="flex-none text-[11px] text-neutral-500">
                {item.kind === 'server' ? 'Servidor' : item.kind === 'dm' ? 'Conversa' : item.serverName}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
