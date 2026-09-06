'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from '@/lib/auth-context';
import { ApiError, createServer, listChannelMessages, listServers } from '@/lib/api';
import { createChatSocket } from '@/lib/socket';
import type { AgreeServer, ChatMessage } from '@/lib/types';
import { ServerRail } from './ServerRail';
import { ChannelSidebar } from './ChannelSidebar';
import { ChatArea } from './ChatArea';
import { MembersPanel } from './MembersPanel';
import { CreateServerModal } from './CreateServerModal';

/**
 * Signed-in app screen. Owns servers, active server, messages, the socket,
 * and the drawer/modal flags. `server._id` doubles as the chat `channelId`
 */
export function AppShell() {
  const { state, expireSession } = useAuth();
  const signedIn = state.status === 'signed-in';

  const [servers, setServers] = useState<AgreeServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedServerId, setLoadedServerId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const activeServer = servers.find((s) => s._id === activeServerId) ?? null;

  /** Loads servers and selects the first one as active. */
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    listServers()
      .then((list) => {
        if (cancelled) return;
        setServers(list);
        setActiveServerId((current) => current ?? list[0]?._id ?? null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) expireSession();
      })
      .finally(() => {
        if (!cancelled) setLoadingServers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, expireSession]);

  /** Connects the chat socket for the session; an Unauthorized error also expires the session. */
  useEffect(() => {
    if (!signedIn) return;
    const socket = createChatSocket();
    socketRef.current = socket;
    socket.connect();

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('error', (payload: { message?: string }) => {
      if (payload?.message === 'Unauthorized') {
        expireSession();
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [signedIn, expireSession]);

  /** Loads history and subscribes to WS messages for the active channel. */
  useEffect(() => {
    if (!signedIn || !activeServerId) return;

    let cancelled = false;
    listChannelMessages(activeServerId)
      .then((history) => {
        if (cancelled) return;
        setMessages([...history].reverse());
        setLoadedServerId(activeServerId);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) expireSession();
        setLoadedServerId(activeServerId);
      });

    const socket = socketRef.current;
    const eventName = `channel:${activeServerId}:messages`;
    const handler = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    socket?.on(eventName, handler);

    return () => {
      cancelled = true;
      socket?.off(eventName, handler);
    };
  }, [signedIn, activeServerId, expireSession]);

  /** Sends a chat message on the active channel. */
  const handleSend = useCallback(
    (text: string) => {
      if (!activeServerId) return;
      socketRef.current?.emit('chat', { message: text, channelId: activeServerId });
    },
    [activeServerId],
  );

  /** Creates a server via `POST /server`, appends it locally, and switches to it. */
  const handleCreateServer = useCallback(
    async (data: { name: string; description: string; logoImg: string; bannerImage: string }) => {
      const created = await createServer(data);
      setServers((prev) => [...prev, created]);
      setActiveServerId(created._id);
    },
    [],
  );

  return (
    <div
      className="relative flex h-screen w-full overflow-hidden"
      style={{ animation: 'agree-fade 0.35s ease both' }}
    >
      <div
        className="flex w-75 flex-none overflow-hidden"
        style={{ backdropFilter: 'blur(20px) saturate(150%)' }}
      >
        <ServerRail
          servers={servers}
          activeServerId={activeServerId}
          onSelectServer={setActiveServerId}
          onOpenCreate={() => setShowCreateModal(true)}
        />
        <ChannelSidebar server={activeServer} />
      </div>

      <ChatArea
        server={loadingServers ? null : activeServer}
        messages={activeServerId ? messages : []}
        loading={activeServerId !== null && loadedServerId !== activeServerId}
        connected={connected}
        showMembers={showMembers}
        onToggleMembers={() => setShowMembers((v) => !v)}
        onSend={handleSend}
      />

      <MembersPanel open={showMembers} />

      {showCreateModal && (
        <CreateServerModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateServer}
        />
      )}
    </div>
  );
}
