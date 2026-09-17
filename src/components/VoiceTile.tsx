import { useEffect, useRef } from 'react';
import { HeadphoneOff, LoaderCircle, MicOff, ScreenShare } from 'lucide-react';
import type { VoiceTile as VoiceTileModel } from '@/lib/voice-layout';
import { Avatar } from './Avatar';

/**
 * Um item da chamada: a pessoa (câmera, ou a foto sobre `--agree-voice-tile-bg`)
 * ou a tela que ela compartilha. Presentacional — tamanho, stream e foto vêm
 * da {@link VoiceView}. Só é clicável com vídeo (é o que dá pra focar).
 */
export function VoiceTile({
  tile,
  stream,
  pictureUrl,
  speaking,
  width,
  height,
  focused = false,
  compact = false,
  onClick,
}: {
  tile: VoiceTileModel;
  /** Stream de vídeo do tile — a track local pro próprio usuário, a puxada do SFU pros outros. */
  stream: MediaStream | null;
  pictureUrl?: string | null;
  speaking: boolean;
  width: number;
  height: number;
  focused?: boolean;
  /** Miniatura da faixa do modo foco. */
  compact?: boolean;
  onClick: () => void;
}) {
  const focusable = tile.hasVideo;
  const isScreen = tile.source === 'screen';
  const label = isScreen ? `Tela de ${tile.username}` : tile.username;
  const avatarSize = Math.round(Math.min(96, Math.max(28, height * 0.36)));

  return (
    <div
      role={focusable ? 'button' : undefined}
      tabIndex={focusable ? 0 : undefined}
      title={focusable ? (focused ? 'Voltar para o grid' : 'Focar') : undefined}
      onClick={focusable ? onClick : undefined}
      onKeyDown={
        focusable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      // Mesmo indicador de fala da VoiceStatusBar — só no tile da pessoa, não no da tela.
      className={`relative flex flex-none items-center justify-center overflow-hidden rounded-lg ring-2 transition-shadow ${
        speaking && !isScreen ? 'ring-online' : 'ring-transparent'
      }`}
      style={{ width, height, background: 'var(--agree-voice-tile-bg)' }}
    >
      {tile.hasVideo && stream ? (
        <VideoSurface
          stream={stream}
          // Tela não pode cortar texto; câmera preenche o tile.
          fit={isScreen ? 'contain' : 'cover'}
          // A própria câmera espelhada, como num espelho (e como o Discord mostra).
          mirrored={tile.isSelf && !isScreen}
        />
      ) : isScreen ? (
        <div className="flex flex-col items-center gap-2 text-[12px] text-neutral-500">
          <LoaderCircle size={compact ? 16 : 22} className="animate-spin" />
          {!compact && 'Carregando tela…'}
        </div>
      ) : (
        <Avatar
          seed={tile.username || tile.userId}
          avatarUrl={pictureUrl}
          size={avatarSize}
          initialsFontSize={Math.max(11, Math.round(avatarSize * 0.32))}
        />
      )}

      <div
        className={`absolute flex items-center gap-1.5 rounded-md bg-black/55 text-white ${
          compact ? 'bottom-1 left-1 max-w-[calc(100%-0.5rem)] px-1.5 py-0.5 text-[10.5px]' : 'bottom-2 left-2 max-w-[calc(100%-1rem)] px-2 py-0.5 text-[12px]'
        }`}
      >
        {isScreen && <ScreenShare size={compact ? 10 : 12} className="flex-none" />}
        <span className="min-w-0 truncate">{label}</span>
        {!isScreen && tile.deafened && <HeadphoneOff size={compact ? 10 : 12} className="flex-none text-danger" />}
        {!isScreen && !tile.deafened && tile.muted && <MicOff size={compact ? 10 : 12} className="flex-none text-danger" />}
      </div>
    </div>
  );
}

/**
 * `<video>` sempre mudo: o áudio da chamada já sai pelos `<audio>` do
 * `VoiceClient`, e som aqui tocaria dobrado.
 */
function VideoSurface({
  stream,
  fit,
  mirrored,
}: {
  stream: MediaStream;
  fit: 'cover' | 'contain';
  mirrored: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    el.srcObject = stream;
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={`h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    />
  );
}
