import type { Socket } from 'socket.io-client';
import { createVoiceSocket } from './socket';
import { getVoiceSettings, subscribeVoiceSettings, type VoiceSettings } from './voice-settings';
import { playVoiceSound } from './voice-sounds';
import type { VoiceIceServer, VoiceJoinAck, VoiceParticipant } from './types';

type SignalKind = 'offer' | 'answer' | 'candidate';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type VoiceClientEvents = {
  'connection-state': ConnectionState;
  participants: VoiceParticipant[];
  'self-state': { muted: boolean; deafened: boolean };
  speaking: { userId: string; speaking: boolean };
  evicted: void;
  error: string;
  /** Um `<audio>` remoto tentou tocar e o browser bloqueou por falta de gesto do usuário — ver `attachAudio`. */
  'playback-blocked': void;
};

type Listener<K extends keyof VoiceClientEvents> = (payload: VoiceClientEvents[K]) => void;

const SPEAKING_HANGOVER_MS = 300;
const LEVEL_POLL_MS = 60;

/**
 * Implementa o contrato de `docs/voice-client.md`: mesh P2P via
 * `RTCPeerConnection`, sinalização pelo namespace `/voice`. Além do fluxo de
 * negociação descrito no doc, aplica localmente o pipeline de áudio (ganho de
 * entrada, ativação por voz/sensibilidade, volume de saída, troca de
 * dispositivo em chamada) — tudo isso é cosmético do lado do cliente, o
 * servidor nunca vê.
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

  private remoteStreams = new Map<string, MediaStream>();
  private remoteAudioEls = new Map<string, HTMLAudioElement>();
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

      this.selfId = ack.selfId;
      this.iceServers = ack.iceServers;
      this.maxBitrate = ack.bitrate.audio.maxBitrate;
      this.participants = new Map(ack.participants.map((p) => [p.userId, p]));
      this.emit('participants', this.getParticipants());

      for (const p of ack.participants) await this.offerTo(p.userId);

      this.setConnectionState('connected');
      this.startLevelPolling();
      playVoiceSound('join-self');
    } catch (err) {
      this.setConnectionState('error');
      this.emit('error', err instanceof Error ? err.message : 'Falha ao entrar no canal de voz.');
      await this.teardown();
    }
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
    this.participants.clear();
    this.speakingState.clear();

    for (const el of this.remoteAudioEls.values()) {
      el.pause();
      el.srcObject = null;
    }
    this.remoteAudioEls.clear();
    this.remoteAnalysers.clear();
    this.remoteStreams.clear();

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

  /** Troca o microfone em uso sem sair da chamada — refaz o pipeline e substitui a track em cada `RTCPeerConnection` via `replaceTrack`. */
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
      this.participants.set(participant.userId, participant);
      this.emit('participants', this.getParticipants());
      playVoiceSound('peer-join');
    });

    socket.on('voice:peer-left', ({ participant }: { participant: VoiceParticipant }) => {
      this.closePeer(participant.userId);
      this.participants.delete(participant.userId);
      this.emit('participants', this.getParticipants());
      playVoiceSound('peer-leave');
    });

    socket.on('voice:state-changed', ({ participant }: { participant: VoiceParticipant }) => {
      this.participants.set(participant.userId, participant);
      this.emit('participants', this.getParticipants());
    });

    socket.on('voice:evicted', () => {
      this.emit('evicted', undefined);
      void this.teardown();
      this.setConnectionState('idle');
    });

    socket.on('error', (e: { status: string; message: string }) => {
      this.emit('error', e?.message ?? 'Erro desconhecido no canal de voz.');
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
    pc.ontrack = (e) => this.attachRemoteAudio(userId, e.streams[0]);
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

    this.remoteAnalysers.delete(userId);
    this.remoteStreams.delete(userId);
    const el = this.remoteAudioEls.get(userId);
    if (el) {
      el.pause();
      el.srcObject = null;
    }
    this.remoteAudioEls.delete(userId);

    if (this.speakingState.get(userId)) this.emit('speaking', { userId, speaking: false });
    this.speakingState.delete(userId);
  }

  /**
   * Reconexão do socket (queda de rede, restart do backend, corte de 60min
   * do Cloud Run): as `RTCPeerConnection` antigas estão mortas — fecha tudo
   * e refaz o `voice:join`, oferecendo pra todo mundo do novo ack.
   */
  private async rejoin() {
    if (!this.channelId || !this.socket) return;
    const channelId = this.channelId;

    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.pendingCandidates.clear();
    for (const el of this.remoteAudioEls.values()) {
      el.pause();
      el.srcObject = null;
    }
    this.remoteAudioEls.clear();
    this.remoteAnalysers.clear();
    this.remoteStreams.clear();

    try {
      const ack: VoiceJoinAck = await this.socket.timeout(10_000).emitWithAck('voice:join', { channelId });
      this.selfId = ack.selfId;
      this.iceServers = ack.iceServers;
      this.maxBitrate = ack.bitrate.audio.maxBitrate;
      this.participants = new Map(ack.participants.map((p) => [p.userId, p]));
      this.emit('participants', this.getParticipants());
      for (const p of ack.participants) await this.offerTo(p.userId);
      this.setConnectionState('connected');
    } catch (err) {
      this.setConnectionState('error');
      this.emit('error', err instanceof Error ? err.message : 'Falha ao reconectar ao canal de voz.');
    }
  }

  // ---------------------------------------------------------------------
  // Áudio remoto
  // ---------------------------------------------------------------------

  private attachRemoteAudio(userId: string, stream: MediaStream) {
    this.remoteStreams.set(userId, stream);

    const el = new Audio();
    el.autoplay = true;
    el.srcObject = stream;
    this.applyOutputSettings(el);
    this.remoteAudioEls.set(userId, el);
    el.play().catch(() => this.emit('playback-blocked', undefined));

    if (this.audioCtx) {
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      this.audioCtx.createMediaStreamSource(stream).connect(analyser);
      this.remoteAnalysers.set(userId, analyser);
    }
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

export type { VoiceIceServer, VoiceJoinAck, VoiceParticipant };
