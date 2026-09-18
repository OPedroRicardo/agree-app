import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { featuredGifs, GIF_PROVIDER_NAME, GIF_SEARCH_ENABLED, searchGifs, type GifResult } from '@/lib/gifs';
import { useEscapeKey } from '@/lib/use-escape-key';

const DEBOUNCE_MS = 300;

/**
 * Painel de busca de GIFs (GIPHY) embutido na {@link ServerEmojisModal}:
 * campo de busca com debounce, grade de previews e "em alta" enquanto a
 * busca está vazia. Escolher um GIF devolve a URL para o formulário — o
 * painel não cadastra nada sozinho.
 */
export function GifSearch({ onPick, onClose }: { onPick: (gif: GifResult) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(GIF_SEARCH_ENABLED);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEscapeKey(onClose);

  useEffect(() => {
    if (!GIF_SEARCH_ENABLED) return;
    const controller = new AbortController();
    const q = query.trim();
    setLoading(true);
    setError(null);

    // Debounce só na busca digitada; "em alta" sai na hora ao abrir.
    const timer = setTimeout(
      () => {
        (q ? searchGifs(q, 24, controller.signal) : featuredGifs(24, controller.signal))
          .then((list) => {
            if (!controller.signal.aborted) setResults(list);
          })
          .catch((err) => {
            if (controller.signal.aborted) return;
            setError(err instanceof Error ? err.message : 'Não foi possível buscar GIFs.');
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      q ? DEBOUNCE_MS : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-divider bg-bg/40 p-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Buscar GIF no ${GIF_PROVIDER_NAME}…`}
          disabled={!GIF_SEARCH_ENABLED}
          className="min-h-8 min-w-0 flex-1 rounded-md border border-divider bg-bg/60 px-2.5 py-1 text-[13px] outline-none transition-colors focus-visible:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar busca de GIFs"
          className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-accent/10 hover:text-text"
        >
          <X size={14} />
        </button>
      </div>

      {!GIF_SEARCH_ENABLED && (
        <div className="px-1 py-2 text-[12px] text-neutral-500">
          Busca de GIFs desligada: defina <code className="font-mono">VITE_GIPHY_API_KEY</code> no{' '}
          <code className="font-mono">.env.local</code> (chave grátis em developers.giphy.com) e reinicie o app.
        </div>
      )}
      {GIF_SEARCH_ENABLED && error && <div className="px-1 py-2 text-[12px] text-danger">{error}</div>}
      {GIF_SEARCH_ENABLED && !error && !loading && results.length === 0 && (
        <div className="px-1 py-2 text-[12px] text-neutral-500">Nenhum GIF para "{query.trim()}".</div>
      )}

      {GIF_SEARCH_ENABLED && results.length > 0 && (
        <div className={`grid max-h-56 grid-cols-4 gap-1 overflow-y-auto transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {results.map((gif) => (
            <button
              key={gif.id}
              type="button"
              title={gif.title || 'Usar este GIF'}
              onClick={() => onPick(gif)}
              className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-bg/60 transition-all duration-100 hover:ring-2 hover:ring-accent active:scale-95"
            >
              <img src={gif.previewUrl} alt={gif.title} loading="lazy" draggable={false} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="px-1 text-right text-[10px] text-neutral-600">Powered by {GIF_PROVIDER_NAME}</div>
    </div>
  );
}
