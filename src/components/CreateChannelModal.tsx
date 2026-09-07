import { FormEvent, TransitionEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AgreeChannel } from '@/lib/types';

/** Modal form for `POST /server/:serverId/channel`, mirrors {@link CreateServerModal}'s transition. */
export function CreateChannelModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: Pick<AgreeChannel, 'name' | 'type'>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AgreeChannel['type']>('text');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /** Só desmonta quando a transição de saída do backdrop realmente termina — sem timeout fixo. */
  function handleBackdropTransitionEnd(e: TransitionEvent) {
    if (e.target === e.currentTarget && !visible) onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Dê um nome ao canal.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ name, type });
      setVisible(false);
    } catch {
      setError('Não foi possível criar o canal.');
      setSubmitting(false);
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
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className={`flex w-full max-w-[380px] flex-col gap-3 rounded-lg p-5 shadow-xl transition-all duration-200 ease-out ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        style={{
          background: 'color-mix(in srgb, var(--agree-surface) 70%, transparent)',
          backdropFilter: 'blur(20px) saturate(160%)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[18px] font-semibold">Novo canal</div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-neutral-500 transition-all duration-150 hover:rotate-90 hover:text-text"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] text-neutral-400">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="geral"
            className="min-h-9 rounded-md border border-divider bg-bg/60 px-2.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:border-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] text-neutral-400">Tipo</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AgreeChannel['type'])}
            className="min-h-9 rounded-md border border-divider bg-bg/60 px-2.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:border-accent"
          >
            <option value="text">Texto</option>
            <option value="voice">Voz</option>
          </select>
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 rounded-md border border-accent px-4 py-2 text-[14px] font-medium text-accent transition-all duration-150 hover:bg-accent/10 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Criando…' : 'Criar canal'}
        </button>
      </form>
    </div>
  );
}
