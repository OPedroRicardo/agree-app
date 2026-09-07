import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from '@/lib/auth-context';
import {
  ApiError,
  createChannel,
  createServer,
  listChannelMessages,
  listChannels,
  listServers,
} from '@/lib/api';
import { createChatSocket } from '@/lib/socket';
import type { AgreeChannel, AgreeServer, ChatMessage } from '@/lib/types';
import { ServerRail } from './ServerRail';
import { ChannelSidebar } from './ChannelSidebar';
import { ChatArea } from './ChatArea';
import { MembersPanel } from './MembersPanel';
import { CreateServerModal } from './CreateServerModal';
import { CreateChannelModal } from './CreateChannelModal';
import { SettingsModal } from './SettingsModal';
import { UserBar } from './UserBar';

/**
 * Signed-in app screen. Owns servers, channels, the active selection,
 * messages, the socket, and the drawer/modal flags.
 */
export function AppShell() {
  const { state, expireSession } = useAuth();
  const signedIn = state.status === 'signed-in';

  const [servers, setServers] = useState<AgreeServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const [channels, setChannels] = useState<AgreeChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedChannelId, setLoadedChannelId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(true);
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [connected, setConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);

  const activeServer = servers.find((s) => s._id === activeServerId) ?? null;
  const activeChannel = channels.find((c) => c._id === activeChannelId) ?? null;

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

  /** Loads the active server's channels and selects the first one. */
  useEffect(() => {
    if (!signedIn || !activeServerId) {
      setChannels([]);
      setActiveChannelId(null);
      return;
    }

    let cancelled = false;
    setLoadingChannels(true);
    listChannels(activeServerId)
      .then((list) => {
        if (cancelled) return;
        setChannels(list);
        setActiveChannelId(list[0]?._id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) expireSession();
      })
      .finally(() => {
        if (!cancelled) setLoadingChannels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, activeServerId, expireSession]);

  /**
   * Subscribes to the active channel's socket.io room (required before the
   * gateway accepts `chat` events for it — see `ChatGateway.handleSubscribe`),
   * loads its history, and listens for new messages.
   */
  useEffect(() => {
    if (!signedIn || !activeChannelId) return;

    let cancelled = false;
    const socket = socketRef.current;
    socket?.emit('subscribe', { channelId: activeChannelId });

    listChannelMessages(activeChannelId)
      .then((history) => {
        if (cancelled) return;
        setMessages([...history].reverse());
        setLoadedChannelId(activeChannelId);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) expireSession();
        setLoadedChannelId(activeChannelId);
      });

    const eventName = `channel:${activeChannelId}:messages`;
    const handler = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };
    socket?.on(eventName, handler);

    return () => {
      cancelled = true;
      socket?.off(eventName, handler);
      socket?.emit('unsubscribe', { channelId: activeChannelId });
    };
  }, [signedIn, activeChannelId, expireSession]);

  /** Sends a chat message on the active channel. */
  const handleSend = useCallback(
    (text: string) => {
      if (!activeChannelId) return;
      socketRef.current?.emit('chat', { message: text, channelId: activeChannelId });
    },
    [activeChannelId],
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

  /** Creates a channel on the active server via `POST /server/:serverId/channel`. */
  const handleCreateChannel = useCallback(
    async (data: Pick<AgreeChannel, 'name' | 'type'>) => {
      if (!activeServerId) return;
      const created = await createChannel(activeServerId, data);
      setChannels((prev) => [...prev, created]);
      setActiveChannelId(created._id);
    },
    [activeServerId],
  );

  return (
    <div
      className="relative flex h-screen w-full overflow-hidden"
      style={{ animation: 'agree-fade 0.35s ease both' }}
    >
      <div
        className="flex w-75 flex-none flex-col overflow-hidden"
        style={{ backdropFilter: 'blur(20px) saturate(150%)' }}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ServerRail
            servers={servers}
            activeServerId={activeServerId}
            onSelectServer={setActiveServerId}
            onOpenCreate={() => setShowCreateServerModal(true)}
          />
          <ChannelSidebar
            server={activeServer}
            channels={channels}
            activeChannelId={activeChannelId}
            onSelectChannel={setActiveChannelId}
            onOpenCreateChannel={() => setShowCreateChannelModal(true)}
          />
        </div>
        <UserBar onOpenSettings={() => setShowSettings(true)} />
      </div>

      <ChatArea
        server={loadingServers ? null : activeServer}
        channel={activeChannel}
        loadingChannels={loadingChannels}
        messages={activeChannelId ? messages : []}
        loading={activeChannelId !== null && loadedChannelId !== activeChannelId}
        connected={connected}
        showMembers={showMembers}
        onToggleMembers={() => setShowMembers((v) => !v)}
        onSend={handleSend}
      />

      <MembersPanel open={showMembers} />

      {showCreateServerModal && (
        <CreateServerModal
          onClose={() => setShowCreateServerModal(false)}
          onCreate={handleCreateServer}
        />
      )}

      {showCreateChannelModal && (
        <CreateChannelModal
          onClose={() => setShowCreateChannelModal(false)}
          onCreate={handleCreateChannel}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
