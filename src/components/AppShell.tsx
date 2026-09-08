import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuth } from '@/lib/auth-context';
import {
  ApiError,
  createChannel,
  createServer,
  listChannelMessages,
  listChannels,
  listConversationMessages,
  listConversations,
  listServers,
  listUsers,
} from '@/lib/api';
import { createChatSocket } from '@/lib/socket';
import { describeChatError, type ChatErrorPayload } from '@/lib/chat-errors';
import { conversationLabel } from '@/lib/dm';
import { VoiceProvider, useVoiceCall } from '@/lib/voice-context';
import type {
  AgreeChannel,
  AgreeConversation,
  AgreeServer,
  AgreeUser,
  ChatMessage,
} from '@/lib/types';
import { ServerRail } from './ServerRail';
import { ChannelSidebar } from './ChannelSidebar';
import { DmSidebar } from './DmSidebar';
import { NewDmModal } from './NewDmModal';
import { ChatArea } from './ChatArea';
import { MembersPanel } from './MembersPanel';
import { CreateServerModal } from './CreateServerModal';
import { CreateChannelModal } from './CreateChannelModal';
import { SettingsModal } from './SettingsModal';
import { UserBar } from './UserBar';
import { VoiceStatusBar } from './VoiceStatusBar';

// Regex for the per-conversation broadcast event name
const CONVERSATION_EVENT = /^conversation:(.+):messages$/;

const MESSAGE_PAGE_SIZE = 50;

/**
 * Signed-in app screen. Owns servers, channels, the active selection,
 * messages, the socket, and the drawer/modal flags.
 */
export function AppShell() {
  return (
    <VoiceProvider>
      <AppShellContent />
    </VoiceProvider>
  );
}

function AppShellContent() {
  const { state, expireSession, markUnreachable } = useAuth();
  const voice = useVoiceCall();
  const signedIn = state.status === 'signed-in';
  const selfId = state.status === 'signed-in' ? state.user.sub : null;

  /** 401 expires the session; `status: 0` (backend unreachable) hands off to `ReconnectingScreen`. Anything else is left for the caller to show inline. */
  const handleApiError = useCallback(
    (err: unknown) => {
      if (!(err instanceof ApiError)) return;
      if (err.status === 401) expireSession();
      else if (err.status === 0) markUnreachable();
    },
    [expireSession, markUnreachable],
  );

  const [view, setView] = useState<'servers' | 'dms'>('servers');

  const [servers, setServers] = useState<AgreeServer[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  const [channels, setChannels] = useState<AgreeChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const [conversations, setConversations] = useState<AgreeConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  /** A DM the user picked from {@link NewDmModal} that has no conversation yet — nothing to fetch, it's created by the first `chat` send. */
  const [draftDmPeer, setDraftDmPeer] = useState<AgreeUser | null>(null);
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null);

  const [dmUsers, setDmUsers] = useState<AgreeUser[]>([]);
  const [loadingDmUsers, setLoadingDmUsers] = useState(false);
  const [dmUsersError, setDmUsersError] = useState<string | null>(null);
  const [showNewDmModal, setShowNewDmModal] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadedChannelId, setLoadedChannelId] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [showMembers, setShowMembers] = useState(true);
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [connected, setConnected] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  /** Mirrors `activeChannelId` for the `connect` handler below, which is set up once and would otherwise close over a stale value. */
  const activeChannelIdRef = useRef<string | null>(null);
  /** Mirrors `activeConversationId` for the `onAny` handler below, for the same reason. */
  const activeConversationIdRef = useRef<string | null>(null);
  const selfIdRef = useRef<string | null>(null);
  /** Last message this tab tried to send, so a `Subscribe to this channel before sending messages` error (stale room membership after a backend restart) can be retried once. */
  const lastSentRef = useRef<{ channelId: string; text: string } | null>(null);
  const retriedSendRef = useRef(false);

  const activeServer = servers.find((s) => s._id === activeServerId) ?? null;
  const activeChannel = channels.find((c) => c._id === activeChannelId) ?? null;
  const activeConversation = conversations.find((c) => c.id === activeConversationId) ?? null;

  /** The `{_id, name}` ChatArea renders for the active DM — a real conversation, a not-yet-created one, or none. */
  const activeDmTarget =
    activeConversation && selfId
      ? { _id: activeConversation.id, name: conversationLabel(activeConversation, selfId) }
      : draftDmPeer
        ? { _id: `draft:${draftDmPeer.id}`, name: draftDmPeer.username }
        : null;

  useEffect(() => {
    activeChannelIdRef.current = activeChannelId;
  }, [activeChannelId]);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    selfIdRef.current = selfId;
  }, [selfId]);

  /** Switching between the server view and the DM view shouldn't show the other one's stale messages while its own load. */
  useEffect(() => {
    setMessages([]);
    setHasMoreMessages(false);
  }, [view]);

  // A brand-new DM (no conversation id yet, nothing to fetch) has no history
  // request to clear stale messages for it — clear them here instead.
  useEffect(() => {
    if (draftDmPeer) {
      setMessages([]);
      setHasMoreMessages(false);
    }
  }, [draftDmPeer]);

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
      .catch(handleApiError)
      .finally(() => {
        if (!cancelled) setLoadingServers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, handleApiError]);

  /** Appends `msg` unless its id is already in the list — the same message can arrive twice (e.g. a DM's own room broadcast plus the `chat` ack). */
  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  /**
   * Connects the chat socket for the session; an Unauthorized error also
   * expires the session. `connect` fires both on the first handshake and on
   * every automatic reconnect (e.g. the backend restarting) — socket.io
   * rooms don't survive that, so the active channel is re-subscribed here
   * instead of relying only on the effect below (which only reacts to
   * `activeChannelId` changing, not to the socket dropping and coming back).
   */
  useEffect(() => {
    if (!signedIn) return;
    const socket = createChatSocket();
    socketRef.current = socket;
    socket.connect();

    socket.on('connect', () => {
      setConnected(true);
      if (activeChannelIdRef.current) {
        socket.emit('subscribe', { channelId: activeChannelIdRef.current });
      }
    });
    socket.on('disconnect', () => setConnected(false));

    // DM/group messages broadcast as `conversation:<id>:messages` — a name a
    // client can only know once it already knows the conversation id, which
    // isn't true for a brand-new DM until its first message is sent. `onAny`
    // catches it regardless, instead of subscribing to specific event names
    // the way channel rooms require.
    socket.onAny((event: string, payload: ChatMessage) => {
      const match = CONVERSATION_EVENT.exec(event);
      if (!match) return;
      const conversationId = match[1];

      if (conversationId === activeConversationIdRef.current) {
        addMessage(payload);
      }

      setConversations((prev) => {
        if (prev.some((c) => c.id === conversationId)) {
          return prev.map((c) =>
            c.id === conversationId ? { ...c, lastMessageAt: payload.createdAt } : c,
          );
        }
        if (!selfIdRef.current) return prev;
        // A DM from someone with no prior conversation: synthesize a minimal
        // entry from the message itself so it shows up in the sidebar. Only
        // correct for a 1:1 — a group's other participants aren't in the
        // payload — but groups aren't created by this client yet.
        const synthesized: AgreeConversation = {
          id: conversationId,
          type: 'dm',
          participants: [
            { id: selfIdRef.current, username: null, profileImageUrl: null },
            { id: payload.senderId, username: payload.senderUsername, profileImageUrl: null },
          ],
          createdAt: payload.createdAt,
          lastMessageAt: payload.createdAt,
        };
        return [synthesized, ...prev];
      });
    });

    socket.on('error', (payload: ChatErrorPayload) => {
      if (payload?.message === 'Unauthorized') {
        expireSession();
        return;
      }

      // Room membership didn't survive a reconnect and the proactive
      // re-subscribe above lost the race with this send: subscribe again and
      // retry the message exactly once, so the user doesn't have to resend
      // it (or reload the page, as before) by hand.
      if (
        payload?.message === 'Subscribe to this channel before sending messages' &&
        lastSentRef.current &&
        !retriedSendRef.current
      ) {
        retriedSendRef.current = true;
        const { channelId, text } = lastSentRef.current;
        socket.emit('subscribe', { channelId }, () => {
          socket.emit('chat', { message: text, channelId });
        });
        return;
      }

      setChatError(describeChatError(payload));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [signedIn, expireSession, addMessage]);

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
        if (!cancelled) handleApiError(err);
      })
      .finally(() => {
        if (!cancelled) setLoadingChannels(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, activeServerId, handleApiError]);

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

    listChannelMessages(activeChannelId, MESSAGE_PAGE_SIZE)
      .then((history) => {
        if (cancelled) return;
        setMessages([...history].reverse());
        setHasMoreMessages(history.length === MESSAGE_PAGE_SIZE);
        setLoadedChannelId(activeChannelId);
      })
      .catch((err) => {
        if (cancelled) return;
        handleApiError(err);
        setLoadedChannelId(activeChannelId);
      });

    const eventName = `channel:${activeChannelId}:messages`;
    socket?.on(eventName, addMessage);

    return () => {
      cancelled = true;
      socket?.off(eventName, addMessage);
      socket?.emit('unsubscribe', { channelId: activeChannelId });
    };
  }, [signedIn, activeChannelId, handleApiError, addMessage]);

  /** Loads the caller's dm/group conversations whenever the DM view is opened. */
  useEffect(() => {
    if (!signedIn || view !== 'dms') return;
    let cancelled = false;
    setLoadingConversations(true);
    listConversations()
      .then((list) => {
        if (!cancelled) setConversations(list);
      })
      .catch((err) => {
        if (!cancelled) handleApiError(err);
      })
      .finally(() => {
        if (!cancelled) setLoadingConversations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, view, handleApiError]);

  /** Loads history for an existing DM/group conversation. A `draftDmPeer` (no conversation yet) has none to load. */
  useEffect(() => {
    if (!signedIn || !activeConversationId) return;
    setMessages([]);
    setHasMoreMessages(false);
    let cancelled = false;
    listConversationMessages(activeConversationId, MESSAGE_PAGE_SIZE)
      .then((history) => {
        if (cancelled) return;
        setMessages([...history].reverse());
        setHasMoreMessages(history.length === MESSAGE_PAGE_SIZE);
        setLoadedConversationId(activeConversationId);
      })
      .catch((err) => {
        if (cancelled) return;
        handleApiError(err);
        setLoadedConversationId(activeConversationId);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, activeConversationId, handleApiError]);

  /** Sends a chat message on the active channel. */
  const handleSendChannel = useCallback(
    (text: string) => {
      if (!activeChannelId) return;
      setChatError(null);
      lastSentRef.current = { channelId: activeChannelId, text };
      retriedSendRef.current = false;
      socketRef.current?.emit('chat', { message: text, channelId: activeChannelId });
    },
    [activeChannelId],
  );

  /**
   * Sends a chat message on the active DM. Always by `recipientIds`, never a
   * conversation id — the backend finds-or-creates the conversation from the
   * participant set either way (see `ChatService.findOrCreateDirectConversation`),
   * so a brand-new DM (`draftDmPeer`, no conversation id yet) needs no special
   * case beyond reading the ack for the id it was just assigned.
   */
  const handleSendDm = useCallback(
    (text: string) => {
      const peerId = activeConversation
        ? activeConversation.participants.find((p) => p.id !== selfId)?.id
        : draftDmPeer?.id;
      if (!peerId || !selfId) return;

      setChatError(null);
      socketRef.current?.emit(
        'chat',
        { message: text, recipientIds: [peerId] },
        (msg: ChatMessage) => {
          addMessage(msg);
          setConversations((prev) => {
            if (prev.some((c) => c.id === msg.conversationId)) {
              return prev.map((c) =>
                c.id === msg.conversationId ? { ...c, lastMessageAt: msg.createdAt } : c,
              );
            }
            return [
              {
                id: msg.conversationId,
                type: 'dm' as const,
                participants: [
                  { id: selfId, username: null, profileImageUrl: null },
                  {
                    id: draftDmPeer?.id ?? peerId,
                    username: draftDmPeer?.username ?? null,
                    profileImageUrl: draftDmPeer?.profileImageUrl ?? null,
                  },
                ],
                createdAt: msg.createdAt,
                lastMessageAt: msg.createdAt,
              },
              ...prev,
            ];
          });
          setDraftDmPeer(null);
          setLoadedConversationId(msg.conversationId);
          setActiveConversationId(msg.conversationId);
        },
      );
    },
    [activeConversation, draftDmPeer, selfId, addMessage],
  );

  /** Fetches the next page of history (older than the oldest loaded message) for whichever thread is active. */
  const handleLoadMoreMessages = useCallback(() => {
    if (loadingMoreMessages || !hasMoreMessages) return;
    const oldest = messages[0]?.createdAt;
    if (!oldest) return;

    const fetchOlder =
      view === 'servers'
        ? activeChannelId && listChannelMessages(activeChannelId, MESSAGE_PAGE_SIZE, oldest)
        : activeConversationId &&
          listConversationMessages(activeConversationId, MESSAGE_PAGE_SIZE, oldest);
    if (!fetchOlder) return;

    setLoadingMoreMessages(true);
    fetchOlder
      .then((older) => {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          return [...[...older].reverse().filter((m) => !existingIds.has(m.id)), ...prev];
        });
        setHasMoreMessages(older.length === MESSAGE_PAGE_SIZE);
      })
      .catch(handleApiError)
      .finally(() => setLoadingMoreMessages(false));
  }, [
    view,
    activeChannelId,
    activeConversationId,
    messages,
    hasMoreMessages,
    loadingMoreMessages,
    handleApiError,
  ]);

  /** Opens the "start a DM" picker, lazily loading the user directory the first time. */
  const handleOpenNewDm = useCallback(() => {
    setShowNewDmModal(true);
    if (dmUsers.length > 0 || loadingDmUsers) return;
    setLoadingDmUsers(true);
    setDmUsersError(null);
    listUsers()
      .then(setDmUsers)
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
          handleApiError(err);
          return;
        }
        setDmUsersError('Não foi possível carregar a lista de usuários.');
      })
      .finally(() => setLoadingDmUsers(false));
  }, [dmUsers.length, loadingDmUsers, handleApiError]);

  /** Opens an existing 1:1 conversation with `user`, or starts a fresh (unsaved) one. */
  const handleSelectDmUser = useCallback(
    (user: AgreeUser) => {
      setShowNewDmModal(false);
      const existing = conversations.find(
        (c) => c.type === 'dm' && c.participants.some((p) => p.id === user.id),
      );
      if (existing) {
        setDraftDmPeer(null);
        setActiveConversationId(existing.id);
      } else {
        setActiveConversationId(null);
        setDraftDmPeer(user);
      }
    },
    [conversations],
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

  /** Selects a channel for the chat pane and, if it's a voice channel, joins its call — clicking a voice channel both opens and connects it. */
  const handleSelectChannel = useCallback(
    (id: string) => {
      setActiveChannelId(id);
      const channel = channels.find((c) => c._id === id);
      if (channel?.type === 'voice') voice.join(id);
    },
    [channels, voice],
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
        style={{ backdropFilter: 'blur(var(--agree-blur, 20px)) saturate(150%)' }}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ServerRail
            servers={servers}
            activeServerId={activeServerId}
            dmViewActive={view === 'dms'}
            onSelectServer={(id) => {
              setView('servers');
              setActiveServerId(id);
            }}
            onOpenDms={() => setView('dms')}
            onOpenCreate={() => setShowCreateServerModal(true)}
          />
          {view === 'servers' ? (
            <ChannelSidebar
              server={activeServer}
              channels={channels}
              activeChannelId={activeChannelId}
              activeVoiceChannelId={voice.activeChannelId}
              onSelectChannel={handleSelectChannel}
              onOpenCreateChannel={() => setShowCreateChannelModal(true)}
            />
          ) : (
            selfId && (
              <DmSidebar
                conversations={conversations}
                loading={loadingConversations}
                selfId={selfId}
                activeConversationId={activeConversationId}
                onSelectConversation={(conversation) => {
                  setDraftDmPeer(null);
                  setActiveConversationId(conversation.id);
                }}
                onOpenNewDm={handleOpenNewDm}
              />
            )
          )}
        </div>
        {voice.activeChannelId && (
          <VoiceStatusBar
            channelName={
              channels.find((c) => c._id === voice.activeChannelId)?.name ?? 'Canal de voz'
            }
          />
        )}
        <UserBar onOpenSettings={() => setShowSettings(true)} />
      </div>

      {view === 'servers' ? (
        <ChatArea
          server={loadingServers ? null : activeServer}
          channel={activeChannel}
          loadingChannels={loadingChannels}
          messages={activeChannelId ? messages : []}
          loading={activeChannelId !== null && loadedChannelId !== activeChannelId}
          connected={connected}
          hasMoreMessages={hasMoreMessages}
          loadingMoreMessages={loadingMoreMessages}
          onLoadMoreMessages={handleLoadMoreMessages}
          chatError={chatError}
          onDismissChatError={() => setChatError(null)}
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers((v) => !v)}
          onSend={handleSendChannel}
        />
      ) : (
        <ChatArea
          server={null}
          channel={activeDmTarget}
          dmMode
          loadingChannels={false}
          messages={activeDmTarget ? messages : []}
          loading={activeConversationId !== null && loadedConversationId !== activeConversationId}
          connected={connected}
          hasMoreMessages={hasMoreMessages}
          loadingMoreMessages={loadingMoreMessages}
          onLoadMoreMessages={handleLoadMoreMessages}
          chatError={chatError}
          onDismissChatError={() => setChatError(null)}
          showMembers={showMembers}
          onToggleMembers={() => setShowMembers((v) => !v)}
          onSend={handleSendDm}
        />
      )}

      {view === 'servers' && (
        <MembersPanel open={showMembers} server={activeServer} selfId={selfId} />
      )}

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

      {showNewDmModal && (
        <NewDmModal
          users={dmUsers}
          loading={loadingDmUsers}
          error={dmUsersError}
          onClose={() => setShowNewDmModal(false)}
          onSelectUser={handleSelectDmUser}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
