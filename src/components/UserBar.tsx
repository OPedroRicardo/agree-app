import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Avatar } from './Avatar';

/** Signed-in user footer, spans the full width below the server rail + channel sidebar. */
export function UserBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { state, signOut } = useAuth();
  const username = state.status === 'signed-in' ? state.user.username : '';

  return (
    <div
      className="flex h-18 w-full flex-none items-center gap-2.5 px-3.5 py-5"
      style={{ background: 'color-mix(in srgb, var(--agree-bg) 50%, transparent)' }}
    >
      <Avatar seed={username || '?'} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{username}</div>
        <div className="text-[11px] text-neutral-400">Online</div>
      </div>
      <button
        type="button"
        title="Configurações"
        onClick={onOpenSettings}
        className="h-7 w-7 text-neutral-500 transition-all duration-200 hover:scale-110 hover:text-accent active:scale-90"
      >
        <Settings size={15} />
      </button>
      <button
        type="button"
        title="Sair"
        onClick={signOut}
        className="h-7 w-7 text-neutral-500 transition-all duration-200 hover:scale-110 hover:text-accent active:scale-90"
      >
        <LogOut size={15} />
      </button>
    </div>
  );
}
