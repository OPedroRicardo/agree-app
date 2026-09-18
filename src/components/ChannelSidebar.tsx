import { Hash, HeadphoneOff, MicOff, Plus, Smile, Volume2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useServerMembersById } from '@/lib/server-members';
import type { AgreeChannel, AgreeServer, VoiceParticipant } from '@/lib/types';
import type { PresenceByChannel } from '@/lib/voice-presence';
import { Avatar } from './Avatar';

/** Server name, its channel list, and a DM placeholder. The user footer lives in {@link UserBar}, outside this component. */
export function ChannelSidebar({
  server,
  channels,
  activeChannelId,
  activeVoiceChannelId,
  presenceByChannel,
  onSelectChannel,
  onOpenCreateChannel,
  onOpenEmojis,
}: {
  server: AgreeServer | null;
  channels: AgreeChannel[];
  activeChannelId: string | null;
  /** Canal de voz em que a chamada atual está conectada/conectando, se houver. */
  activeVoiceChannelId?: string | null;
  /** Quem está em cada canal de voz deste servidor (`voice:watch`), esteja o usuário na chamada ou não. */
  presenceByChannel: PresenceByChannel;
  onSelectChannel: (id: string) => void;
  onOpenCreateChannel: () => void;
  onOpenEmojis: () => void;
}) {
  // Fotos: a própria vem do perfil, as dos outros do cache de membros do servidor (mesma fonte da `VoiceStatusBar`).
  const { state: authState } = useAuth();
  const self = authState.status === 'signed-in' ? authState.user : null;
  const presentUserIds = [...presenceByChannel.values()].flat().map((p) => p.userId);
  const membersById = useServerMembersById(server?._id ?? null, presentUserIds);
  const pictureOf = (userId: string) =>
    userId === self?.sub ? self.profileImageUrl : membersById.get(userId)?.profileImageUrl;

  return (
    <div
      className="flex w-60 flex-none flex-col overflow-hidden"
      style={{
        background: 'color-mix(in srgb, var(--agree-surface) var(--agree-glass-opacity, 50%), transparent)',
        animation: 'agree-slide-right 0.35s ease both',
      }}
    >
      <div className="flex items-center gap-2 border-b border-divider p-4 text-[15px] font-semibold transition-colors">
        <span className="min-w-0 flex-1 truncate">{server ? server.name : 'Selecione um servidor'}</span>
        {server && (
          <button
            type="button"
            onClick={onOpenEmojis}
            title="Emojis do servidor"
            className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-accent/10 hover:text-text"
          >
            <Smile size={15} />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
        {server && (
          <div className="flex flex-col gap-0.5">
            {channels.map((channel) => {
              const present = channel.type === 'voice' ? (presenceByChannel.get(channel._id) ?? []) : [];
              return (
                <div key={channel._id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => onSelectChannel(channel._id)}
                    className={`flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-[14px] transition-all duration-150 active:scale-[0.98] ${
                      channel._id === activeChannelId
                        ? 'bg-accent/15 text-text'
                        : 'text-neutral-400 hover:bg-accent/10 hover:text-text'
                    }`}
                  >
                    <span className={channel._id === activeVoiceChannelId ? 'text-online' : 'opacity-50'}>
                      {channel.type === 'voice' ? <Volume2 size={14} /> : <Hash size={14} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{channel.name}</span>
                    {present.length > 0 && (
                      <span className="flex-none text-[11px] text-neutral-500" title={`${present.length} na chamada`}>
                        {present.length}
                      </span>
                    )}
                    {channel._id === activeVoiceChannelId && (
                      <span className="h-1.5 w-1.5 flex-none rounded-full bg-online" title="Conectado" />
                    )}
                  </button>
                  {present.length > 0 && (
                    <div className="flex flex-col gap-0.5 py-0.5 pl-6" style={{ animation: 'agree-fade 0.2s ease both' }}>
                      {present.map((p) => (
                        <VoicePresenceRow key={p.socketId} participant={p} avatarUrl={pictureOf(p.userId)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={onOpenCreateChannel}
              className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-neutral-500 transition-all duration-150 hover:bg-accent/10 hover:text-text active:scale-[0.98]"
            >
              <Plus size={14} />
              Criar canal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Uma pessoa sob o canal de voz: foto, nome e o estado de mute/deafen. */
function VoicePresenceRow({
  participant,
  avatarUrl,
}: {
  participant: VoiceParticipant;
  avatarUrl: string | null | undefined;
}) {
  return (
    <div
      className="flex h-7 items-center gap-2 rounded-md px-2 text-[12.5px] text-neutral-400"
      title={participant.username}
    >
      <Avatar seed={participant.username} avatarUrl={avatarUrl ?? undefined} size={20} />
      <span className="min-w-0 flex-1 truncate">{participant.username}</span>
      {participant.deafened ? (
        <HeadphoneOff size={12} className="flex-none text-danger" aria-label="Ensurdecido" />
      ) : participant.muted ? (
        <MicOff size={12} className="flex-none text-danger" aria-label="Silenciado" />
      ) : null}
    </div>
  );
}
