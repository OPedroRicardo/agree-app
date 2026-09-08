import { TransitionEvent, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AgreeUser } from '@/lib/types';
import { Avatar } from './Avatar';

/** Modal listing every other user (`GET /users`) to start a DM with. Chrome mirrors {@link CreateServerModal}. */
export function NewDmModal({
  users,
  loading,
  error,
  onClose,
  onSelectUser,
}: {
  users: AgreeUser[];
  loading: boolean;
  /** Set when `GET /users` failed (e.g. a stale backend build without the route yet). `null` when there's nothing to show. */
  error: string | null;
  onClose: () => void;
  onSelectUser: (user: AgreeUser) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /** Only unmounts once the backdrop's own fade-out transition actually ends — no hardcoded duration to keep in sync with the CSS. */
  function handleBackdropTransitionEnd(e: TransitionEvent) {
    if (e.target === e.currentTarget && !visible) onClose();
  }

  return (
    <div
      className={`fixed inset-0 z-20 flex items-center justify-center p-4 transition-opacity duration-150 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ background: 'color-mix(in srgb, #06070f 65%, transparent)' }}
      onClick={() => setVisible(false)}
      onTransitionEnd={handleBackdropTransitionEnd}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-w-[380px] flex-col gap-3 rounded-lg p-5 shadow-xl transition-all duration-200 ease-out ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        style={{
          background: 'color-mix(in srgb, var(--agree-surface) 70%, transparent)',
          backdropFilter: 'blur(20px) saturate(160%)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-[18px] font-semibold">Nova conversa</div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-neutral-500 transition-all duration-150 hover:rotate-90 hover:text-text"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
          {loading && (
            <div className="px-1 py-2 text-[13px] text-neutral-500">Carregando usuários…</div>
          )}
          {!loading && error && <div className="px-1 py-2 text-[13px] text-danger">{error}</div>}
          {!loading && !error && users.length === 0 && (
            <div className="px-1 py-2 text-[13px] text-neutral-500">
              Não há outros usuários cadastrados.
            </div>
          )}
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => {
                onSelectUser(user);
                setVisible(false);
              }}
              className="flex h-11 items-center gap-2.5 rounded-md px-2 text-left text-[14px] text-neutral-300 transition-all duration-150 hover:bg-accent/10 hover:text-text active:scale-[0.98]"
            >
              <Avatar seed={user.username} avatarUrl={user.profileImageUrl ?? undefined} size={28} />
              <span className="min-w-0 flex-1 truncate">{user.username}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
