import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { listServerMembers } from './api';
import type { AgreeUser } from './types';

/**
 * Session-wide cache of `GET /server/:serverId/members`. The members drawer
 * and the voice bar's roster both read it, so a server's list is fetched once
 * and shared instead of refetched by each reader. Same module-level pub/sub
 * idea as `voice-settings.ts`, read through `useSyncExternalStore`.
 */

export type ServerMembersEntry = {
  /** `null` until the first fetch lands. A failed revalidation keeps the last good list. */
  members: AgreeUser[] | null;
  loading: boolean;
  error: boolean;
};

const EMPTY: ServerMembersEntry = { members: null, loading: false, error: false };

// Entries are replaced, never mutated — `useSyncExternalStore` compares
// snapshots by reference.
const entries = new Map<string, ServerMembersEntry>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** Ids a lookup miss already triggered a revalidation for, per server. */
const revalidatedForMiss = new Map<string, Set<string>>();

function write(serverId: string, patch: Partial<ServerMembersEntry>) {
  entries.set(serverId, { ...(entries.get(serverId) ?? EMPTY), ...patch });
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Refetches `serverId`'s members. Concurrent calls share one request. */
export function revalidateServerMembers(serverId: string): Promise<void> {
  const pending = inFlight.get(serverId);
  if (pending) return pending;

  write(serverId, { loading: true, error: false });
  const request = listServerMembers(serverId)
    .then((members) => write(serverId, { members, loading: false }))
    .catch(() => write(serverId, { loading: false, error: true }))
    .finally(() => inFlight.delete(serverId));
  inFlight.set(serverId, request);
  return request;
}

/** Applies a local edit (after a successful add/remove) so every reader sees it without a refetch. */
export function updateServerMembers(
  serverId: string,
  update: (members: AgreeUser[]) => AgreeUser[],
) {
  write(serverId, { members: update(entries.get(serverId)?.members ?? []) });
}

/**
 * `serverId`'s cached members, fetched on first read unless `autoFetch` is
 * off (the reader then triggers {@link revalidateServerMembers} itself).
 * `null` reads nothing.
 */
export function useServerMembers(
  serverId: string | null,
  { autoFetch = true }: { autoFetch?: boolean } = {},
): ServerMembersEntry {
  const entry = useSyncExternalStore(
    subscribe,
    () => (serverId ? entries.get(serverId) : undefined) ?? EMPTY,
  );

  useEffect(() => {
    // Also retries a failed first fetch on the next mount — deps don't include
    // the entry, so an error can't turn this into a loop.
    if (autoFetch && serverId && !entries.get(serverId)?.members && !inFlight.has(serverId)) {
      void revalidateServerMembers(serverId);
    }
  }, [serverId, autoFetch]);

  return entry;
}

/**
 * `serverId`'s members by id, for users known to be members — a voice roster,
 * since `voice:join` only admits members. A miss then means the cache predates
 * that user joining the server, so it revalidates — at most once per missing
 * id, so a user the refetch still doesn't return can't loop it.
 */
export function useServerMembersById(
  serverId: string | null,
  userIds: string[],
): Map<string, AgreeUser> {
  const { members, loading } = useServerMembers(serverId);
  const byId = useMemo(() => new Map((members ?? []).map((m) => [m.id, m])), [members]);

  // A string, not the array: `userIds` is a fresh array every render.
  const missingKey =
    members && !loading
      ? userIds
          .filter((id) => !byId.has(id))
          .sort()
          .join(',')
      : '';

  useEffect(() => {
    if (!serverId || !missingKey) return;
    const tried = revalidatedForMiss.get(serverId) ?? new Set<string>();
    revalidatedForMiss.set(serverId, tried);

    const untried = missingKey.split(',').filter((id) => !tried.has(id));
    if (untried.length === 0) return;
    for (const id of untried) tried.add(id);
    void revalidateServerMembers(serverId);
  }, [serverId, missingKey]);

  return byId;
}
