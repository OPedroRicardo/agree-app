import { describe, expect, it } from 'vitest';
import type { VoiceParticipant } from './types';
import { buildVoiceTiles, focusLayout, gridColumns, gridLayout, pickRid, STRIP_HEIGHT } from './voice-layout';
import { clampRid } from './voice-media';

describe('gridColumns', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [9, 3],
    [10, 4],
    [16, 4],
  ])('%i tiles → %i colunas', (count, cols) => {
    expect(gridColumns(count)).toBe(cols);
  });
});

describe('gridLayout', () => {
  it('limitado pela largura: ocupa a largura toda, em 16:9', () => {
    expect(gridLayout(4, 1000, 2000, 10)).toEqual({ cols: 2, rows: 2, tileWidth: 495, tileHeight: 278 });
  });

  it('limitado pela altura: encolhe mantendo 16:9', () => {
    const layout = gridLayout(4, 2000, 500, 10);
    expect(layout.tileWidth).toBe(435);
    expect(layout.tileHeight).toBe(244);
  });

  it('conta só as linhas usadas', () => {
    expect(gridLayout(2, 1000, 1000, 10)).toMatchObject({ cols: 2, rows: 1 });
    expect(gridLayout(5, 1000, 1000, 10)).toMatchObject({ cols: 3, rows: 2 });
  });

  it('nunca estoura o box', () => {
    for (const count of [1, 2, 3, 5, 7, 9, 12, 16]) {
      for (const [width, height] of [
        [800, 600],
        [1600, 300],
        [300, 1600],
      ]) {
        const { cols, rows, tileWidth, tileHeight } = gridLayout(count, width, height, 12);
        expect(cols * tileWidth + (cols - 1) * 12).toBeLessThanOrEqual(width);
        expect(rows * tileHeight + (rows - 1) * 12).toBeLessThanOrEqual(height);
      }
    }
  });

  it('sem tiles ou sem box, zera', () => {
    expect(gridLayout(0, 1000, 1000, 10).tileWidth).toBe(0);
    expect(gridLayout(3, 0, 1000, 10).tileWidth).toBe(0);
  });
});

describe('focusLayout', () => {
  it('o tile focado cabe acima da faixa', () => {
    const { main } = focusLayout(1600, 900, 12, true);
    expect(main.height).toBeLessThanOrEqual(900 - STRIP_HEIGHT - 12);
  });

  it('sem outros tiles não há faixa', () => {
    expect(focusLayout(1600, 900, 12, false).main).toEqual({ width: 1600, height: 900 });
  });
});

describe('pickRid', () => {
  const camera = ['f', 'h', 'q'] as const;
  const screenDetail = ['f', 'h'] as const;

  it('foco: melhor no focado, mais barata na faixa', () => {
    expect(pickRid('focus', 3, [...camera])).toBe('f');
    expect(pickRid('strip', 2, [...camera])).toBe('q');
  });

  it('grid 2×2: mediana', () => {
    expect(pickRid('grid', 2, [...camera])).toBe('h');
  });

  it('grid 3×3 ou maior: mais barata', () => {
    expect(pickRid('grid', 3, [...camera])).toBe('q');
    expect(pickRid('grid', 4, [...camera])).toBe('q');
  });

  it('screenshare detail (sem q) cai em h', () => {
    expect(pickRid('focus', 2, [...screenDetail])).toBe('f');
    expect(pickRid('strip', 2, [...screenDetail])).toBe('h');
    expect(pickRid('grid', 2, [...screenDetail])).toBe('h');
    expect(pickRid('grid', 3, [...screenDetail])).toBe('h');
  });

  it('áudio não tem camada', () => {
    expect(pickRid('grid', 2, [])).toBeUndefined();
  });
});

describe('clampRid', () => {
  it('cai na camada disponível mais próxima, e na mais barata num empate', () => {
    expect(clampRid('q', ['f', 'h'])).toBe('h');
    expect(clampRid('f', ['h', 'q'])).toBe('h');
    expect(clampRid('h', ['f', 'q'])).toBe('q');
    expect(clampRid('h', ['f', 'h', 'q'])).toBe('h');
  });
});

describe('buildVoiceTiles', () => {
  const participant = (userId: string, tracks: VoiceParticipant['tracks']): VoiceParticipant => ({
    socketId: `s-${userId}`,
    userId,
    username: userId,
    muted: false,
    deafened: false,
    joinedAt: '',
    tracks,
  });

  it('um tile por pessoa e um de tela logo depois — o N conta tiles', () => {
    const tiles = buildVoiceTiles(
      [
        participant('a', []),
        participant('b', [
          { trackName: 'camera', source: 'camera', kind: 'video', rids: ['f', 'h', 'q'] },
          { trackName: 'screen', source: 'screen', kind: 'video', contentHint: 'detail', rids: ['f', 'h'] },
        ]),
      ],
      'a',
    );
    expect(tiles.map((t) => [t.key, t.hasVideo, t.live, t.isSelf])).toEqual([
      ['a:camera', false, false, true],
      ['b:camera', true, false, false],
      ['b:screen', true, true, false],
    ]);
    expect(tiles[2].rids).toEqual(['f', 'h']);
  });
});
