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
import { VoiceClient, type LocalVideo } from './voice-client';
import type {
  SimulcastRid,
  VoiceContentHint,
  VoiceParticipant,
  VoiceTopology,
  VoiceTrack,
  VoiceTrackSource,
} from './types';

type VoiceConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

type VoiceContextValue = {
  activeChannelId: string | null;
  /** Servidor do canal da chamada — não é o servidor aberto na tela, a chamada continua ao trocar de servidor ou ir pras DMs. */
  activeServerId: string | null;
  connectionState: VoiceConnectionState;
  participants: VoiceParticipant[];
  muted: boolean;
  deafened: boolean;
  speakingUserIds: Set<string>;
  error: string | null;
  playbackBlocked: boolean;
  topology: VoiceTopology;
  /** `false` com backend sem SFU (`ack.video === null`) — aí não existe câmera nem tela. */
  videoAvailable: boolean;
  /** Tracks locais, pro preview do próprio usuário (a própria track nunca é puxada do SFU). */
  localCamera: MediaStream | null;
  localScreen: MediaStream | null;
  screenHint: VoiceContentHint | null;
  /** Vídeo dos outros, por `trackKey(userId, source)`. */
  remoteVideo: ReadonlyMap<string, MediaStream>;
  join: (channelId: string, serverId: string) => void;
  leave: () => void;
  toggleMuted: () => void;
  toggleDeafened: () => void;
  toggleCamera: () => void;
  startScreenShare: (hint: VoiceContentHint) => void;
  stopScreenShare: () => void;
  /** Camada de simulcast que um tile quer — o client só emite `voice:sfu:layer` quando ela muda. */
  setVideoLayer: (userId: string, trackName: VoiceTrackSource, rid: SimulcastRid) => void;
  dismissError: () => void;
  retryBlockedPlayback: () => void;
};

const NO_LOCAL_VIDEO: LocalVideo = { camera: null, screen: null, screenHint: null };

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
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('idle');
  const [remoteParticipants, setRemoteParticipants] = useState<VoiceParticipant[]>([]);
  const [selfState, setSelfState] = useState({ muted: false, deafened: false });
  const [speakingUserIds, setSpeakingUserIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [topology, setTopology] = useState<VoiceTopology>('mesh');
  const [videoAvailable, setVideoAvailable] = useState(false);
  const [localVideo, setLocalVideo] = useState<LocalVideo>(NO_LOCAL_VIDEO);
  const [remoteVideo, setRemoteVideo] = useState<ReadonlyMap<string, MediaStream>>(new Map());

  useEffect(() => {
    const offState = client.on('connection-state', (s) => {
      setConnectionState(s);
      if (s === 'idle' || s === 'error') {
        setActiveChannelId(null);
        setActiveServerId(null);
      }
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
    const offTopology = client.on('topology', setTopology);
    const offPolicy = client.on('video-policy', (policy) => setVideoAvailable(policy !== null));
    const offLocalVideo = client.on('local-video', setLocalVideo);
    const offRemoteVideo = client.on('remote-video', setRemoteVideo);

    return () => {
      offState();
      offParticipants();
      offSelf();
      offSpeaking();
      offEvicted();
      offError();
      offBlocked();
      offTopology();
      offPolicy();
      offLocalVideo();
      offRemoteVideo();
    };
  }, [client]);

  // Sai da chamada se a página inteira desmontar (logout, fechar app).
  useEffect(() => () => void client.leave(), [client]);

  const join = useCallback(
    (channelId: string, serverId: string) => {
      setError(null);
      setActiveChannelId(channelId);
      setActiveServerId(serverId);
      void client.join(channelId);
    },
    [client],
  );

  const leave = useCallback(() => {
    void client.leave();
    setActiveChannelId(null);
    setActiveServerId(null);
  }, [client]);

  const toggleMuted = useCallback(() => client.setMuted(!client.getSelfState().muted), [client]);
  const toggleDeafened = useCallback(
    () => client.setDeafened(!client.getSelfState().deafened),
    [client],
  );

  const toggleCamera = useCallback(
    () => void client.setCameraEnabled(!client.getLocalVideo().camera),
    [client],
  );
  const startScreenShare = useCallback(
    (hint: VoiceContentHint) => void client.startScreenShare(hint),
    [client],
  );
  const stopScreenShare = useCallback(() => client.stopScreenShare(), [client]);
  const setVideoLayer = useCallback(
    (userId: string, trackName: VoiceTrackSource, rid: SimulcastRid) =>
      client.setVideoLayer(userId, trackName, rid),
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
  // As tracks do participante local saem das tracks locais — o servidor nunca
  // manda `track-published` pra quem publicou.
  const participants = useMemo<VoiceParticipant[]>(() => {
    if (!activeChannelId || !selfId) return remoteParticipants;
    const tracks: VoiceTrack[] = [];
    if (localVideo.camera) tracks.push({ trackName: 'camera', source: 'camera', kind: 'video', rids: [] });
    if (localVideo.screen) {
      tracks.push({
        trackName: 'screen',
        source: 'screen',
        kind: 'video',
        contentHint: localVideo.screenHint ?? undefined,
        rids: [],
      });
    }
    const self: VoiceParticipant = {
      socketId: '',
      userId: selfId,
      username,
      muted: selfState.muted,
      deafened: selfState.deafened,
      joinedAt: '',
      tracks,
    };
    return [self, ...remoteParticipants];
  }, [activeChannelId, selfId, username, selfState, remoteParticipants, localVideo]);

  const value = useMemo<VoiceContextValue>(
    () => ({
      activeChannelId,
      activeServerId,
      connectionState,
      participants,
      muted: selfState.muted,
      deafened: selfState.deafened,
      speakingUserIds,
      error,
      playbackBlocked,
      topology,
      videoAvailable,
      localCamera: localVideo.camera,
      localScreen: localVideo.screen,
      screenHint: localVideo.screenHint,
      remoteVideo,
      join,
      leave,
      toggleMuted,
      toggleDeafened,
      toggleCamera,
      startScreenShare,
      stopScreenShare,
      setVideoLayer,
      dismissError,
      retryBlockedPlayback,
    }),
    [
      activeChannelId,
      activeServerId,
      connectionState,
      participants,
      selfState,
      speakingUserIds,
      error,
      playbackBlocked,
      topology,
      videoAvailable,
      localVideo,
      remoteVideo,
      join,
      leave,
      toggleMuted,
      toggleDeafened,
      toggleCamera,
      startScreenShare,
      stopScreenShare,
      setVideoLayer,
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
