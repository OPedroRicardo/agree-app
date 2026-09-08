import { useState } from 'react';
import { MessageCircle, Plus } from 'lucide-react';
import type { AgreeServer } from '@/lib/types';
import { HoverPlayImage } from './HoverPlayImage';

/** 60px column of server icons, plus disabled DM and "add server" buttons. */
export function ServerRail({
  servers,
  activeServerId,
  dmViewActive,
  onSelectServer,
  onOpenDms,
  onOpenCreate,
}: {
  servers: AgreeServer[];
  activeServerId: string | null;
  /** True while the "Mensagens diretas" view is the one showing, instead of a server's channels. */
  dmViewActive: boolean;
  onSelectServer: (id: string) => void;
  onOpenDms: () => void;
  onOpenCreate: () => void;
}) {
  return (
    <div
      className="flex w-15 flex-none flex-col items-center gap-2.5 py-1.5"
      style={{ background: 'color-mix(in srgb, var(--agree-bg) var(--agree-glass-opacity, 45%), transparent)' }}
    >
      <button
        type="button"
        title="Mensagens diretas"
        onClick={onOpenDms}
        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-[19px] transition-all duration-200 ease-out hover:scale-105 ${
          dmViewActive
            ? 'border-accent bg-accent/15 text-accent'
            : 'border-transparent bg-surface/60 text-neutral-400 hover:text-text'
        }`}
      >
        <MessageCircle size={18} />
      </button>

      <div className="h-px w-8 bg-divider" />

      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-x-hidden overflow-y-auto">
        {servers.map((server) => (
          <ServerIcon
            key={server._id}
            server={server}
            isActive={!dmViewActive && activeServerId === server._id}
            onSelect={() => onSelectServer(server._id)}
          />
        ))}

        <button
          type="button"
          title="Adicionar servidor"
          onClick={onOpenCreate}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border-2 border-dashed border-divider text-neutral-500 transition-all duration-200 ease-out hover:scale-105 hover:rotate-90 hover:rounded-lg hover:border-accent hover:border-solid hover:text-accent active:scale-95"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

/** One server button: shows `logoImg` when it loads, else the server's initial letter. */
function ServerIcon({
  server,
  isActive,
  onSelect,
}: {
  server: AgreeServer;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(server.logoImg) && !imageFailed;

  return (
    <div className="group relative flex h-10 w-full items-center justify-center">
      <span
        className={`absolute left-0 w-1 rounded-r-full bg-white transition-all duration-200 ease-out ${
          isActive
            ? 'h-6 opacity-100'
            : 'h-2 scale-y-50 opacity-0 group-hover:h-4 group-hover:scale-y-100 group-hover:opacity-70'
        }`}
      />

      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive}
        title={server.name}
        className={`flex h-10 w-10 flex-none items-center justify-center overflow-hidden border-2 bg-surface/70 text-[16px] font-semibold text-text transition-all duration-200 ease-out hover:scale-105 hover:rounded-lg hover:border-accent hover:shadow-[0_0_0_4px_rgba(145,132,217,0.18)] active:scale-95 ${
          isActive ? 'rounded-lg border-accent' : 'rounded-full border-transparent'
        }`}
      >
        {showImage ? (
          <HoverPlayImage
            src={server.logoImg}
            alt={server.name}
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          server.name.slice(0, 1).toUpperCase()
        )}
      </button>

      <div
        className="pointer-events-none absolute left-full z-30 ml-3 max-w-40 origin-left scale-90 truncate rounded-md bg-surface px-2.5 py-1.5 text-[12px] font-medium text-text opacity-0 shadow-lg transition-all duration-150 ease-out group-hover:scale-100 group-hover:opacity-100"
      >
        {server.name}
      </div>
    </div>
  );
}
