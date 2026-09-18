import type { Socket } from 'socket.io-client';
import { createVoiceSocket } from './socket';
import type { VoiceParticipant, VoicePresenceEvent, VoiceWatchAck } from './types';

export type PresenceByChannel = ReadonlyMap<string, VoiceParticipant[]>;

type Listener = (presence: PresenceByChannel) => void;

/**
 * Quem está em cada canal de voz do servidor aberto, sem precisar entrar em
 * nenhum — o `voice:watch` de `docs/voice-client.md`.
 *
 * Usa um socket `/voice` **próprio e persistente**, separado do socket
 * por-chamada do {@link VoiceClient}: aquele nasce no `join` e morre no
 * `leave` (com `removeAllListeners`), e amarrar a presença ao ciclo de vida
 * da chamada quebraria a sidebar justamente quando o usuário não está numa.
 * Do lado do backend um socket que só observa nunca entra em `voice:<id>`,
 * então não conta como "segundo socket do usuário" para a evicção.
 */
export class VoicePresenceWatcher {
  private socket: Socket | null = null;
  private serverId: string | null = null;
  private presence = new Map<string, VoiceParticipant[]>();
  private listeners = new Set<Listener>();

  /** Snapshot imutável para `useSyncExternalStore` — nova referência a cada mudança. */
  getSnapshot(): PresenceByChannel {
    return this.presence;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Passa a observar `serverId` (ou nada, com `null`). Abre o socket na
   * primeira chamada; nas seguintes faz `unwatch` do anterior e `watch` do
   * novo. O ack do `watch` substitui o mapa inteiro.
   */
  watch(serverId: string | null) {
    const previous = this.serverId;
    if (previous === serverId) return;
    this.serverId = serverId;

    const socket = this.ensureSocket();
    if (previous && socket.connected) socket.emit('voice:unwatch', { serverId: previous });

    // Trocou de servidor: o que estava na tela era do anterior.
    this.replaceAll(new Map());

    if (serverId && socket.connected) this.emitWatch(serverId);
  }

  /** Derruba o socket — chamado no logout/unmount do provider. */
  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.serverId = null;
    this.replaceAll(new Map());
  }

  private ensureSocket(): Socket {
    if (this.socket) return this.socket;

    const socket = createVoiceSocket();
    this.socket = socket;

    // Reconectar perde as rooms do lado do servidor — o `watch` é refeito em
    // todo `connect`, inclusive o primeiro (é assim que o watch inicial sai).
    socket.on('connect', () => {
      if (this.serverId) this.emitWatch(this.serverId);
    });

    socket.on('voice:presence', (event: VoicePresenceEvent) => {
      if (event.serverId !== this.serverId) return;
      const next = new Map(this.presence);
      next.set(event.channelId, event.participants);
      this.replaceAll(next);
    });

    socket.connect();
    return socket;
  }

  private emitWatch(serverId: string) {
    this.socket?.emit('voice:watch', { serverId }, (ack: VoiceWatchAck | { status: string }) => {
      // Um erro do handler chega pelo evento `error`, nunca pelo ack; se o
      // usuário trocou de servidor enquanto o ack viajava, ele já é velho.
      if (!('channels' in ack) || ack.serverId !== this.serverId) return;
      this.replaceAll(new Map(Object.entries(ack.channels)));
    });
  }

  private replaceAll(next: Map<string, VoiceParticipant[]>) {
    this.presence = next;
    for (const listener of this.listeners) listener(next);
  }
}
