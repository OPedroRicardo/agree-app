import { Hash, Plus, Volume2 } from 'lucide-react';
import type { AgreeChannel, AgreeServer } from '@/lib/types';

/** Server name, its channel list, and a DM placeholder. The user footer lives in {@link UserBar}, outside this component. */
export function ChannelSidebar({
  server,
  channels,
  activeChannelId,
  activeVoiceChannelId,
  onSelectChannel,
  onOpenCreateChannel,
}: {
  server: AgreeServer | null;
  channels: AgreeChannel[];
  activeChannelId: string | null;
  /** Canal de voz em que a chamada atual está conectada/conectando, se houver. */
  activeVoiceChannelId?: string | null;
  onSelectChannel: (id: string) => void;
  onOpenCreateChannel: () => void;
}) {
  return (
    <div
      className="flex w-60 flex-none flex-col overflow-hidden"
      style={{
        background: 'color-mix(in srgb, var(--agree-surface) var(--agree-glass-opacity, 50%), transparent)',
        animation: 'agree-slide-right 0.35s ease both',
      }}
    >
      <div className="border-b border-divider p-4 text-[15px] font-semibold transition-colors">
        {server ? server.name : 'Selecione um servidor'}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
        {server && (
          <div className="flex flex-col gap-0.5">
            {channels.map((channel) => (
              <button
                key={channel._id}
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
                {channel._id === activeVoiceChannelId && (
                  <span className="h-1.5 w-1.5 flex-none rounded-full bg-online" title="Conectado" />
                )}
              </button>
            ))}

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
