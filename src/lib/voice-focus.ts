/**
 * Estado do "modo foco" da view de chamada: um tile ocupa quase o box inteiro
 * e o resto vira uma faixa de miniaturas. Reducer puro, separado dos
 * componentes, porque as regras têm casos de borda:
 *
 * - "Live" = screenshare. Câmera não conta para o foco automático.
 * - Foco automático só na transição de 0 para 1 live (inclusive ao entrar numa
 *   sala que já tem uma) — por isso uma live desfocada pelo usuário não volta
 *   a ganhar foco sozinha.
 * - Uma segunda live simultânea derruba o foco automático (volta pro grid).
 * - Foco manual (clique num tile com vídeo) vence as regras automáticas;
 *   clicar de novo no tile focado desfoca. Tile sem vídeo não é focável.
 * - Se o stream focado acabar, volta pro grid.
 */

export type FocusMode = 'auto' | 'manual';

export type FocusState = {
  /** Chave do tile focado, `null` = grid. */
  key: string | null;
  mode: FocusMode | null;
  /** Quantas lives havia na última sincronização — é o que detecta a transição 0 → 1. */
  lives: number;
};

/** O que o reducer precisa saber de cada tile. */
export type FocusTile = {
  key: string;
  hasVideo: boolean;
  /** Screenshare. */
  live: boolean;
};

export type FocusAction =
  | { type: 'tiles'; tiles: FocusTile[] }
  | { type: 'click'; key: string; hasVideo: boolean };

export const INITIAL_FOCUS: FocusState = { key: null, mode: null, lives: 0 };

export function focusReducer(state: FocusState, action: FocusAction): FocusState {
  if (action.type === 'click') {
    if (!action.hasVideo) return state;
    if (state.key === action.key) return { ...state, key: null, mode: null };
    return { ...state, key: action.key, mode: 'manual' };
  }

  const { tiles } = action;
  const lives = tiles.filter((t) => t.live && t.hasVideo);
  let { key, mode } = state;

  // O stream focado acabou (tile sumiu, ou perdeu o vídeo).
  if (key && !tiles.some((t) => t.key === key && t.hasVideo)) {
    key = null;
    mode = null;
  }

  // Segunda live simultânea: só o foco automático cai — o manual é escolha do usuário.
  if (mode === 'auto' && lives.length >= 2) {
    key = null;
    mode = null;
  }

  // Primeira live: ganha foco, a menos que o usuário já tenha escolhido um tile.
  if (state.lives === 0 && lives.length === 1 && mode !== 'manual') {
    key = lives[0].key;
    mode = 'auto';
  }

  if (key === state.key && mode === state.mode && lives.length === state.lives) return state;
  return { key, mode, lives: lives.length };
}
