import { describe, expect, it } from 'vitest';
import { focusReducer, INITIAL_FOCUS, type FocusState, type FocusTile } from './voice-focus';

const camera = (user: string, hasVideo = false): FocusTile => ({ key: `${user}:camera`, hasVideo, live: false });
const screen = (user: string): FocusTile => ({ key: `${user}:screen`, hasVideo: true, live: true });

const sync = (state: FocusState, ...tiles: FocusTile[]) => focusReducer(state, { type: 'tiles', tiles });
const click = (state: FocusState, tile: FocusTile) =>
  focusReducer(state, { type: 'click', key: tile.key, hasVideo: tile.hasVideo });

describe('focusReducer', () => {
  it('foca automaticamente a primeira live (0 → 1)', () => {
    const state = sync(sync(INITIAL_FOCUS, camera('a')), camera('a'), camera('b'), screen('b'));
    expect(state).toMatchObject({ key: 'b:screen', mode: 'auto' });
  });

  it('conta como 0 → 1 ao entrar numa sala que já tem uma live', () => {
    expect(sync(INITIAL_FOCUS, camera('a'), camera('b'), screen('b'))).toMatchObject({ key: 'b:screen', mode: 'auto' });
  });

  it('câmera não conta para o foco automático', () => {
    expect(sync(INITIAL_FOCUS, camera('a', true), camera('b', true)).key).toBeNull();
  });

  it('uma segunda live derruba o foco automático', () => {
    const auto = sync(INITIAL_FOCUS, camera('a'), screen('a'));
    const state = sync(auto, camera('a'), screen('a'), camera('b'), screen('b'));
    expect(state).toMatchObject({ key: null, mode: null, lives: 2 });
  });

  it('duas lives começando juntas não ganham foco', () => {
    expect(sync(INITIAL_FOCUS, screen('a'), screen('b')).key).toBeNull();
  });

  it('clicar num tile com vídeo foca, clicar de novo desfoca', () => {
    const tiles = [camera('a', true), camera('b', true)];
    const focused = click(sync(INITIAL_FOCUS, ...tiles), tiles[1]);
    expect(focused).toMatchObject({ key: 'b:camera', mode: 'manual' });
    expect(click(focused, tiles[1])).toMatchObject({ key: null, mode: null });
  });

  it('clicar em outro tile troca o foco', () => {
    const tiles = [camera('a', true), camera('b', true)];
    const state = click(click(sync(INITIAL_FOCUS, ...tiles), tiles[0]), tiles[1]);
    expect(state).toMatchObject({ key: 'b:camera', mode: 'manual' });
  });

  it('tile sem vídeo não é focável', () => {
    const start = sync(INITIAL_FOCUS, camera('a'));
    expect(click(start, camera('a'))).toBe(start);
  });

  it('foco manual sobrevive a uma segunda live', () => {
    const one = sync(INITIAL_FOCUS, screen('a'));
    const manual = click(one, screen('a'));
    // desfocou a automática; clica de novo = manual
    const refocused = click(manual, screen('a'));
    expect(refocused).toMatchObject({ key: 'a:screen', mode: 'manual' });
    expect(sync(refocused, screen('a'), screen('b'))).toMatchObject({ key: 'a:screen', mode: 'manual' });
  });

  it('foco manual numa câmera não é roubado pela primeira live', () => {
    const tiles = [camera('a', true), camera('b')];
    const manual = click(sync(INITIAL_FOCUS, ...tiles), tiles[0]);
    expect(sync(manual, ...tiles, screen('b'))).toMatchObject({ key: 'a:camera', mode: 'manual' });
  });

  it('live automática desfocada pelo usuário não volta a ganhar foco sozinha', () => {
    const auto = sync(INITIAL_FOCUS, camera('a'), screen('a'));
    const unfocused = click(auto, screen('a'));
    expect(unfocused.key).toBeNull();
    expect(sync(unfocused, camera('a'), screen('a')).key).toBeNull();
    expect(sync(unfocused, camera('a'), screen('a'), camera('b', true)).key).toBeNull();
  });

  it('uma live nova depois de todas acabarem (1 → 0 → 1) ganha foco de novo', () => {
    const auto = sync(INITIAL_FOCUS, screen('a'));
    const ended = sync(auto, camera('a'));
    expect(ended.key).toBeNull();
    expect(sync(ended, camera('a'), screen('b'))).toMatchObject({ key: 'b:screen', mode: 'auto' });
  });

  it('volta pro grid quando o stream focado acaba', () => {
    const manual = click(sync(INITIAL_FOCUS, camera('a', true)), camera('a', true));
    // câmera desligada: o tile continua (avatar), mas sem vídeo
    expect(sync(manual, camera('a', false))).toMatchObject({ key: null, mode: null });
    // pessoa saiu: o tile some
    expect(sync(manual, camera('b')).key).toBeNull();
  });

  it('devolve o mesmo estado quando nada muda', () => {
    const state = sync(INITIAL_FOCUS, camera('a'), screen('a'));
    expect(sync(state, camera('a'), screen('a'))).toBe(state);
  });
});
