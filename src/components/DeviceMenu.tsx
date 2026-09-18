import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { listAudioDevices, type MediaDeviceOption } from '@/lib/voice-settings';

const MENU_WIDTH = 256;
const MENU_GAP = 8;

/**
 * Popover compacto de seleção de dispositivo, ancorado no botão que o abre.
 * Usado pelos botões de microfone/fone da {@link UserBar} — a versão "com
 * mais detalhes" (volume, sensibilidade) fica na aba Voz da modal de
 * Configurações.
 *
 * Renderizado num portal no `body`, com posição fixa calculada a partir do
 * `anchorRef`: a coluna da sidebar tem `overflow-hidden` + `backdrop-filter`
 * (contexto de empilhamento próprio), então um `absolute` dentro dela ficava
 * cortado e por baixo da área de chat.
 */
export function DeviceMenu({
  kind,
  anchorRef,
  selectedDeviceId,
  onSelect,
  onClose,
}: {
  kind: 'audioinput' | 'audiooutput';
  /** Elemento em que o menu se ancora (o grupo de botões) — cliques dentro dele não contam como "fora". */
  anchorRef: RefObject<HTMLElement | null>;
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
  onClose: () => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function place() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(MENU_GAP, Math.min(rect.left, window.innerWidth - MENU_WIDTH - MENU_GAP)),
        bottom: window.innerHeight - rect.top + MENU_GAP,
      });
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchorRef]);

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
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-30 rounded-md border border-divider p-1.5 shadow-xl"
      style={{
        ...position,
        width: MENU_WIDTH,
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
    </div>,
    document.body,
  );
}
