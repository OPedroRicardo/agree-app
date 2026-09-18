import { useEffect, useRef } from 'react';
import type { VoiceContentHint } from '@/lib/types';

const OPTIONS: { hint: VoiceContentHint; label: string; detail: string }[] = [
  { hint: 'detail', label: 'Texto / código', detail: 'Mais nitidez, 15 fps' },
  { hint: 'motion', label: 'Vídeo / jogo', detail: 'Mais fluidez, 30 fps' },
];

/**
 * Popover de "compartilhar tela", no mesmo estilo do {@link DeviceMenu}. O
 * browser não sabe o que tem na janela capturada (`contentHint` é escrito pela
 * aplicação, nunca preenchido por ele), então quem escolhe o perfil é o
 * usuário: ele vira o `contentHint` da track e decide a ladder de simulcast
 * (`screenDetail` × `screenMotion`).
 */
export function ScreenShareMenu({
  onSelect,
  onClose,
}: {
  onSelect: (hint: VoiceContentHint) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full right-0 z-30 mb-2 w-56 rounded-md border border-divider p-1.5 shadow-xl"
      style={{
        background: 'var(--agree-surface)',
        backdropFilter: 'blur(var(--agree-blur, 16px)) saturate(160%)',
        animation: 'agree-fade-up 0.15s ease both',
      }}
    >
      <div className="px-2 py-1 text-[11px] font-semibold text-neutral-500">Compartilhar tela</div>
      {OPTIONS.map((option) => (
        <button
          key={option.hint}
          type="button"
          onClick={() => {
            onSelect(option.hint);
            onClose();
          }}
          className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent/10"
        >
          <span className="text-[12.5px] text-neutral-300">{option.label}</span>
          <span className="text-[11px] text-neutral-500">{option.detail}</span>
        </button>
      ))}
    </div>
  );
}
