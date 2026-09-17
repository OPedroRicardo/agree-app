import type { SimulcastRid, VoiceContentHint, VoiceParticipant } from './types';
import { clampRid, trackKey } from './voice-media';

/**
 * Geometria e política de camada da view de chamada — puro, sem DOM, pra dar
 * pra testar sem montar componente.
 */

export const TILE_ASPECT = 16 / 9;

/** Um item da chamada: a pessoa (câmera ou avatar) ou a tela que ela compartilha. */
export type VoiceTile = {
  /** `trackKey(userId, source)` — também é a chave do stream no `remoteVideo`. */
  key: string;
  userId: string;
  username: string;
  source: 'camera' | 'screen';
  /**
   * Tem vídeo (câmera ligada, ou é uma tela). Pros outros vem do roster — a
   * track está publicada, mesmo que o stream ainda esteja chegando.
   */
  hasVideo: boolean;
  /** Screenshare — é o que conta pro foco automático. */
  live: boolean;
  isSelf: boolean;
  muted: boolean;
  deafened: boolean;
  contentHint?: VoiceContentHint;
  /** Camadas que a track oferece, melhor primeiro. `[]` pro próprio usuário (nada a puxar). */
  rids: SimulcastRid[];
};

/** Um tile por pessoa e, logo depois dele, um de tela quando ela compartilha — o N do grid conta tiles, não pessoas. */
export function buildVoiceTiles(participants: VoiceParticipant[], selfId: string | null): VoiceTile[] {
  const tiles: VoiceTile[] = [];
  for (const p of participants) {
    const camera = p.tracks.find((t) => t.source === 'camera');
    const screen = p.tracks.find((t) => t.source === 'screen');
    const base = {
      userId: p.userId,
      username: p.username,
      isSelf: p.userId === selfId,
      muted: p.muted,
      deafened: p.deafened,
    };
    tiles.push({
      ...base,
      key: trackKey(p.userId, 'camera'),
      source: 'camera',
      hasVideo: Boolean(camera),
      live: false,
      rids: camera?.rids ?? [],
    });
    if (screen) {
      tiles.push({
        ...base,
        key: trackKey(p.userId, 'screen'),
        source: 'screen',
        hasVideo: true,
        live: true,
        contentHint: screen.contentHint,
        rids: screen.rids,
      });
    }
  }
  return tiles;
}

/** N do grid N×N: 1 → 1, 2–4 → 2, 5–9 → 3, 10–16 → 4. */
export function gridColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count)));
}

export type GridLayout = { cols: number; rows: number; tileWidth: number; tileHeight: number };

/**
 * Tamanho dos tiles (16:9) no grid. Ocupa a largura toda; quando a altura é
 * o limite, encolhe mantendo 16:9 (e o grid fica centralizado também na
 * horizontal). Conta só as linhas usadas: 2 tiles = uma linha de 2, não um
 * 2×2 com a segunda linha vazia.
 */
export function gridLayout(count: number, width: number, height: number, gap: number): GridLayout {
  if (count <= 0 || width <= 0 || height <= 0) return { cols: 0, rows: 0, tileWidth: 0, tileHeight: 0 };
  const cols = gridColumns(count);
  const rows = Math.ceil(count / cols);
  const byWidth = (width - gap * (cols - 1)) / cols;
  const byHeight = ((height - gap * (rows - 1)) / rows) * TILE_ASPECT;
  const tileWidth = Math.max(0, Math.floor(Math.min(byWidth, byHeight)));
  return { cols, rows, tileWidth, tileHeight: Math.floor(tileWidth / TILE_ASPECT) };
}

/** O maior 16:9 que cabe em `width` × `height`. */
export function fitAspect(width: number, height: number): { width: number; height: number } {
  const w = Math.max(0, Math.floor(Math.min(width, height * TILE_ASPECT)));
  return { width: w, height: Math.floor(w / TILE_ASPECT) };
}

/** Altura da faixa de miniaturas do modo foco (tile + respiro + scrollbar horizontal). */
export const STRIP_HEIGHT = 132;
export const STRIP_TILE_HEIGHT = 104;

export type FocusLayout = {
  main: { width: number; height: number };
  thumb: { width: number; height: number };
};

/** Modo foco: o tile focado é o maior 16:9 acima da faixa; sem outros tiles, não há faixa. */
export function focusLayout(width: number, height: number, gap: number, hasStrip: boolean): FocusLayout {
  const mainHeight = hasStrip ? height - STRIP_HEIGHT - gap : height;
  return {
    main: fitAspect(width, Math.max(0, mainHeight)),
    thumb: { width: Math.round(STRIP_TILE_HEIGHT * TILE_ASPECT), height: STRIP_TILE_HEIGHT },
  };
}

export type TilePlacement = 'grid' | 'focus' | 'strip';

/**
 * Camada de simulcast a pedir pra um tile. Depende do modo e do N do grid,
 * não do tamanho em px — a egress do SFU cresce com os pulls, e é aqui que ela
 * é economizada:
 *
 * - foco: o tile focado na melhor, a faixa na mais barata;
 * - grid 2×2 (2–4 tiles): mediana (`h`);
 * - grid 3×3 ou maior: a mais barata — num tile desse tamanho `h` é banda
 *   jogada fora, e quem quer ler uma tela foca nela.
 *
 * "A mais barata" é a última de `rids`: `q`, ou `h` num screenshare `detail`
 * (que não tem `q`). O 1×1 nunca tem tile remoto — você é sempre um dos tiles.
 */
export function pickRid(placement: TilePlacement, cols: number, rids: SimulcastRid[]): SimulcastRid | undefined {
  if (!rids.length) return undefined;
  const cheapest = rids[rids.length - 1];
  if (placement === 'focus') return rids[0];
  if (placement === 'strip') return cheapest;
  return cols <= 2 ? clampRid('h', rids) : cheapest;
}
