import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { listAudioDevices, type MediaDeviceOption } from '@/lib/voice-settings';

/**
 * Popover compacto de seleção de dispositivo, ancorado no botão que o abre.
 * Usado pelos botões de microfone/fone da {@link UserBar} — a versão "com
 * mais detalhes" (volume, sensibilidade) fica na aba Voz da modal de
 * Configurações.
 */
export function DeviceMenu({
  kind,
  selectedDeviceId,
  onSelect,
  onClose,
}: {
  kind: 'audioinput' | 'audiooutput';
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  onClose: () => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // `enumerateDevices` só traz `label` preenchido com uma permissão de
    // mídia já concedida — pede um `getUserMedia` mínimo antes se preciso.
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => stream.getTracks().forEach((t) => t.stop()))
      .catch(() => undefined)
      .finally(() => {
        listAudioDevices(kind).then((list) => {
          if (!cancelled) setDevices(list);
        }).finally(() => {
          if (!cancelled) setLoading(false);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

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
      className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-md border border-divider p-1.5 shadow-xl"
      style={{
        background: 'var(--agree-surface)',
        backdropFilter: 'blur(var(--agree-blur, 16px)) saturate(160%)',
        animation: 'agree-fade-up 0.15s ease both',
      }}
    >
      <div className="px-2 py-1 text-[11px] font-semibold text-neutral-500">
        {kind === 'audioinput' ? 'Microfone' : 'Saída de áudio'}
      </div>
      {loading && <div className="px-2 py-1.5 text-[12px] text-neutral-500">Carregando…</div>}
      {!loading && devices.length === 0 && (
        <div className="px-2 py-1.5 text-[12px] text-neutral-500">Nenhum dispositivo encontrado.</div>
      )}
      {!loading &&
        devices.map((d) => (
          <button
            key={d.deviceId}
            type="button"
            onClick={() => {
              onSelect(d.deviceId);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-neutral-300 transition-colors duration-150 hover:bg-accent/10 hover:text-text"
          >
            <span className="w-3.5 flex-none text-accent">
              {(selectedDeviceId ?? '') === d.deviceId && <Check size={13} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
          </button>
        ))}
    </div>
  );
}
