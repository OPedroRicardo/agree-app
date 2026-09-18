import { useEffect, useMemo, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { EMOJI_GROUPS, EMOJI_LIST, type EmojiEntry } from '@/lib/emoji-data';
import { twemojiUrl, type EmojiToken } from '@/lib/emoji';
import { useEscapeKey } from '@/lib/use-escape-key';
import type { AgreeCustomEmoji } from '@/lib/types';
import { EmojiImage } from './MessageContent';

/** Um item selecionável: o que inserir no texto e como desenhar. */
export type EmojiSuggestion = {
  key: string;
  /** Texto que entra no composer — o caractere unicode ou `:nome:` para custom. */
  insert: string;
  name: string;
  token: Exclude<EmojiToken, { type: 'text' }>;
};

function customSuggestion(emoji: AgreeCustomEmoji): EmojiSuggestion {
  return {
    key: `custom:${emoji._id}`,
    insert: `:${emoji.name}:`,
    name: emoji.name,
    token: { type: 'custom', name: emoji.name, url: emoji.url },
  };
}

function unicodeSuggestion(entry: EmojiEntry): EmojiSuggestion {
  return {
    key: `unicode:${entry.name}`,
    insert: entry.char,
    name: entry.name,
    token: { type: 'emoji', char: entry.char, url: twemojiUrl(entry.char) },
  };
}

/** Busca por prefixo/substring no nome; custom do servidor primeiro, depois a tabela unicode. */
export function searchEmojis(query: string, customEmojis: AgreeCustomEmoji[], limit = 8): EmojiSuggestion[] {
  const q = query.toLowerCase();
  const rank = (name: string) => (name.startsWith(q) ? 0 : name.includes(q) ? 1 : -1);

  const custom = customEmojis
    .map((e) => ({ r: rank(e.name), e }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r)
    .map(({ e }) => customSuggestion(e));
  const unicode = EMOJI_LIST.map((e) => ({ r: rank(e.name), e }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r)
    .map(({ e }) => unicodeSuggestion(e));

  return [...custom, ...unicode].slice(0, limit);
}

/**
 * Popover de emojis ancorado no composer: uma seção "Servidor" com os custom
 * e as seções da tabela unicode, com busca por nome. Chrome do
 * {@link DeviceMenu} (fecha em clique fora / Esc).
 */
export function EmojiPicker({
  customEmojis,
  onPick,
  onClose,
  onManageEmojis,
}: {
  customEmojis: AgreeCustomEmoji[];
  onPick: (suggestion: EmojiSuggestion) => void;
  onClose: () => void;
  /** Presente só quando há um servidor cujos emojis podem ser gerenciados. */
  onManageEmojis?: () => void;
}) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEscapeKey(onClose);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (name: string) => !q || name.includes(q);
    const result: { title: string; items: EmojiSuggestion[] }[] = [];

    const custom = customEmojis.filter((e) => matches(e.name)).map(customSuggestion);
    if (custom.length > 0 || (!q && onManageEmojis)) result.push({ title: 'Servidor', items: custom });

    for (const group of EMOJI_GROUPS) {
      const items = EMOJI_LIST.filter((e) => e.group === group && matches(e.name)).map(unicodeSuggestion);
      if (items.length > 0) result.push({ title: group, items });
    }
    return result;
  }, [query, customEmojis, onManageEmojis]);

  return (
    <div
      ref={ref}
      className="absolute right-3 bottom-full z-30 mb-2 flex w-[360px] flex-col rounded-md border border-divider shadow-xl"
      style={{
        background: 'var(--agree-surface)',
        backdropFilter: 'blur(var(--agree-blur, 16px)) saturate(160%)',
        animation: 'agree-fade-up 0.15s ease both',
      }}
    >
      <div className="flex items-center gap-2 border-b border-divider p-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar emoji…"
          className="min-h-8 flex-1 rounded-md border border-divider bg-bg/60 px-2.5 py-1 text-[13px] outline-none transition-colors focus-visible:border-accent"
        />
        {onManageEmojis && (
          <button
            type="button"
            onClick={onManageEmojis}
            title="Gerenciar emojis do servidor"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-accent/10 hover:text-text"
          >
            <Settings2 size={15} />
          </button>
        )}
      </div>

      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto p-2">
        {sections.length === 0 && (
          <div className="px-1 py-3 text-center text-[12px] text-neutral-500">Nenhum emoji com esse nome.</div>
        )}
        {sections.map((section) => (
          <div key={section.title}>
            <div className="px-1 pb-1 text-[11px] font-semibold text-neutral-500">{section.title}</div>
            {section.items.length === 0 ? (
              <div className="px-1 pb-1 text-[12px] text-neutral-500">
                Nenhum emoji personalizado ainda — adicione um pelo botão acima.
              </div>
            ) : (
              <div className="grid grid-cols-8 gap-0.5">
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    title={`:${item.name}:`}
                    onClick={() => onPick(item)}
                    className="flex h-9 w-full items-center justify-center rounded-md text-[20px] transition-all duration-100 hover:bg-accent/15 active:scale-90"
                  >
                    <EmojiImage token={item.token} size={24} />
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Sugestões enquanto o usuário digita `:nom` no composer — uma lista vertical
 * curta, navegável pelas setas do próprio input (o {@link ChatArea} controla
 * `activeIndex`; aqui só se desenha).
 */
export function EmojiSuggestions({
  suggestions,
  activeIndex,
  onPick,
  onHover,
}: {
  suggestions: EmojiSuggestion[];
  activeIndex: number;
  onPick: (suggestion: EmojiSuggestion) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div
      className="absolute bottom-full left-3 z-30 mb-2 flex w-72 flex-col rounded-md border border-divider p-1.5 shadow-xl"
      style={{
        background: 'var(--agree-surface)',
        backdropFilter: 'blur(var(--agree-blur, 16px)) saturate(160%)',
        animation: 'agree-fade-up 0.15s ease both',
      }}
    >
      <div className="px-2 py-1 text-[11px] font-semibold text-neutral-500">Emojis</div>
      {suggestions.map((item, index) => (
        <button
          key={item.key}
          type="button"
          onMouseEnter={() => onHover(index)}
          // `mousedown` e não `click`: o click roubaria o foco do input antes de inserir.
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(item);
          }}
          className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors duration-100 ${
            index === activeIndex ? 'bg-accent/15 text-text' : 'text-neutral-300 hover:bg-accent/10 hover:text-text'
          }`}
        >
          <EmojiImage token={item.token} size={20} />
          <span className="min-w-0 flex-1 truncate">:{item.name}:</span>
          {item.token.type === 'custom' && <span className="text-[10px] text-neutral-500">servidor</span>}
        </button>
      ))}
    </div>
  );
}
