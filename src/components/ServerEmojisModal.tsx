import { useEffect, useState, type FormEvent, type ReactNode, type TransitionEvent } from 'react';
import { ImagePlay, Trash2, X } from 'lucide-react';
import { isAnimatedEmojiUrl } from '@/lib/emoji';
import type { GifResult } from '@/lib/gifs';
import { useEscapeKey } from '@/lib/use-escape-key';
import type { AgreeCustomEmoji, AgreeServer } from '@/lib/types';
import { GifSearch } from './GifSearch';

/**
 * Lista os emojis personalizados do servidor (com remoção para o dono e para
 * quem cadastrou) e, embaixo, o formulário de cadastro por nome + URL com
 * preview. Mesmo chrome do {@link AddMemberModal}.
 */
export function ServerEmojisModal({
  server,
  selfId,
  onClose,
  onCreate,
  onDelete,
}: {
  server: AgreeServer;
  selfId: string;
  onClose: () => void;
  onCreate: (data: { name: string; url: string }) => Promise<void>;
  onDelete: (emoji: AgreeCustomEmoji) => Promise<void>;
}) {
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [previewFailed, setPreviewFailed] = useState(false);
  const [showGifSearch, setShowGifSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const emojis = server.emojis ?? [];
  const isOwner = Boolean(server.ownerId && server.ownerId === selfId);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEscapeKey(() => setVisible(false));

  function handleBackdropTransitionEnd(e: TransitionEvent) {
    if (e.target === e.currentTarget && !visible) onClose();
  }

  const normalizedName = name.trim().toLowerCase();
  const nameValid = /^[a-z0-9_]{2,32}$/.test(normalizedName);
  const urlValid = /^https?:\/\/\S+$/i.test(url.trim());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nameValid) {
      setError('Nome: de 2 a 32 caracteres, só letras minúsculas, números e _.');
      return;
    }
    if (!urlValid) {
      setError('Informe a URL completa da imagem (http:// ou https://).');
      return;
    }
    if (emojis.some((emoji) => emoji.name === normalizedName)) {
      setError(`Já existe um emoji :${normalizedName}: neste servidor.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name: normalizedName, url: url.trim() });
      setName('');
      setUrl('');
      setPreviewFailed(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Não foi possível cadastrar o emoji.');
    } finally {
      setSubmitting(false);
    }
  }

  /** GIF escolhido na busca → preenche a URL (e sugere um nome a partir do título, se o campo estiver vazio). */
  function handlePickGif(gif: GifResult) {
    setUrl(gif.url);
    setPreviewFailed(false);
    setError(null);
    if (!name.trim()) {
      const suggested = gif.title
        .toLowerCase()
        .replace(/\bgif\b/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 32);
      if (suggested.length >= 2) setName(suggested);
    }
    setShowGifSearch(false);
  }

  async function handleDelete(emoji: AgreeCustomEmoji) {
    setDeletingId(emoji._id);
    setError(null);
    try {
      await onDelete(emoji);
    } catch {
      setError(`Não foi possível remover :${emoji.name}:.`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-20 flex items-center justify-center p-4 transition-opacity duration-150 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ background: 'color-mix(in srgb, #06070f 65%, transparent)' }}
      onClick={() => setVisible(false)}
      onTransitionEnd={handleBackdropTransitionEnd}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-[420px] flex-col gap-3 rounded-lg p-5 shadow-xl transition-all duration-200 ease-out ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        style={{
          background: 'color-mix(in srgb, var(--agree-surface) var(--agree-glass-opacity, 70%), transparent)',
          backdropFilter: 'blur(var(--agree-blur, 20px)) saturate(160%)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[18px] font-semibold">Emojis de {server.name}</div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-neutral-500 transition-all duration-150 hover:rotate-90 hover:text-text"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {emojis.length === 0 && (
            <div className="px-1 py-2 text-[13px] text-neutral-500">
              Nenhum emoji personalizado ainda. Cadastre o primeiro abaixo.
            </div>
          )}
          {emojis.map((emoji) => {
            const canDelete = isOwner || emoji.createdBy === selfId;
            return (
              <div
                key={emoji._id}
                className="flex h-11 items-center gap-2.5 rounded-md px-2 text-[14px] text-neutral-300 transition-colors hover:bg-accent/10"
              >
                <img
                  src={emoji.url}
                  alt={`:${emoji.name}:`}
                  draggable={false}
                  className="h-8 w-8 flex-none object-contain"
                />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">:{emoji.name}:</span>
                {isAnimatedEmojiUrl(emoji.url) && (
                  <span className="text-[10px] uppercase text-neutral-500">gif</span>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(emoji)}
                    disabled={deletingId === emoji._id}
                    title="Remover"
                    className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-danger/15 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-divider pt-3">
          <div className="text-[13px] font-semibold text-neutral-400">Adicionar emoji</div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-3">
              <Field label="Nome" value={name} onChange={setName} placeholder="pepe"/>
              <Field
                label="URL da imagem (png, gif, webp…)"
                value={url}
                onChange={(v) => {
                  setUrl(v);
                  setPreviewFailed(false);
                }}
                placeholder="https://…/pepe.gif"
                action={
                  <button
                    type="button"
                    onClick={() => setShowGifSearch((v) => !v)}
                    title="Buscar GIF"
                    className={`flex h-9 flex-none items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-all duration-150 active:scale-[0.98] ${
                      showGifSearch
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-divider text-neutral-400 hover:border-accent hover:text-accent'
                    }`}
                  >
                    <ImagePlay size={14} />
                    GIF
                  </button>
                }
              />
            </div>
            <div
              className="flex h-20 w-20 flex-none items-center justify-center self-end rounded-md border border-divider bg-bg/40 text-[11px] text-neutral-500"
              title="Preview"
            >
              {urlValid && !previewFailed ? (
                <img
                  src={url.trim()}
                  alt="preview"
                  draggable={false}
                  onError={() => setPreviewFailed(true)}
                  className="h-12 w-12 object-contain"
                />
              ) : previewFailed ? (
                <span className="px-1 text-center text-danger">não carregou</span>
              ) : (
                <span>preview</span>
              )}
            </div>
          </div>

          {showGifSearch && <GifSearch onPick={handlePickGif} onClose={() => setShowGifSearch(false)} />}

          {error && <div className="text-[12px] text-danger">{error}</div>}

          <button
            type="submit"
            disabled={submitting || !name.trim() || !url.trim()}
            className="mt-1 rounded-md border border-accent px-4 py-2 text-[14px] font-medium text-accent transition-all duration-150 hover:bg-accent/10 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? 'Cadastrando…' : 'Cadastrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  action,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  /** Botão ao lado do campo (ex.: "Buscar GIF"). */
  action?: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-neutral-400">{label}</span>
      <span className="flex items-center gap-1">
        {prefix && <span className="font-mono text-[13px] text-neutral-500">{prefix}</span>}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          className="min-h-9 min-w-0 flex-1 rounded-md border border-divider bg-bg/60 px-2.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:border-accent"
        />
        {suffix && <span className="font-mono text-[13px] text-neutral-500">{suffix}</span>}
        {action}
      </span>
    </label>
  );
}
