'use client';

import { Hash, LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import type { AgreeServer } from '@/lib/types';
import { Avatar } from './Avatar';

/** Server name, its single `#geral` channel, a DM placeholder, and the signed-in user's footer. */
export function ChannelSidebar({ server }: { server: AgreeServer | null }) {
  const { state, signOut } = useAuth();
  const username = state.status === 'signed-in' ? state.user.username : '';

  return (
    <div
      className="flex w-60 flex-none flex-col overflow-hidden"
      style={{
        background: 'color-mix(in srgb, var(--agree-surface) 50%, transparent)',
        animation: 'agree-slide-right 0.35s ease both',
      }}
    >
      <div className="border-b border-divider p-4 text-[15px] font-semibold transition-colors">
        {server ? server.name : 'Selecione um servidor'}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
        {server && (
          <button
            type="button"
            className="flex h-10 items-center gap-2 rounded-md bg-accent/15 px-2.5 text-left text-[14px] transition-all duration-150 hover:bg-accent/25 active:scale-[0.98]"
          >
            <span className="opacity-50">
              <Hash size={14} />
            </span>
            geral
          </button>
        )}

        <div className="mt-2 rounded-md border border-dashed border-divider p-3 text-[11px] leading-relaxed text-neutral-500 transition-colors hover:border-neutral-500">
          Mensagens diretas em breve — o backend do Agree ainda não expõe um
          diretório de usuários nem conversas privadas.
        </div>
      </div>

      <div
        className="flex h-18.75 flex-none items-center gap-2.5 px-3.5 py-5"
        style={{ background: 'color-mix(in srgb, var(--agree-bg) 50%, transparent)' }}
      >
        <Avatar seed={username || '?'} size={32} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{username}</div>
          <div className="text-[11px] text-neutral-400">Online</div>
        </div>
        <button
          type="button"
          title="Configurações (em breve)"
          disabled
          className="h-7 w-7 text-neutral-500 opacity-50"
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
    </div>
  );
}
