import { useCallback, useState } from 'react';
import { Mic, MicOff, PhoneOff, ScreenShare, ScreenShareOff, Video, VideoOff, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useServerMembersById } from '@/lib/server-members';
import { useVoiceCall } from '@/lib/voice-context';
import { canShareScreen } from '@/lib/voice-media';
import { Avatar } from './Avatar';
import { ScreenShareMenu } from './ScreenShareMenu';

/**
 * Barra de status da chamada de voz ativa — só existe enquanto
 * `useVoiceCall().activeChannelId` não é `null`. Controles de mute/deafen e
 * desconectar ficam aqui (não na `UserBar`, cujos botões de microfone/fone
 * são seletores de dispositivo).
 */
export function VoiceStatusBar({ channelName }: { channelName: string }) {
  const {
    activeServerId,
    connectionState,
    participants,
    muted,
    deafened,
    speakingUserIds,
    error,
    playbackBlocked,
    leave,
    toggleMuted,
    toggleDeafened,
    dismissError,
    retryBlockedPlayback,
    videoAvailable,
    localCamera,
    localScreen,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
  } = useVoiceCall();

  const [screenMenuOpen, setScreenMenuOpen] = useState(false);
  const closeScreenMenu = useCallback(() => setScreenMenuOpen(false), []);
  // Câmera/tela só existem com o SFU configurado no backend (`ack.video !== null`),
  // e a tela só onde o runtime tem `getDisplayMedia`.
  const mediaDisabled = connectionState !== 'connected';

  // A foto de quem está na chamada não vem no `VoiceParticipant`: a própria
  // sai do perfil (mesma fonte da `UserBar`), a dos outros da lista de
  // membros do servidor da chamada, em cache compartilhado com o `MembersPanel`.
  const { state: authState } = useAuth();
  const self = authState.status === 'signed-in' ? authState.user : null;
  const membersById = useServerMembersById(
    activeServerId,
    participants.map((p) => p.userId),
  );
  const pictureOf = (userId: string) =>
    userId === self?.sub ? self.profileImageUrl : membersById.get(userId)?.profileImageUrl;

  const statusLabel =
    connectionState === 'connecting'
      ? 'Conectando…'
      : connectionState === 'reconnecting'
        ? 'Reconectando…'
        : connectionState === 'error'
          ? 'Erro na chamada'
          : 'Conectado';

  return (
    <div
      className="flex flex-none flex-col gap-2 border-t border-divider px-3 py-2.5"
      style={{ background: 'color-mix(in srgb, var(--agree-surface) var(--agree-glass-opacity, 55%), transparent)' }}
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 flex-none rounded-full ${connectionState === 'connected' ? 'bg-online' : 'bg-neutral-500'}`}
          style={connectionState === 'connected' ? { animation: 'agree-pulse 2s ease-in-out infinite' } : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-text">{channelName}</div>
          <div className="text-[11px] text-neutral-500">{statusLabel}</div>
        </div>
        <button
          type="button"
          title="Sair da chamada"
          onClick={leave}
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-danger transition-all duration-150 hover:scale-110 hover:bg-danger/10 active:scale-90"
        >
          <PhoneOff size={14} />
        </button>
      </div>

      {participants.length > 0 && (
        <div className="flex flex-wrap gap-2 px-0.5">
          {participants.map((p) => (
            <div key={p.userId} className="relative" title={p.username}>
              <Avatar
                seed={p.username}
                avatarUrl={pictureOf(p.userId)}
                size={26}
                className={`ring-2 transition-shadow ${
                  speakingUserIds.has(p.userId) ? 'ring-online' : 'ring-transparent'
                }`}
              />
              {p.muted && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-white">
                  <MicOff size={8} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {videoAvailable && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={localCamera ? 'Desligar câmera' : 'Ligar câmera'}
            onClick={toggleCamera}
            disabled={mediaDisabled}
            className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-all duration-150 active:scale-95 disabled:opacity-50 ${
              localCamera ? 'bg-accent/15 text-accent' : 'bg-bg/50 text-neutral-300 hover:text-text'
            }`}
          >
            {localCamera ? <VideoOff size={13} /> : <Video size={13} />}
            Câmera
          </button>
          {canShareScreen() && (
            <div className="relative flex flex-1">
              <button
                type="button"
                title={localScreen ? 'Parar compartilhamento' : 'Compartilhar tela'}
                onClick={() => (localScreen ? stopScreenShare() : setScreenMenuOpen((open) => !open))}
                disabled={mediaDisabled}
                className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-all duration-150 active:scale-95 disabled:opacity-50 ${
                  localScreen ? 'bg-accent/15 text-accent' : 'bg-bg/50 text-neutral-300 hover:text-text'
                }`}
              >
                {localScreen ? <ScreenShareOff size={13} /> : <ScreenShare size={13} />}
                {localScreen ? 'Parar' : 'Tela'}
              </button>
              {screenMenuOpen && !localScreen && (
                <ScreenShareMenu onSelect={startScreenShare} onClose={closeScreenMenu} />
              )}
            </div>
          )}
        </div>
      )}

      {/* <div className="flex items-center gap-2">
        <button
          type="button"
          title={muted ? 'Ativar microfone' : 'Silenciar microfone'}
          onClick={toggleMuted}
          className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-all duration-150 active:scale-95 ${
            muted ? 'bg-danger/15 text-danger' : 'bg-bg/50 text-neutral-300 hover:text-text'
          }`}
        >
          {muted ? <MicOff size={13} /> : <Mic size={13} />}
          {muted ? 'Silenciado' : 'Microfone'}
        </button>
        <button
          type="button"
          title={deafened ? 'Reativar áudio' : 'Ensurdecer'}
          onClick={toggleDeafened}
          className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium transition-all duration-150 active:scale-95 ${
            deafened ? 'bg-danger/15 text-danger' : 'bg-bg/50 text-neutral-300 hover:text-text'
          }`}
        >
          {deafened ? <VolumeX size={13} /> : <Volume2 size={13} />}
          {deafened ? 'Ensurdecido' : 'Áudio'}
        </button>
      </div> */}

      {playbackBlocked && (
        <button
          type="button"
          onClick={retryBlockedPlayback}
          className="rounded-md border border-accent/40 px-2 py-1.5 text-[11px] text-accent transition-colors hover:bg-accent/10"
        >
          Clique para ativar o áudio da chamada
        </button>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={dismissError} className="flex-none underline-offset-2 hover:underline">
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
