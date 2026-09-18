import type { Socket } from 'socket.io-client';
import { createVoiceSocket } from './socket';
import { getVoiceSettings, subscribeVoiceSettings, type VoiceSettings } from './voice-settings';
import { playVoiceSound } from './voice-sounds';
import { canShareScreen, clampRid, profileFor, restrictCodecs, trackKey } from './voice-media';
import { describeNegotiated, describeSdp, describeTransceivers, sfuLog, watchSfuStats } from './voice-debug';
import type {
  SimulcastRid,
  VoiceContentHint,
  VoiceIceServer,
  VoiceJoinAck,
  VoiceParticipant,
  VoiceTopology,
  VoiceTrack,
  VoiceTrackSource,
  VoiceVideoPolicy,
} from './types';

type SignalKind = 'offer' | 'answer' | 'candidate';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/** Câmera/tela do próprio usuário, pro preview na UI — a própria track nunca é puxada do SFU (o servidor recusa). */
export type LocalVideo = {
  camera: MediaStream | null;
  screen: MediaStream | null;
  screenHint: VoiceContentHint | null;
};

export type VoiceClientEvents = {
  'connection-state': ConnectionState;
  participants: VoiceParticipant[];
  'self-state': { muted: boolean; deafened: boolean };
  speaking: { userId: string; speaking: boolean };
  evicted: void;
  error: string;
  /** Um `<audio>` remoto tentou tocar e o browser bloqueou por falta de gesto do usuário — ver `attachRemoteAudio`. */
  'playback-blocked': void;
  topology: VoiceTopology;
  /** Política de vídeo do ack de `voice:join`; `null` = backend sem SFU, e aí não existe câmera nem tela. */
  'video-policy': VoiceVideoPolicy | null;
  'local-video': LocalVideo;
  /** Vídeo puxado do SFU, por `trackKey(userId, source)`. Um `Map` novo a cada mudança. */
  'remote-video': ReadonlyMap<string, MediaStream>;
};

type Listener<K extends keyof VoiceClientEvents> = (payload: VoiceClientEvents[K]) => void;

/** Uma track local publicada no SFU. */
type Publication = {
  transceiver: RTCRtpTransceiver;
  /** Só no `screen`: a ladder depende dele, então trocar de perfil é republicar. */
  hint?: VoiceContentHint;
};

/** Uma track de outro participante puxada do SFU, indexada pelo `mid` que ela ocupa no nosso PC. */
type PulledTrack = {
  userId: string;
  /**
   * Socket do publicador no momento do pull. Um peer que reconecta volta com
   * outro socket (e outra sessão na Cloudflare) — o pull antigo morreu, mesmo
   * que o `userId` e o `trackName` sejam os mesmos.
   */
  socketId: string;
  trackName: VoiceTrackSource;
  kind: 'audio' | 'video';
  /** Camada que o servidor está entregando (só vídeo). */
  rid?: SimulcastRid;
};

type SfuDescriptionAck = {
  sessionDescription?: RTCSessionDescriptionInit;
  requiresImmediateRenegotiation?: boolean;
};

type SfuPublishAck = {
  sessionDescription: RTCSessionDescriptionInit;
  tracks: { mid: string; trackName: VoiceTrackSource }[];
};

type SfuPullAck = SfuDescriptionAck & {
  tracks: { mid: string; userId: string; trackName: VoiceTrackSource }[];
};

/** Um passo da fila de negociação ficou velho: o PC do SFU dele já foi fechado (reconexão, saída). */
class StaleSfuStep extends Error {}

const SPEAKING_HANGOVER_MS = 300;
const LEVEL_POLL_MS = 60;
const SFU_TIMEOUT_MS = 10_000;
/** Limite por chamada de `voice:sfu:pull`/`voice:sfu:close` (o da Cloudflare, repetido no DTO do servidor). */
const SFU_BATCH = 64;
/** Pull recusado (track que ainda não chegou na Cloudflare) é tentado de novo — ver `syncPulls`. */
const PULL_RETRY_MS = 1_500;
const PULL_RETRY_LIMIT = 5;
/**
 * O servidor recusa `voice:signal` numa sala SFU. Durante a migração ainda há
 * candidates do mesh em voo, e esse erro volta por eles — é eco esperado, não
 * falha de verdade.
 */
const MESH_SIGNAL_ON_SFU = 'This voice channel is on the media server, not peer to peer';

/**
 * Implementa o contrato de `docs/voice-client.md`: mesh P2P via
 * `RTCPeerConnection` (Fase 1) e, quando a sala vai para o SFU da Cloudflare,
 * um único PC com publish/pull proxiados pelo namespace `/voice` (Fase 2 —
 * vídeo, screenshare e salas grandes). Além do fluxo de negociação descrito
 * no doc, aplica localmente o pipeline de áudio (ganho de entrada, ativação
 * por voz/sensibilidade, volume de saída, troca de dispositivo em chamada) —
 * tudo isso é cosmético do lado do cliente, o servidor nunca vê.
 */
export class VoiceClient {
  private socket: Socket | null = null;
  private channelId: string | null = null;
  private selfId: string | null = null;
  private iceServers: RTCIceServer[] = [];
  private maxBitrate = 40_000;

  private peers = new Map<string, RTCPeerConnection>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private participants = new Map<string, VoiceParticipant>();

  // Pipeline de entrada (mic -> ganho -> analyser -> destino processado, que é o que vai pro peer).
  private rawInputStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private inputGainNode: GainNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private processedStream: MediaStream | null = null;

  /** Áudio remoto por `trackKey(userId, trackName)` — no mesh é sempre `<userId>:mic`. */
  private remoteStreams = new Map<string, MediaStream>();
  private remoteAudioEls = new Map<string, HTMLAudioElement>();
  /** Detecção de fala por `userId`, só a partir do `mic`. */
  private remoteAnalysers = new Map<string, AnalyserNode>();
  private speakingState = new Map<string, boolean>();
  private localSpeakingHangoverUntil = 0;

  private levelPollHandle: ReturnType<typeof setInterval> | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private settings: VoiceSettings = getVoiceSettings();

  private muted = false;
  private deafened = false;
  /** Mute manual de antes de ensurdecer, restaurado ao desensurdecer — ver {@link setDeafened}. */
  private mutedBeforeDeafen = false;
  private connectionState: ConnectionState = 'idle';

  // --- Fase 2 (SFU) ---
  private topology: VoiceTopology = 'mesh';
  private videoPolicy: VoiceVideoPolicy | null = null;
  /** O único PC do modo SFU, com a Cloudflare do outro lado. */
  private sfu: RTCPeerConnection | null = null;
  /** Incrementado quando o PC do SFU morre — passos da fila de uma sessão anterior desistem sozinhos. */
  private sfuEpoch = 0;
  private sfuQueue: Promise<void> = Promise.resolve();
  /** O emit de SFU em andamento, pra um `error` do socket falhar ele na hora (ver {@link sfuEmit}). */
  private sfuRequest: { reject: (err: Error) => void } | null = null;
  private recoveringSfu = false;
  /** Para o log periódico de bytes do PC do SFU (ver `voice-debug.ts`). */
  private stopSfuStats: () => void = () => undefined;
  /** Tentativas seguidas de pull recusado (ver `syncPulls`); zera quando um sync termina bem. */
  private pullRetries = 0;
  private pullRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private published = new Map<VoiceTrackSource, Publication>();
  private pulled = new Map<string, PulledTrack>();
  /** Mids de pulls já aposentados localmente (ver {@link retirePulls}) que a fila ainda precisa fechar no servidor. */
  private closingMids = new Set<string>();
  private remoteVideo = new Map<string, MediaStream>();
  /** Camada que a UI quer por `trackKey` — usada no pull e no `voice:sfu:layer`. */
  private preferredRids = new Map<string, SimulcastRid>();
  private localCamera: MediaStream | null = null;
  private localScreen: { stream: MediaStream; hint: VoiceContentHint } | null = null;
  private capturingCamera = false;
  private capturingScreen = false;

  private listeners: { [K in keyof VoiceClientEvents]?: Set<Listener<K>> } = {};

  on<K extends keyof VoiceClientEvents>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners[event] as Set<Listener<K>> | undefined;
    if (!set) {
      set = new Set();
      (this.listeners as Record<string, unknown>)[event] = set;
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  private emit<K extends keyof VoiceClientEvents>(event: K, payload: VoiceClientEvents[K]) {
    const set = this.listeners[event] as Set<Listener<K>> | undefined;
    if (set) for (const listener of set) listener(payload);
  }

  private setConnectionState(state: ConnectionState) {
    this.connectionState = state;
    this.emit('connection-state', state);
  }

  getConnectionState() {
    return this.connectionState;
  }

  getParticipants(): VoiceParticipant[] {
    return [...this.participants.values()];
  }

  /** `null` until the `voice:join` ack resolves. */
  getSelfId(): string | null {
    return this.selfId;
  }

  isConnected() {
    return this.connectionState === 'connected' || this.connectionState === 'reconnecting';
  }

  getSelfState() {
    return { muted: this.muted, deafened: this.deafened };
  }

  getLocalVideo(): LocalVideo {
    return {
      camera: this.localCamera,
      screen: this.localScreen?.stream ?? null,
      screenHint: this.localScreen?.hint ?? null,
    };
  }

  // ---------------------------------------------------------------------
  // Join / leave
  // ---------------------------------------------------------------------

  async join(channelId: string) {
    if (this.channelId === channelId && this.isConnected()) return;
    if (this.isConnected()) await this.leave();

    this.channelId = channelId;
    this.setConnectionState('connecting');

    try {
      await this.openInputPipeline();
    } catch (err) {
      this.setConnectionState('error');
      this.emit('error', err instanceof Error ? err.message : 'Não foi possível acessar o microfone.');
      this.channelId = null;
      return;
    }

    this.unsubscribeSettings = subscribeVoiceSettings((s) => this.onSettingsChanged(s));

    const socket = createVoiceSocket();
    this.socket = socket;
    this.bind(socket);
    socket.connect();

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', (err) => reject(err));
      });

      const ack: VoiceJoinAck = await socket.timeout(10_000).emitWithAck('voice:join', { channelId });
      await this.afterJoin(ack);

      this.setConnectionState('connected');
      this.startLevelPolling();
      playVoiceSound('join-self');
    } catch (err) {
      this.setConnectionState('error');
      this.emit('error', err instanceof Error ? err.message : 'Falha ao entrar no canal de voz.');
      await this.teardown();
    }
  }

  /**
   * Aplica um ack de `voice:join` — do primeiro join e do rejoin. Numa sala
   * que já está no SFU (6º participante, ou alguém com vídeo) não existe mesh:
   * o servidor recusaria o `voice:signal`. Câmera/tela locais ainda ativas
   * (rejoin) são republicadas pelo `syncPublished` — numa sala mesh isso a
   * promove, como qualquer vídeo.
   */
  private async afterJoin(ack: VoiceJoinAck) {
    this.selfId = ack.selfId;
    this.iceServers = ack.iceServers;
    this.maxBitrate = ack.bitrate.audio.maxBitrate;
    this.participants = new Map(ack.participants.map((p) => [p.userId, { ...p, tracks: p.tracks ?? [] }]));
    this.emit('participants', this.getParticipants());

    this.videoPolicy = ack.video ?? null;
    this.emit('video-policy', this.videoPolicy);
    if (!this.videoPolicy) this.dropLocalVideo();

    if (ack.topology === 'sfu') {
      this.enterSfu();
    } else {
      this.setTopology('mesh');
      for (const p of ack.participants) await this.offerTo(p.userId);
    }
    void this.syncPublished();
  }

  async leave() {
    const wasInChannel = Boolean(this.channelId);
    if (this.socket && this.channelId) {
      try {
        await this.socket.timeout(5_000).emitWithAck('voice:leave', { channelId: this.channelId });
      } catch {
        // Socket já pode estar morto — segue pro teardown de qualquer forma.
      }
    }
    await this.teardown();
    this.setConnectionState('idle');
    if (wasInChannel) playVoiceSound('leave-self');
  }

  private async teardown() {
    this.stopLevelPolling();
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;

    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.pendingCandidates.clear();
    // Sem chamada nenhuma pra Cloudflare: o servidor já derruba a sessão com a presença.
    this.resetSfu();
    this.dropLocalVideo();
    this.preferredRids.clear();
    this.participants.clear();
    this.speakingState.clear();
    this.clearRemoteAudio();

    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;

    for (const track of this.rawInputStream?.getTracks() ?? []) track.stop();
    this.rawInputStream = null;
    this.processedStream = null;
    this.inputGainNode = null;
    this.inputAnalyser = null;
    if (this.audioCtx) {
      await this.audioCtx.close().catch(() => undefined);
      this.audioCtx = null;
    }

    this.setTopology('mesh');
    if (this.videoPolicy) {
      this.videoPolicy = null;
      this.emit('video-policy', null);
    }
    this.channelId = null;
    this.selfId = null;
  }

  // ---------------------------------------------------------------------
  // Pipeline de entrada
  // ---------------------------------------------------------------------

  private async openInputPipeline() {
    const s = getVoiceSettings();
    this.settings = s;

    this.rawInputStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: s.inputDeviceId ? { exact: s.inputDeviceId } : undefined,
        echoCancellation: s.echoCancellation,
        noiseSuppression: s.noiseSuppression,
        autoGainControl: s.autoGainControl,
      },
      video: false,
    });

    this.audioCtx = new AudioContext();
    const source = this.audioCtx.createMediaStreamSource(this.rawInputStream);
    this.inputGainNode = this.audioCtx.createGain();
    this.inputGainNode.gain.value = s.inputVolumePct / 100;
    this.inputAnalyser = this.audioCtx.createAnalyser();
    this.inputAnalyser.fftSize = 512;
    const dest = this.audioCtx.createMediaStreamDestination();

    source.connect(this.inputGainNode);
    this.inputGainNode.connect(this.inputAnalyser);
    this.inputAnalyser.connect(dest);

    this.processedStream = dest.stream;
    this.applyLocalTrackGate();
  }

  /**
   * Troca o microfone em uso sem sair da chamada — refaz o pipeline e
   * substitui a track via `replaceTrack` em cada `RTCPeerConnection` do mesh e
   * no sender do mic publicado no SFU. Nenhum dos dois renegocia.
   */
  private async swapInputDevice() {
    if (!this.channelId) return;
    const oldRaw = this.rawInputStream;
    const oldCtx = this.audioCtx;

    try {
      await this.openInputPipeline();
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : 'Não foi possível trocar o microfone.');
      return;
    }

    const newTrack = this.processedStream?.getAudioTracks()[0];
    if (newTrack) {
      for (const pc of this.peers.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        void sender?.replaceTrack(newTrack);
      }
      void this.published.get('mic')?.transceiver.sender.replaceTrack(newTrack);
    }

    for (const track of oldRaw?.getTracks() ?? []) track.stop();
    if (oldCtx) void oldCtx.close().catch(() => undefined);
  }

  private onSettingsChanged(next: VoiceSettings) {
    const prev = this.settings;
    this.settings = next;

    if (this.inputGainNode && next.inputVolumePct !== prev.inputVolumePct) {
      this.inputGainNode.gain.value = next.inputVolumePct / 100;
    }

    if (next.outputVolumePct !== prev.outputVolumePct || next.outputDeviceId !== prev.outputDeviceId) {
      for (const el of this.remoteAudioEls.values()) this.applyOutputSettings(el);
    }

    if (
      next.inputDeviceId !== prev.inputDeviceId ||
      next.echoCancellation !== prev.echoCancellation ||
      next.noiseSuppression !== prev.noiseSuppression ||
      next.autoGainControl !== prev.autoGainControl
    ) {
      void this.swapInputDevice();
    }

    if (!next.voiceActivityEnabled) this.applyLocalTrackGate(true);
  }

  private applyOutputSettings(el: HTMLAudioElement) {
    el.volume = this.deafened ? 0 : Math.min(1, this.settings.outputVolumePct / 100);
    if (this.settings.outputDeviceId && 'setSinkId' in el) {
      (el as HTMLAudioElement & { setSinkId(id: string): Promise<void> })
        .setSinkId(this.settings.outputDeviceId)
        .catch(() => undefined);
    }
  }

  // ---------------------------------------------------------------------
  // Mute / deafen / sensibilidade
  // ---------------------------------------------------------------------

  /** Gate manual (mute) ou por sensibilidade (voice activity). `open` força o gate aberto mesmo sem fala detectada — usada quando o modo "sempre aberto" é ligado. */
  private applyLocalTrackGate(open = false) {
    const track = this.processedStream?.getAudioTracks()[0];
    if (!track) return;
    if (this.muted || this.deafened) {
      track.enabled = false;
      return;
    }
    if (!this.settings.voiceActivityEnabled) {
      track.enabled = true;
      return;
    }
    track.enabled = open || Date.now() < this.localSpeakingHangoverUntil;
  }

  /**
   * Só existem 3 combinações válidas de mic/fone: (mic off, fone on),
   * (mic off, fone off) e (mic on, fone on) — nunca mic on com fone off,
   * porque não faz sentido falar com o fone mudo. Por isso desmutar o mic
   * (`setMuted(false)`) também sai do ensurdecido, mesmo se só o botão do
   * mic foi clicado.
   */
  setMuted(muted: boolean) {
    if (muted !== this.muted) playVoiceSound(muted ? 'mute' : 'unmute');
    this.muted = muted;
    if (!muted) this.deafened = false;
    this.applyLocalTrackGate();
    for (const el of this.remoteAudioEls.values()) this.applyOutputSettings(el);
    void this.pushSelfState();
    this.emit('self-state', this.getSelfState());
  }

  /**
   * Ensurdecer força o mic mudo (não dá pra falar com o fone mudo) e lembra
   * o mute anterior pra restaurar ao desensurdecer — assim desligar o fone
   * não desmuta o mic sozinho, e religar não perde um mute manual anterior.
   */
  setDeafened(deafened: boolean) {
    this.deafened = deafened;
    if (deafened) {
      this.mutedBeforeDeafen = this.muted;
      this.muted = true;
    } else {
      this.muted = this.mutedBeforeDeafen;
    }
    this.applyLocalTrackGate();
    for (const el of this.remoteAudioEls.values()) this.applyOutputSettings(el);
    void this.pushSelfState();
    this.emit('self-state', this.getSelfState());
  }

  private pushSelfState() {
    if (!this.socket || !this.channelId) return Promise.resolve();
    return this.socket
      .timeout(5_000)
      .emitWithAck('voice:state', { channelId: this.channelId, muted: this.muted, deafened: this.deafened })
      .catch(() => undefined);
  }

  // ---------------------------------------------------------------------
  // Sinalização (ver docs/voice-client.md)
  // ---------------------------------------------------------------------

  private bind(socket: Socket) {
    socket.on(
      'voice:signal',
      (m: { fromUserId: string; kind: SignalKind; payload: RTCSessionDescriptionInit | RTCIceCandidateInit }) => {
        void this.onSignal(m);
      },
    );

    socket.on('voice:peer-joined', ({ participant }: { participant: VoiceParticipant }) => {
      this.participants.set(participant.userId, { ...participant, tracks: participant.tracks ?? [] });
      this.emit('participants', this.getParticipants());
      playVoiceSound('peer-join');
    });

    socket.on('voice:peer-left', ({ participant }: { participant: VoiceParticipant }) => {
      this.closePeer(participant.userId);
      this.participants.delete(participant.userId);
      this.emit('participants', this.getParticipants());
      playVoiceSound('peer-leave');
      // No SFU: some com tudo o que vinha dele agora, e fecha os pulls na fila.
      if (this.topology === 'sfu') {
        this.retirePulls(participant.userId);
        void this.syncPulls();
      }
    });

    socket.on('voice:state-changed', ({ participant }: { participant: VoiceParticipant }) => {
      // As tracks são mantidas pelos eventos `track-*` — o state-changed só muda mute/deafen.
      const tracks = this.participants.get(participant.userId)?.tracks ?? participant.tracks ?? [];
      this.participants.set(participant.userId, { ...participant, tracks });
      this.emit('participants', this.getParticipants());
    });

    socket.on('voice:topology-changed', ({ topology }: { topology: VoiceTopology }) => {
      if (topology === 'sfu') this.enterSfu();
    });

    socket.on('voice:track-published', ({ userId, track }: { userId: string; track: VoiceTrack }) => {
      const p = this.participants.get(userId);
      if (!p) return;
      const tracks = [...p.tracks.filter((t) => t.trackName !== track.trackName), track];
      this.participants.set(userId, { ...p, tracks });
      this.emit('participants', this.getParticipants());
      void this.syncPulls();
    });

    socket.on(
      'voice:track-unpublished',
      ({ userId, trackName }: { userId: string; trackName: VoiceTrackSource }) => {
        const p = this.participants.get(userId);
        if (p) {
          this.participants.set(userId, { ...p, tracks: p.tracks.filter((t) => t.trackName !== trackName) });
          this.emit('participants', this.getParticipants());
        }
        this.retirePulls(userId, trackName);
        void this.syncPulls();
      },
    );

    socket.on('voice:evicted', () => {
      this.emit('evicted', undefined);
      void this.teardown();
      this.setConnectionState('idle');
    });

    socket.on('error', (e: { status: string; message: string }) => {
      const message = e?.message ?? 'Erro desconhecido no canal de voz.';
      if (message === MESH_SIGNAL_ON_SFU) return;
      // Erros não voltam pelo ack: o que chegar durante um emit de SFU é dele (ver `sfuEmit`).
      if (this.sfuRequest) {
        this.sfuRequest.reject(new Error(message));
        return;
      }
      this.emit('error', message);
    });

    socket.io.on('reconnect', () => void this.rejoin());
    socket.io.on('reconnect_attempt', () => this.setConnectionState('reconnecting'));
  }

  private peer(userId: string): RTCPeerConnection {
    const existing = this.peers.get(userId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peers.set(userId, pc);
    this.pendingCandidates.set(userId, []);

    for (const track of this.processedStream?.getTracks() ?? []) {
      pc.addTrack(track, this.processedStream!);
    }
    this.applyBitrate(pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) void this.send(userId, 'candidate', e.candidate.toJSON());
    };
    pc.ontrack = (e) => this.attachRemoteAudio(userId, 'mic', e.streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
    };

    return pc;
  }

  private async offerTo(userId: string) {
    const pc = this.peer(userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.send(userId, 'offer', offer);
  }

  private async onSignal({
    fromUserId,
    kind,
    payload,
  }: {
    fromUserId: string;
    kind: SignalKind;
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  }) {
    // Sinal do mesh atrasado, de antes da migração: não recria PC nenhum.
    if (this.topology === 'sfu') return;

    const pc = this.peer(fromUserId);

    if (kind === 'offer') {
      await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
      await this.flushPending(fromUserId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.send(fromUserId, 'answer', answer);
      return;
    }

    if (kind === 'answer') {
      await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
      await this.flushPending(fromUserId, pc);
      return;
    }

    if (pc.remoteDescription) await pc.addIceCandidate(payload as RTCIceCandidateInit);
    else this.pendingCandidates.get(fromUserId)?.push(payload as RTCIceCandidateInit);
  }

  private async flushPending(userId: string, pc: RTCPeerConnection) {
    const queued = this.pendingCandidates.get(userId) ?? [];
    this.pendingCandidates.set(userId, []);
    for (const c of queued) await pc.addIceCandidate(c);
  }

  private send(targetUserId: string, kind: SignalKind, payload: unknown) {
    if (!this.socket || !this.channelId) return Promise.resolve();
    return this.socket
      .timeout(5_000)
      .emitWithAck('voice:signal', { channelId: this.channelId, targetUserId, kind, payload })
      .catch(() => undefined);
  }

  /** O teto é aplicado pelo cliente — o servidor só publica a política (ver `docs/voice-client.md`). */
  private applyBitrate(pc: RTCPeerConnection) {
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind !== 'audio') continue;
      const params = sender.getParameters();
      params.encodings ??= [{}];
      params.encodings[0].maxBitrate = this.maxBitrate;
      void sender.setParameters(params);
    }
  }

  private closePeer(userId: string) {
    this.peers.get(userId)?.close();
    this.peers.delete(userId);
    this.pendingCandidates.delete(userId);
    this.detachRemoteAudio(userId, 'mic');
  }

  /**
   * Reconexão do socket (queda de rede, restart do backend, corte de 60min
   * do Cloud Run): as `RTCPeerConnection` antigas estão mortas — a do SFU
   * inclusive, porque o servidor apagou a presença e a sessão junto. Fecha
   * tudo e refaz o `voice:join`; o `afterJoin` republica mic/câmera/tela
   * locais, que continuam vivos.
   */
  private async rejoin() {
    if (!this.channelId || !this.socket) return;
    const channelId = this.channelId;

    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.pendingCandidates.clear();
    this.resetSfu();
    this.clearRemoteAudio();
    this.setTopology('mesh');

    try {
      const ack: VoiceJoinAck = await this.socket.timeout(10_000).emitWithAck('voice:join', { channelId });
      await this.afterJoin(ack);
      this.setConnectionState('connected');
    } catch (err) {
      this.setConnectionState('error');
      this.emit('error', err instanceof Error ? err.message : 'Falha ao reconectar ao canal de voz.');
    }
  }

  // ---------------------------------------------------------------------
  // Fase 2 — SFU (ver "Fase 2 — SFU" em docs/voice-client.md)
  // ---------------------------------------------------------------------

  getTopology(): VoiceTopology {
    return this.topology;
  }

  getVideoPolicy(): VoiceVideoPolicy | null {
    return this.videoPolicy;
  }

  private setTopology(topology: VoiceTopology) {
    if (this.topology === topology) return;
    this.topology = topology;
    this.emit('topology', topology);
  }

  /**
   * Migra a sala para o SFU — por `voice:topology-changed` ou por um ack que
   * já veio `sfu`. Idempotente: a promoção é só num sentido, e quem ligou o
   * vídeo recebe o evento com o PC do SFU já aberto (é reaproveitado).
   */
  private enterSfu() {
    if (this.topology !== 'sfu') {
      for (const userId of [...this.peers.keys()]) this.closePeer(userId);
      this.pendingCandidates.clear();
      this.setTopology('sfu');
    }
    this.ensureSfuPc();
    void this.syncPublished();
    void this.syncPulls();
  }

  private ensureSfuPc(): RTCPeerConnection {
    if (this.sfu) return this.sfu;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    pc.ontrack = (e) => {
      const pull = e.transceiver.mid ? this.pulled.get(e.transceiver.mid) : undefined;
      sfuLog('ontrack', { mid: e.transceiver.mid, kind: e.track.kind, pull });
      if (pull) this.attachPull(pull, e.track);
    };
    pc.onconnectionstatechange = () => {
      sfuLog('connectionState', pc.connectionState, '|', describeTransceivers(pc));
      if (pc.connectionState === 'failed' && this.sfu === pc) void this.recoverSfu();
    };
    pc.oniceconnectionstatechange = () => sfuLog('iceConnectionState', pc.iceConnectionState);
    pc.onsignalingstatechange = () => sfuLog('signalingState', pc.signalingState);
    this.sfu = pc;
    this.stopSfuStats();
    this.stopSfuStats = watchSfuStats(pc);
    sfuLog('PC do SFU criado', { epoch: this.sfuEpoch });
    return pc;
  }

  /** Fecha o PC do SFU e esquece tudo o que dependia dele. Não fala com o servidor. */
  private resetSfu() {
    sfuLog('resetSfu', { epoch: this.sfuEpoch, hadPc: Boolean(this.sfu) });
    this.stopSfuStats();
    this.stopSfuStats = () => undefined;
    if (this.pullRetryTimer) clearTimeout(this.pullRetryTimer);
    this.pullRetryTimer = null;
    this.pullRetries = 0;
    this.sfuEpoch++;
    this.sfuRequest?.reject(new StaleSfuStep());
    this.sfuRequest = null;
    this.sfu?.close();
    this.sfu = null;
    this.published.clear();
    for (const mid of [...this.pulled.keys()]) this.forgetPull(mid);
    this.closingMids.clear();
  }

  /**
   * O PC do SFU entrou em `failed`. O contrato não tem ICE restart pelo proxy,
   * e a sessão da Cloudflare no servidor é presa a este PC (um PC novo não
   * consegue republicar nela) — então a saída é um leave + join: presença
   * nova, sessão nova, e o `afterJoin` republica tudo.
   */
  private async recoverSfu() {
    if (this.recoveringSfu || !this.socket || !this.channelId) return;
    this.recoveringSfu = true;
    this.setConnectionState('reconnecting');
    try {
      await this.socket.timeout(5_000).emitWithAck('voice:leave', { channelId: this.channelId });
    } catch {
      // Sem ack do leave o socket provavelmente caiu junto — aí a reconexão do socket.io refaz o join de qualquer forma.
    }
    await this.rejoin();
    this.recoveringSfu = false;
  }

  /**
   * Regra de ouro do SFU: publish, pull, close e layer mexem no mesmo PC (e
   * na mesma sessão no servidor), então rodam um por vez. Um passo de uma
   * sessão anterior (`sfuEpoch` mudou) desiste sem tocar em nada; um passo que
   * falha não trava a fila.
   */
  private negotiate(step: (guard: () => void) => Promise<void>): Promise<void> {
    const epoch = this.sfuEpoch;
    const guard = () => {
      if (epoch !== this.sfuEpoch) throw new StaleSfuStep();
    };
    const run = async () => {
      if (epoch !== this.sfuEpoch) return;
      try {
        await step(guard);
      } catch (err) {
        if (err instanceof StaleSfuStep || epoch !== this.sfuEpoch) return;
        sfuLog('passo da fila falhou', err instanceof Error ? err.message : err, {
          signalingState: this.sfu?.signalingState,
          transceivers: this.sfu ? describeTransceivers(this.sfu) : null,
          negotiated: this.sfu ? describeNegotiated(this.sfu) : null,
        });
        // Uma offer nossa sem resposta deixaria o PC em `have-local-offer` e quebraria a próxima negociação.
        if (this.sfu?.signalingState === 'have-local-offer') {
          await this.sfu.setLocalDescription({ type: 'rollback' }).catch(() => undefined);
        }
        if (await this.sfuCannotNegotiate()) {
          void this.recoverSfu();
          return;
        }
        this.emit('error', err instanceof Error ? err.message : 'Falha na negociação com o servidor de mídia.');
      }
    };
    const next = this.sfuQueue.then(run, run);
    this.sfuQueue = next;
    return next;
  }

  /**
   * O PC do SFU ainda consegue negociar? Um SDP remoto que o Chrome recusou
   * pela metade envenena o PC: a partir dali *toda* negociação estoura o mesmo
   * erro, `createOffer` inclusive, então nem o close consegue desfazer o
   * estrago. Não dá para inferir isso do `connectionState` (a mídia que já
   * fluía continua, e ele fica em `connected`), então a checagem é direta —
   * tentar uma offer. Num PC são é barato e não muda o `signalingState`.
   */
  private async sfuCannotNegotiate(): Promise<boolean> {
    const pc = this.sfu;
    if (!pc || pc.signalingState !== 'stable') return false;
    try {
      await pc.createOffer();
      return false;
    } catch (err) {
      sfuLog('PC do SFU não negocia mais, refazendo a sessão', err instanceof Error ? err.message : err);
      return true;
    }
  }

  /**
   * `emitWithAck` de um evento de SFU. Erros não voltam pelo ack — chegam no
   * evento `error` e o ack nunca é chamado —, então o emit corre contra o
   * próximo `error` do socket: como todo `voice:sfu:*` passa pela fila, um erro
   * que chega durante ele é dele, e a fila não fica 10s parada no timeout.
   */
  private sfuEmit<T>(event: string, payload: object): Promise<T> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new StaleSfuStep());

    sfuLog(`→ ${event}`, summarizeSfuPayload(payload));
    return new Promise<T>((resolve, reject) => {
      // Um `error` do socket já falhou o pedido; o timeout do ack que chega 10s
      // depois é do mesmo pedido, e não merece outra linha no log.
      let settled = false;
      const request = {
        reject: (err: Error) => {
          settled = true;
          sfuLog(`✗ ${event}`, err.message);
          reject(err);
        },
      };
      this.sfuRequest = request;
      const done = () => {
        if (this.sfuRequest === request) this.sfuRequest = null;
      };
      socket
        .timeout(SFU_TIMEOUT_MS)
        .emitWithAck(event, payload)
        .then(
          (ack: T) => {
            done();
            sfuLog(`← ${event}`, summarizeSfuPayload(ack));
            resolve(ack);
          },
          (err: unknown) => {
            done();
            if (!settled) sfuLog(`✗ ${event}`, err instanceof Error ? err.message : err);
            reject(err instanceof Error ? err : new Error(String(err)));
          },
        );
    });
  }

  /**
   * Aplica o `sessionDescription` de uma resposta do SFU. Uma `answer` fecha
   * uma negociação que nós começamos (só o publish, hoje); uma `offer`
   * com `requiresImmediateRenegotiation` é a Cloudflare começando uma (pull),
   * e precisa voltar como `voice:sfu:renegotiate`.
   */
  private async applySfuDescription(pc: RTCPeerConnection, ack: SfuDescriptionAck, guard: () => void) {
    const description = ack.sessionDescription;
    sfuLog('applySfuDescription', {
      type: description?.type ?? null,
      requiresImmediateRenegotiation: ack.requiresImmediateRenegotiation,
      signalingState: pc.signalingState,
    });
    if (!description) return;

    if (description.type === 'answer') {
      await pc.setRemoteDescription(description);
      return;
    }

    if (description.type === 'offer' && ack.requiresImmediateRenegotiation) {
      await pc.setRemoteDescription(description);
      guard();
      await pc.setLocalDescription(await pc.createAnswer());
      guard();
      await this.sfuEmit('voice:sfu:renegotiate', {
        channelId: this.channelId,
        sessionDescription: plain(pc.localDescription),
      });
    }
  }

  /**
   * O que este cliente deveria estar publicando agora, **na ordem das
   * m-sections**. No mesh o mic segue P2P (o servidor recusa publish só de
   * áudio numa sala mesh) — mas qualquer vídeo leva o mic junto, e primeiro.
   *
   * A primeira m-section do PC ancora o transporte compartilhado
   * (`max-bundle`). Se ela fosse a tela, fechar a live rejeitaria a âncora e o
   * Chrome derrubaria o transporte inteiro — visto no log: `ice=new dtls=new`
   * logo após o close, e o mic parando junto. O mic dura a chamada toda, então
   * é ele que ancora.
   */
  private wantedPublications() {
    const wanted = new Map<VoiceTrackSource, { track: MediaStreamTrack; hint?: VoiceContentHint }>();
    // A track do pipeline processado (ganho + ativação por voz), nunca o mic cru.
    const mic = this.processedStream?.getAudioTracks()[0];
    const camera = this.videoPolicy ? this.localCamera?.getVideoTracks()[0] : undefined;
    const screen = this.videoPolicy && this.localScreen ? this.localScreen.stream.getVideoTracks()[0] : undefined;

    if (mic && (this.topology === 'sfu' || camera || screen)) wanted.set('mic', { track: mic });
    if (camera) wanted.set('camera', { track: camera });
    if (screen && this.localScreen) wanted.set('screen', { track: screen, hint: this.localScreen.hint });
    return wanted;
  }

  /**
   * Reconcilia o que está publicado com o que deveria estar. Idempotente e
   * sempre na fila, então ligar/desligar a câmera rápido, a migração e o
   * rejoin podem pedir uma sync cada um sem se atropelar.
   */
  private syncPublished(): Promise<void> {
    return this.negotiate(async (guard) => {
      const wanted = this.wantedPublications();
      const stale: [VoiceTrackSource, Publication][] = [];

      for (const [source, publication] of this.published) {
        const want = wanted.get(source);
        if (!want || want.hint !== publication.hint) {
          stale.push([source, publication]);
        } else if (publication.transceiver.sender.track !== want.track) {
          // Mesma fonte e mesmo perfil com outra track (câmera religada, mic trocado): sem renegociar.
          await publication.transceiver.sender.replaceTrack(want.track);
          guard();
        }
      }

      const staleSources = new Set(stale.map(([source]) => source));
      const missing = [...wanted].filter(([source]) => !this.published.has(source) || staleSources.has(source));
      if (!stale.length && !missing.length) return;

      const pc = this.ensureSfuPc();
      if (stale.length) await this.unpublish(pc, stale, guard);
      if (missing.length) await this.publish(pc, missing, guard);
    });
  }

  /**
   * Desliga câmera/tela no servidor. Só `track.stop()` não basta — a presença
   * continuaria anunciando a track para todo mundo.
   */
  private async unpublish(pc: RTCPeerConnection, stale: [VoiceTrackSource, Publication][], guard: () => void) {
    const mids: string[] = [];
    for (const [source, { transceiver }] of stale) {
      if (transceiver.mid) mids.push(transceiver.mid);
      else retireTransceiver(transceiver);
      this.published.delete(source);
    }
    if (!mids.length) return;

    await this.closeMids(pc, mids, guard);
  }

  /**
   * Fecha `mids` no servidor — track publicada e pull, o mesmo caminho para os
   * dois. **Sem offer e sem renegociar**: o transceiver fica no lugar, morto
   * (ver {@link retireTransceiver}), e o servidor manda `force: true` para a
   * Cloudflare.
   *
   * É isso que evita a colisão de ids de header extension. Uma offer nossa com
   * a m-section em porta 0 — o que `transceiver.stop()` gera — libera aquele
   * slot, e a Cloudflare reaproveita o mid na próxima offer dela (um pull) com
   * ids novos. O Chrome guarda o mapa de extensions por mid pela vida do PC e
   * recusa a troca (`RTP extension ID reassignment not supported (collision on
   * active MID n)`), e a partir daí *nenhuma* negociação naquele PC funciona —
   * nem `createOffer`. Era o que quebrava reabrir uma live. Ninguém oferecer
   * porta 0 é o que mantém o mid fora do alcance dela.
   *
   * O preço é uma m-section morta por track fechada, que não custa encoder nem
   * banda. Se a Cloudflare reaproveitar um transceiver desses num pull futuro,
   * o {@link syncPulls} pega a track do receiver.
   */
  private async closeMids(pc: RTCPeerConnection, mids: string[], guard: () => void) {
    sfuLog('closeMids', mids, '| antes:', describeTransceivers(pc));
    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.mid && mids.includes(transceiver.mid)) retireTransceiver(transceiver);
    }

    await this.sfuEmit('voice:sfu:close', { channelId: this.channelId, mids });
    guard();
    sfuLog('closeMids ok', mids, '| depois:', describeTransceivers(pc), '| conn:', pc.connectionState);
  }

  /**
   * Publica as fontes faltando numa offer só. O servidor inspeciona a offer:
   * só VP8/Opus (`setCodecPreferences`) e simulcast com exatamente as camadas
   * do perfil (`sendEncodings` do ack). O `mid` só existe depois do
   * `setLocalDescription`.
   */
  private async publish(
    pc: RTCPeerConnection,
    missing: [VoiceTrackSource, { track: MediaStreamTrack; hint?: VoiceContentHint }][],
    guard: () => void,
  ) {
    const policy = this.videoPolicy;
    const added = missing.map(([source, { track, hint }]) => {
      if (track.kind === 'video' && policy && (source === 'camera' || source === 'screen')) {
        if (source === 'screen' && hint) track.contentHint = hint;
        const profile = policy.profiles[profileFor(source, hint)];
        const transceiver = pc.addTransceiver(track, {
          direction: 'sendonly',
          sendEncodings: profile.encodings.map((encoding) => ({ ...encoding })),
        });
        restrictCodecs(transceiver, 'video', policy.codecs);
        return { source, hint, transceiver };
      }
      const transceiver = pc.addTransceiver(track, {
        direction: 'sendonly',
        sendEncodings: [{ maxBitrate: this.maxBitrate }],
      });
      restrictCodecs(transceiver, 'audio', ['opus']);
      return { source, hint, transceiver };
    });

    try {
      const offer = await pc.createOffer();
      // Logada antes de aplicar: se o `setLocalDescription` recusar, ela nunca chega ao `sfuEmit`.
      sfuLog('offer local (publish)', describeSdp(offer.sdp));
      await pc.setLocalDescription(offer);
      guard();
      const ack = await this.sfuEmit<SfuPublishAck>('voice:sfu:publish', {
        channelId: this.channelId,
        sessionDescription: plain(pc.localDescription),
        tracks: added.map(({ source, hint, transceiver }) => ({
          mid: transceiver.mid,
          source,
          ...(source === 'screen' ? { contentHint: hint } : {}),
        })),
      });
      guard();
      await pc.setRemoteDescription(ack.sessionDescription);
      guard();
      for (const { source, hint, transceiver } of added) this.published.set(source, { transceiver, hint });
      sfuLog(
        'publish ok',
        added.map(({ source, transceiver }) => `${source}@${transceiver.mid}`),
        '| transceivers:',
        describeTransceivers(pc),
      );
    } catch (err) {
      if (err instanceof StaleSfuStep) throw err;
      if (pc.signalingState === 'have-local-offer') {
        await pc.setLocalDescription({ type: 'rollback' }).catch(() => undefined);
      }
      // Um transceiver que nunca foi negociado não tem m-section para rejeitar,
      // então `stop()` aqui não libera mid nenhum. Se o rollback deixou o mid,
      // aposenta em vez de parar — ver {@link closeMids}.
      for (const { transceiver } of added) {
        if (transceiver.mid) retireTransceiver(transceiver);
        else transceiver.stop();
      }
      // Câmera/tela recusadas voltam a desligadas — senão a próxima sync tentaria de novo pra sempre.
      if (added.some(({ source }) => source === 'camera')) this.releaseCamera();
      if (added.some(({ source }) => source === 'screen')) this.releaseScreen();
      throw err;
    }
  }

  /** Um pull ainda justificado pelo roster: o publicador segue no mesmo socket e segue publicando essa track. */
  private rosterHas(pull: PulledTrack): boolean {
    const p = this.participants.get(pull.userId);
    return Boolean(p && p.socketId === pull.socketId && p.tracks.some((t) => t.trackName === pull.trackName));
  }

  /**
   * Reconcilia o que está puxado com o roster: fecha (com offer, ver
   * {@link closeMids}) o que o roster não justifica mais — `peer-left`,
   * `track-unpublished`, peer que reconectou — e puxa o que falta. Áudio sempre; vídeo de todos, porque todo
   * tile está no grid ou na faixa — e sem `preferredRid` o servidor já manda
   * a camada mais barata.
   */
  private syncPulls(): Promise<void> {
    return this.negotiate(async (guard) => {
      if (this.topology !== 'sfu') return;
      const pc = this.ensureSfuPc();

      for (const [mid, pull] of [...this.pulled]) {
        if (this.rosterHas(pull)) continue;
        this.forgetPull(mid);
        this.closingMids.add(mid);
      }
      const staleMids = [...this.closingMids];
      this.closingMids.clear();
      for (const mids of chunks(staleMids, SFU_BATCH)) {
        await this.closeMids(pc, mids, guard);
        guard();
      }

      const pulledKeys = new Set([...this.pulled.values()].map((p) => trackKey(p.userId, p.trackName)));
      const wanted: (PulledTrack & { preferredRid?: SimulcastRid })[] = [];
      for (const p of this.participants.values()) {
        for (const track of p.tracks) {
          const key = trackKey(p.userId, track.trackName);
          if (pulledKeys.has(key)) continue;
          const preferred = this.preferredRids.get(key);
          const preferredRid =
            track.kind === 'video' && preferred ? clampRid(preferred, track.rids) : undefined;
          wanted.push({
            userId: p.userId,
            socketId: p.socketId,
            trackName: track.trackName,
            kind: track.kind,
            preferredRid,
            // Sem `preferredRid` o servidor entrega a mais barata (a última da lista).
            rid: track.kind === 'video' ? (preferredRid ?? track.rids[track.rids.length - 1]) : undefined,
          });
        }
      }

      for (const batch of chunks(wanted, SFU_BATCH)) {
        let ack: SfuPullAck;
        try {
          ack = await this.sfuEmit<SfuPullAck>('voice:sfu:pull', {
            channelId: this.channelId,
            tracks: batch.map(({ userId, trackName, preferredRid }) => ({
              userId,
              trackName,
              ...(preferredRid ? { preferredRid } : {}),
            })),
          });
        } catch (err) {
          if (err instanceof StaleSfuStep || this.pullRetries >= PULL_RETRY_LIMIT) throw err;
          // Puxar logo após o publish de alguém falha com `not_found_track_error`:
          // a Cloudflare só conhece a track depois que o PC do publicador conecta
          // e manda pacotes. Visto no log. O pull falha no emit, antes de qualquer
          // offer, então o PC continua `stable` — é só tentar de novo.
          this.pullRetries++;
          sfuLog(`pull falhou, nova tentativa ${this.pullRetries}/${PULL_RETRY_LIMIT} em ${PULL_RETRY_MS}ms`, err instanceof Error ? err.message : err);
          this.schedulePullRetry();
          return;
        }
        guard();
        // O mapa mid → track tem que existir antes do setRemoteDescription, que é quando o `ontrack` dispara.
        for (const t of ack.tracks) {
          const request = batch.find((w) => w.userId === t.userId && w.trackName === t.trackName);
          if (!request) continue;
          this.pulled.set(t.mid, {
            userId: request.userId,
            socketId: request.socketId,
            trackName: request.trackName,
            kind: request.kind,
            rid: request.rid,
          });
        }
        try {
          await this.applySfuDescription(pc, ack, guard);
        } catch (err) {
          // Os mids foram registrados antes do `ontrack`, mas sem a
          // renegociação eles não existem de verdade: esquece e agenda o close,
          // senão o servidor segue achando que recebemos essas tracks e todo
          // pull novo volta como "You are already receiving …".
          if (!(err instanceof StaleSfuStep)) {
            for (const t of ack.tracks) {
              this.forgetPull(t.mid);
              this.closingMids.add(t.mid);
            }
          }
          throw err;
        }
        guard();
        // O `ontrack` não dispara de novo num transceiver que a Cloudflare reaproveitou — pega do receiver.
        for (const transceiver of pc.getTransceivers()) {
          const pull = transceiver.mid ? this.pulled.get(transceiver.mid) : undefined;
          if (pull && ack.tracks.some((t) => t.mid === transceiver.mid)) this.attachPull(pull, transceiver.receiver.track);
        }
      }
      this.pullRetries = 0;
    });
  }

  /** Agenda um `syncPulls` depois de um pull recusado — um só pendente por vez. */
  private schedulePullRetry() {
    if (this.pullRetryTimer) return;
    this.pullRetryTimer = setTimeout(() => {
      this.pullRetryTimer = null;
      void this.syncPulls();
    }, PULL_RETRY_MS);
  }

  /** Liga uma track puxada ao `<audio>` ou ao mapa de vídeo — sempre num `MediaStream` próprio, sem confiar em `e.streams[0]`. */
  private attachPull(pull: PulledTrack, track: MediaStreamTrack) {
    if (!this.rosterHas(pull)) return;
    const key = trackKey(pull.userId, pull.trackName);
    // `mute` num track recebido = pararam de chegar pacotes. É o sinal direto de "a voz parou".
    track.onmute = () => sfuLog('track remoto mute (sem pacotes)', key);
    track.onunmute = () => sfuLog('track remoto unmute', key);
    track.onended = () => sfuLog('track remoto ended', key);
    if (pull.kind === 'audio') {
      if (this.remoteStreams.get(key)?.getTracks()[0] === track) return;
      this.attachRemoteAudio(pull.userId, pull.trackName, new MediaStream([track]));
      return;
    }
    if (this.remoteVideo.get(key)?.getTracks()[0] === track) return;
    this.remoteVideo.set(key, new MediaStream([track]));
    this.emitRemoteVideo();
  }

  /**
   * Aposenta na hora os pulls de um peer (uma track, ou todas) e agenda o
   * close no servidor. Tem que ser síncrono, no handler do evento: uma troca
   * de perfil da tela chega como `track-unpublished` + `track-published` com
   * o mesmo nome, e quando a fila rodasse o roster já mostraria a track nova —
   * o pull morto pareceria válido e a nova nunca seria puxada.
   */
  private retirePulls(userId: string, trackName?: VoiceTrackSource) {
    for (const [mid, pull] of [...this.pulled]) {
      if (pull.userId !== userId || (trackName && pull.trackName !== trackName)) continue;
      this.forgetPull(mid);
      this.closingMids.add(mid);
    }
  }

  /** Esquece um pull localmente (o close no servidor é de quem chama). */
  private forgetPull(mid: string) {
    const pull = this.pulled.get(mid);
    if (!pull) return;
    this.pulled.delete(mid);
    this.dropRemoteMedia(pull.userId, pull.trackName);
  }

  /** Tira do ar, na hora, o áudio/vídeo de um peer (uma track, ou todas) — sem esperar a fila fechar o pull. */
  private dropRemoteMedia(userId: string, trackName?: VoiceTrackSource) {
    const sources: VoiceTrackSource[] = trackName ? [trackName] : ['mic', 'screen-audio', 'camera', 'screen'];
    let videoChanged = false;
    for (const source of sources) {
      if (source === 'mic' || source === 'screen-audio') this.detachRemoteAudio(userId, source);
      else videoChanged = this.remoteVideo.delete(trackKey(userId, source)) || videoChanged;
    }
    if (videoChanged) this.emitRemoteVideo();
  }

  /**
   * Camada de simulcast que a UI quer para um tile. Guarda a preferência (o
   * pull que ainda não aconteceu já sai com ela) e, se o pull existe e a
   * camada muda, emite `voice:sfu:layer` — na fila, junto dos outros emits de
   * SFU. A Cloudflare continua baixando a camada sozinha sob congestionamento.
   */
  setVideoLayer(userId: string, trackName: VoiceTrackSource, rid: SimulcastRid) {
    const key = trackKey(userId, trackName);
    if (this.preferredRids.get(key) === rid) return;
    this.preferredRids.set(key, rid);
    if (this.topology !== 'sfu') return;

    void this.negotiate(async () => {
      const entry = [...this.pulled].find(
        ([, p]) => p.userId === userId && p.trackName === trackName && p.kind === 'video',
      );
      if (!entry) return;
      const [mid, pull] = entry;
      const track = this.participants.get(userId)?.tracks.find((t) => t.trackName === trackName);
      const preferred = this.preferredRids.get(key);
      const next = track && preferred ? clampRid(preferred, track.rids) : undefined;
      if (!next || next === pull.rid) return;

      console.debug('[voice] voice:sfu:layer', { userId, trackName, mid, preferredRid: next });
      await this.sfuEmit('voice:sfu:layer', { channelId: this.channelId, mid, preferredRid: next });
      pull.rid = next;
    });
  }

  // ---------------------------------------------------------------------
  // Câmera e screenshare
  // ---------------------------------------------------------------------

  /** Liga/desliga a câmera. Numa sala mesh, ligar promove a sala para o SFU (vídeo nunca roda no mesh). */
  async setCameraEnabled(on: boolean) {
    if (!on) {
      this.releaseCamera();
      void this.syncPublished();
      return;
    }

    const policy = this.videoPolicy;
    const channelId = this.channelId;
    if (this.localCamera || this.capturingCamera || !policy || !channelId) return;

    this.capturingCamera = true;
    let stream: MediaStream;
    try {
      // As camadas (`scaleResolutionDownBy`) são relativas ao que foi capturado, então captura no perfil.
      stream = await navigator.mediaDevices.getUserMedia({ video: policy.profiles.camera.capture, audio: false });
    } catch (err) {
      this.emit('error', captureErrorMessage(err));
      return;
    } finally {
      this.capturingCamera = false;
    }

    // Saiu da chamada (ou trocou de canal) com o prompt aberto.
    if (this.channelId !== channelId || !this.isConnected()) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const [track] = stream.getVideoTracks();
    // Dispositivo desconectado no meio da chamada.
    track.onended = () => {
      if (this.localCamera === stream) void this.setCameraEnabled(false);
    };
    this.localCamera = stream;
    this.emitLocalVideo();
    void this.syncPublished();
  }

  /** Começa um screenshare com o perfil `hint` — `'detail'` (texto/código) ou `'motion'` (vídeo/jogo). */
  async startScreenShare(hint: VoiceContentHint) {
    const policy = this.videoPolicy;
    const channelId = this.channelId;
    if (this.capturingScreen || !policy || !channelId || !canShareScreen()) return;

    this.capturingScreen = true;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: policy.profiles[profileFor('screen', hint)].capture,
        audio: false,
      });
    } catch (err) {
      // Fechar o seletor de tela também cai aqui (NotAllowedError) — isso não é erro pro usuário.
      if (!(err instanceof DOMException && err.name === 'NotAllowedError')) {
        this.emit('error', err instanceof Error ? err.message : 'Não foi possível compartilhar a tela.');
      }
      return;
    } finally {
      this.capturingScreen = false;
    }

    if (this.channelId !== channelId || !this.isConnected()) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }

    const [track] = stream.getVideoTracks();
    track.contentHint = hint;
    // O "Parar compartilhamento" nativo do sistema termina a track com `ended` —
    // e só `track.stop()` não despublica, então passa pelo mesmo caminho do botão.
    track.onended = () => {
      if (this.localScreen?.stream === stream) this.stopScreenShare();
    };
    this.releaseScreen();
    this.localScreen = { stream, hint };
    this.emitLocalVideo();
    void this.syncPublished();
  }

  stopScreenShare() {
    this.releaseScreen();
    void this.syncPublished();
  }

  private releaseCamera() {
    if (!this.localCamera) return;
    for (const track of this.localCamera.getTracks()) track.stop();
    this.localCamera = null;
    this.emitLocalVideo();
  }

  private releaseScreen() {
    if (!this.localScreen) return;
    for (const track of this.localScreen.stream.getTracks()) track.stop();
    this.localScreen = null;
    this.emitLocalVideo();
  }

  /** Para câmera e tela locais sem despublicar — quando a sessão do SFU morre junto (saída, evicted) ou quando não existe vídeo. */
  private dropLocalVideo() {
    this.releaseCamera();
    this.releaseScreen();
  }

  private emitLocalVideo() {
    this.emit('local-video', this.getLocalVideo());
  }

  private emitRemoteVideo() {
    this.emit('remote-video', new Map(this.remoteVideo));
  }

  // ---------------------------------------------------------------------
  // Áudio remoto
  // ---------------------------------------------------------------------

  /** `<audio>` para uma track remota. Só o `mic` ganha `AnalyserNode` — é ele que acende o indicador de fala. */
  private attachRemoteAudio(userId: string, trackName: VoiceTrackSource, stream: MediaStream) {
    const key = trackKey(userId, trackName);
    const previous = this.remoteAudioEls.get(key);
    if (previous) {
      previous.pause();
      previous.srcObject = null;
    }
    this.remoteStreams.set(key, stream);

    const el = new Audio();
    el.autoplay = true;
    el.srcObject = stream;
    this.applyOutputSettings(el);
    this.remoteAudioEls.set(key, el);
    el.play().catch(() => this.emit('playback-blocked', undefined));

    if (this.audioCtx && trackName === 'mic') {
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      this.audioCtx.createMediaStreamSource(stream).connect(analyser);
      this.remoteAnalysers.set(userId, analyser);
    }
  }

  private detachRemoteAudio(userId: string, trackName: VoiceTrackSource) {
    const key = trackKey(userId, trackName);
    const el = this.remoteAudioEls.get(key);
    if (el) {
      el.pause();
      el.srcObject = null;
    }
    this.remoteAudioEls.delete(key);
    this.remoteStreams.delete(key);

    if (trackName !== 'mic') return;
    this.remoteAnalysers.delete(userId);
    if (this.speakingState.get(userId)) this.emit('speaking', { userId, speaking: false });
    this.speakingState.delete(userId);
  }

  private clearRemoteAudio() {
    for (const el of this.remoteAudioEls.values()) {
      el.pause();
      el.srcObject = null;
    }
    this.remoteAudioEls.clear();
    this.remoteAnalysers.clear();
    this.remoteStreams.clear();
  }

  /** Reproduz de novo todo `<audio>` remoto pendurado por autoplay bloqueado — chame a partir de um gesto do usuário (ex.: clique em "ativar áudio"). */
  retryBlockedPlayback() {
    for (const el of this.remoteAudioEls.values()) void el.play().catch(() => undefined);
  }

  // ---------------------------------------------------------------------
  // Detecção de fala (local e remota)
  // ---------------------------------------------------------------------

  private startLevelPolling() {
    this.stopLevelPolling();
    this.levelPollHandle = setInterval(() => this.pollLevels(), LEVEL_POLL_MS);
  }

  private stopLevelPolling() {
    if (this.levelPollHandle) clearInterval(this.levelPollHandle);
    this.levelPollHandle = null;
  }

  private pollLevels() {
    if (this.inputAnalyser) {
      const db = readLevelDb(this.inputAnalyser);
      const above = db > this.settings.sensitivityDb;
      if (above) this.localSpeakingHangoverUntil = Date.now() + SPEAKING_HANGOVER_MS;
      if (this.settings.voiceActivityEnabled && !this.muted && !this.deafened) this.applyLocalTrackGate();

      const speaking = !this.muted && !this.deafened && Date.now() < this.localSpeakingHangoverUntil;
      if (this.selfId) this.updateSpeaking(this.selfId, speaking);
    }

    for (const [userId, analyser] of this.remoteAnalysers) {
      const db = readLevelDb(analyser);
      this.updateSpeaking(userId, db > -50);
    }
  }

  private updateSpeaking(userId: string, speaking: boolean) {
    if (this.speakingState.get(userId) === speaking) return;
    this.speakingState.set(userId, speaking);
    this.emit('speaking', { userId, speaking });
  }
}

function readLevelDb(analyser: AnalyserNode): number {
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  let sumSquares = 0;
  for (const sample of data) sumSquares += sample * sample;
  const rms = Math.sqrt(sumSquares / data.length);
  if (rms <= 0) return -Infinity;
  return 20 * Math.log10(rms);
}

/** Payload/ack de um `voice:sfu:*` pro log: o SDP vira o resumo de `describeSdp`. */
function summarizeSfuPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const { sessionDescription, ...rest } = payload as { sessionDescription?: RTCSessionDescriptionInit };
  return sessionDescription
    ? { ...rest, sessionDescription: `${sessionDescription.type}{${describeSdp(sessionDescription.sdp)}}` }
    : rest;
}

/** `RTCSessionDescription` → objeto simples `{ type, sdp }`, que é o que o DTO do servidor valida. */
function plain(description: RTCSessionDescription | null): RTCSessionDescriptionInit {
  if (!description) throw new Error('Sem descrição local para enviar ao servidor de mídia.');
  return { type: description.type, sdp: description.sdp };
}

/**
 * Aposenta um transceiver **sem** `stop()`: para de mandar na hora
 * (`replaceTrack(null)`) e marca a m-section como `inactive`, que continua
 * ocupando o slot. `stop()` colocaria porta 0 na próxima offer e liberaria o
 * mid para a Cloudflare reaproveitar — ver `VoiceClient.closeMids`.
 */
function retireTransceiver(transceiver: RTCRtpTransceiver) {
  void transceiver.sender.replaceTrack(null).catch(() => undefined);
  try {
    transceiver.direction = 'inactive';
  } catch {
    // Transceiver já parado (PC em teardown): não há o que aposentar.
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function captureErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') return 'Permissão da câmera negada.';
  if (err instanceof DOMException && err.name === 'NotFoundError') return 'Nenhuma câmera encontrada.';
  return err instanceof Error ? err.message : 'Não foi possível abrir a câmera.';
}

export type { VoiceIceServer, VoiceJoinAck, VoiceParticipant };
