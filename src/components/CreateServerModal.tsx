import { FormEvent, TransitionEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';

/** Modal form for `POST /server`, with its own fade/scale open+close transition. */
export function CreateServerModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: {
    name: string;
    description: string;
    logoImg: string;
    bannerImage: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoImg, setLogoImg] = useState('');
  const [bannerImage, setBannerImage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /** Only unmounts once the backdrop's own fade-out transition actually ends — no hardcoded duration to keep in sync with the CSS. */
  function handleBackdropTransitionEnd(e: TransitionEvent) {
    if (e.target === e.currentTarget && !visible) onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError('Preencha ao menos nome e descrição.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ name, description, logoImg, bannerImage });
      setVisible(false);
    } catch {
      setError('Não foi possível criar o servidor.');
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
        className={`flex w-full max-w-[420px] flex-col gap-3 rounded-lg p-5 shadow-xl transition-all duration-200 ease-out ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        style={{
          background: 'color-mix(in srgb, var(--agree-surface) 70%, transparent)',
          backdropFilter: 'blur(20px) saturate(160%)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[18px] font-semibold">Novo servidor</div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-neutral-500 transition-all duration-150 hover:rotate-90 hover:text-text"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <Field label="Nome" value={name} onChange={setName} placeholder="Pocilga" />
        <Field
          label="Descrição"
          value={description}
          onChange={setDescription}
          placeholder="Servidor da galera"
        />
        <Field
          label="URL do logo (opcional)"
          value={logoImg}
          onChange={setLogoImg}
          placeholder="https://..."
        />
        <Field
          label="URL do banner (opcional)"
          value={bannerImage}
          onChange={setBannerImage}
          placeholder="https://..."
        />

        {error && <div className="text-[12px] text-danger">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 rounded-md border border-accent px-4 py-2 text-[14px] font-medium text-accent transition-all duration-150 hover:bg-accent/10 active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? 'Criando…' : 'Criar servidor'}
        </button>
      </form>
    </div>
  );
}

/** Labeled text input used by the form fields above. */
function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] text-neutral-400">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-9 rounded-md border border-divider bg-bg/60 px-2.5 py-1.5 text-[13px] outline-none transition-colors focus-visible:border-accent"
      />
    </div>
  );
}
