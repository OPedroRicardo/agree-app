import { useEffect, useState } from 'react';
import { UserMinus, UserPlus, Users } from 'lucide-react';
import { addServerMember, ApiError, listUsers, removeServerMember } from '@/lib/api';
import {
  revalidateServerMembers,
  updateServerMembers,
  useServerMembers,
} from '@/lib/server-members';
import type { AgreeServer, AgreeUser } from '@/lib/types';
import { Avatar } from './Avatar';
import { AddMemberModal } from './AddMemberModal';

/**
 * Right-side drawer — member roster of `server`, always mounted (so the
 * close transition plays) but only fetches while `open`. The roster lives in
 * the shared `server-members` cache: opening shows the cached list at once
 * and revalidates it in the background. The owner
 * (`server.ownerId === selfId`) additionally gets a button to add a member
 * and a remove button per row — everyone else just sees the list.
 */
export function MembersPanel({
  open,
  server,
  selfId,
}: {
  open: boolean;
  server: AgreeServer | null;
  selfId: string | null;
}) {
  const serverId = server?._id ?? null;
  const cached = useServerMembers(serverId, { autoFetch: false });
  const members = cached.members ?? [];
  // Only the very first fetch shows a spinner — a revalidation keeps the
  // cached list on screen.
  const loading = cached.loading && cached.members === null;
  const [mutationError, setMutationError] = useState<string | null>(null);
  const error =
    mutationError ?? (cached.error ? 'Não foi possível carregar os membros.' : null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [allUsers, setAllUsers] = useState<AgreeUser[]>([]);
  const [loadingAllUsers, setLoadingAllUsers] = useState(false);
  const [addUsersError, setAddUsersError] = useState<string | null>(null);

  const isOwner = Boolean(server?.ownerId && server.ownerId === selfId);

  useEffect(() => {
    if (!open || !serverId) return;
    setMutationError(null);
    void revalidateServerMembers(serverId);
  }, [open, serverId]);

  function handleOpenAddModal() {
    setShowAddModal(true);
    setAddUsersError(null);
    setLoadingAllUsers(true);
    listUsers()
      .then(setAllUsers)
      .catch(() => setAddUsersError('Não foi possível carregar a lista de usuários.'))
      .finally(() => setLoadingAllUsers(false));
  }

  function handleAddUser(user: AgreeUser) {
    if (!server) return;
    addServerMember(server._id, user.id)
      .then(() =>
        updateServerMembers(server._id, (prev) =>
          prev.some((m) => m.id === user.id) ? prev : [...prev, user],
        ),
      )
      .catch((err) => {
        setMutationError(
          err instanceof ApiError ? err.message : 'Não foi possível adicionar o membro.',
        );
      });
  }

  function handleRemoveUser(userId: string) {
    if (!server) return;
    setRemovingId(userId);
    removeServerMember(server._id, userId)
      .then(() => updateServerMembers(server._id, (prev) => prev.filter((m) => m.id !== userId)))
      .catch((err) => {
        setMutationError(
          err instanceof ApiError ? err.message : 'Não foi possível remover o membro.',
        );
      })
      .finally(() => setRemovingId(null));
  }

  const membersNotInServer = allUsers.filter((u) => !members.some((m) => m.id === u.id));

  return (
    <div
      aria-hidden={!open}
      className={`flex flex-none overflow-hidden transition-[width,opacity,transform] duration-300 ease-out ${
        open ? 'w-55 translate-x-0 opacity-100' : 'w-0 translate-x-3 opacity-0'
      }`}
      style={{
        background: 'color-mix(in srgb, var(--agree-surface) var(--agree-glass-opacity, 45%), transparent)',
        backdropFilter: 'blur(var(--agree-blur, 22px)) saturate(150%)',
      }}
    >
      <div className="flex w-55 flex-none flex-col gap-2 overflow-y-auto p-3">
        <div className="flex items-center justify-between px-1 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500">
            <Users size={13} />
            MEMBROS — {members.length}
          </div>
          {isOwner && (
            <button
              type="button"
              title="Adicionar membro"
              onClick={handleOpenAddModal}
              className="text-neutral-500 transition-all duration-150 hover:scale-110 hover:text-accent active:scale-90"
            >
              <UserPlus size={14} />
            </button>
          )}
        </div>

        {!server && (
          <div className="mt-4 text-center text-[11px] text-neutral-500">
            Selecione um servidor.
          </div>
        )}
        {server && loading && (
          <div className="mt-4 text-center text-[11px] text-neutral-500">Carregando…</div>
        )}
        {server && error && (
          <div className="px-1 text-[11px] text-danger">{error}</div>
        )}

        {server &&
          !loading &&
          members.map((member) => (
            <div
              key={member.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1 transition-colors duration-150 hover:bg-bg/40"
            >
              <Avatar seed={member.username} avatarUrl={member.profileImageUrl ?? undefined} size={26} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-300">
                {member.username}
                {member.id === server.ownerId && (
                  <span className="ml-1 text-[10px] text-neutral-500">dono</span>
                )}
              </span>
              {isOwner && member.id !== server.ownerId && (
                <button
                  type="button"
                  title="Remover do servidor"
                  disabled={removingId === member.id}
                  onClick={() => handleRemoveUser(member.id)}
                  className="flex-none text-neutral-500 opacity-0 transition-all duration-150 hover:text-danger group-hover:opacity-100 disabled:opacity-50"
                >
                  <UserMinus size={13} />
                </button>
              )}
            </div>
          ))}
      </div>

      {showAddModal && (
        <AddMemberModal
          users={membersNotInServer}
          loading={loadingAllUsers}
          error={addUsersError}
          onClose={() => setShowAddModal(false)}
          onSelectUser={handleAddUser}
        />
      )}
    </div>
  );
}
