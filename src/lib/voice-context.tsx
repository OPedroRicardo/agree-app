import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth-context';
import { VoiceClient } from './voice-client';
import type { VoiceParticipant } from './types';

type VoiceConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

type VoiceContextValue = {
  activeChannelId: string | null;
  connectionState: VoiceConnectionState;
  participants: VoiceParticipant[];
  muted: boolean;
  deafened: boolean;
  speakingUserIds: Set<string>;
  error: string | null;
  playbackBlocked: boolean;
  join: (channelId: string) => void;
  leave: () => void;
  toggleMuted: () => void;
  toggleDeafened: () => void;
  dismissError: () => void;
  retryBlockedPlayback: () => void;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

/**
 * Dono de uma única instância de {@link VoiceClient} pela vida da sessão
 * logada, exposta via `useVoiceCall`. Fica dentro de `AppShell` (só existe
 * quando há sessão) e chama `leave()` no unmount — sair do app derruba
 * qualquer chamada em andamento.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const { state: authState } = useAuth();
  const clientRef = useRef<VoiceClient | null>(null);
  if (!clientRef.current) clientRef.current = new VoiceClient();
  const client = clientRef.current;

  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('idle');
  const [remoteParticipants, setRemoteParticipants] = useState<VoiceParticipant[]>([]);
  const [selfState, setSelfState] = useState({ muted: false, deafened: false });
  const [speakingUserIds, setSpeakingUserIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    const offState = client.on('connection-state', (s) => {
      setConnectionState(s);
      if (s === 'idle' || s === 'error') setActiveChannelId(null);
    });
    const offParticipants = client.on('participants', setRemoteParticipants);
    const offSelf = client.on('self-state', setSelfState);
    const offSpeaking = client.on('speaking', ({ userId, speaking }) => {
      setSpeakingUserIds((prev) => {
        const next = new Set(prev);
        if (speaking) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
    const offEvicted = client.on('evicted', () => {
      setError('Você entrou no canal de voz em outro dispositivo/aba.');
    });
    const offError = client.on('error', (message) => setError(message));
    const offBlocked = client.on('playback-blocked', () => setPlaybackBlocked(true));

    return () => {
      offState();
      offParticipants();
      offSelf();
      offSpeaking();
      offEvicted();
      offError();
      offBlocked();
    };
  }, [client]);

  // Sai da chamada se a página inteira desmontar (logout, fechar app).
  useEffect(() => () => void client.leave(), [client]);

  const join = useCallback(
    (channelId: string) => {
      setError(null);
      setActiveChannelId(channelId);
      void client.join(channelId);
    },
    [client],
  );

  const leave = useCallback(() => {
    void client.leave();
    setActiveChannelId(null);
  }, [client]);

  const toggleMuted = useCallback(() => client.setMuted(!client.getSelfState().muted), [client]);
  const toggleDeafened = useCallback(
    () => client.setDeafened(!client.getSelfState().deafened),
    [client],
  );

  const dismissError = useCallback(() => setError(null), []);
  const retryBlockedPlayback = useCallback(() => {
    client.retryBlockedPlayback();
    setPlaybackBlocked(false);
  }, [client]);

  // O ack de `voice:join` já exclui quem entrou (ver `docs/voice-client.md`),
  // então a sala inteira só existe juntando esse participante local — o
  // client não sabe o `username`, só o backend sabe, então ele vem daqui.
  const selfId = client.getSelfId();
  const username = authState.status === 'signed-in' ? authState.user.username : '';
  const participants = useMemo<VoiceParticipant[]>(() => {
    if (!activeChannelId || !selfId) return remoteParticipants;
    const self: VoiceParticipant = {
      socketId: '',
      userId: selfId,
      username,
      muted: selfState.muted,
      deafened: selfState.deafened,
      joinedAt: '',
    };
    return [self, ...remoteParticipants];
  }, [activeChannelId, selfId, username, selfState, remoteParticipants]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannelId,
      connectionState,
      participants,
      muted: selfState.muted,
      deafened: selfState.deafened,
      speakingUserIds,
      error,
      playbackBlocked,
      join,
      leave,
      toggleMuted,
      toggleDeafened,
      dismissError,
      retryBlockedPlayback,
    }),
    [
      activeChannelId,
      connectionState,
      participants,
      selfState,
      speakingUserIds,
      error,
      playbackBlocked,
      join,
      leave,
      toggleMuted,
      toggleDeafened,
      dismissError,
      retryBlockedPlayback,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoiceCall() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoiceCall deve ser usado dentro de VoiceProvider');
  return ctx;
}
