import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle, Volume2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useServerMembersById } from '@/lib/server-members';
import { useVoiceCall } from '@/lib/voice-context';
import { focusReducer, INITIAL_FOCUS } from '@/lib/voice-focus';
import {
  buildVoiceTiles,
  focusLayout,
  gridColumns,
  gridLayout,
  pickRid,
  STRIP_HEIGHT,
  type VoiceTile as VoiceTileModel,
} from '@/lib/voice-layout';
import type { AgreeChannel, SimulcastRid } from '@/lib/types';
import { VoiceTile } from './VoiceTile';

const GAP = 12;
/** Troca de camada espera o layout assentar — focar/desfocar rápido não vira rajada de `voice:sfu:layer`. */
const LAYER_DEBOUNCE_MS = 500;

/**
 * O que ocupa o lugar da lista de mensagens e do composer quando o canal
 * aberto é de voz: a chamada (estilo Discord) se você está nela, senão um
 * convite pra entrar.
 */
export function VoiceView({
  channel,
  serverId,
}: {
  channel: Pick<AgreeChannel, '_id' | 'name'>;
  serverId: string | null;
}) {
  const { activeChannelId, connectionState, participants, error, join } = useVoiceCall();
  const inThisCall = activeChannelId === channel._id;

  if (!inThisCall) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: 'var(--agree-chat-bg)' }}>
        <div className="m-auto flex flex-col items-center gap-3 px-6 text-center" style={{ animation: 'agree-fade-up 0.3s ease both' }}>
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-accent"
            style={{ background: 'color-mix(in srgb, var(--agree-accent) 15%, transparent)' }}
          >
            <Volume2 size={24} />
          </div>
          <div className="text-[14px] font-medium text-text">{channel.name}</div>
          <div className="text-[12px] text-neutral-500">
            {activeChannelId ? 'Você está em outro canal de voz.' : 'Você não está nesta chamada.'}
          </div>
          {error && <div className="max-w-sm text-[12px] text-danger">{error}</div>}
          <button
            type="button"
            disabled={!serverId}
            onClick={() => serverId && join(channel._id, serverId)}
            className="rounded-md border border-accent px-4 py-2 text-[12.5px] font-medium text-accent transition-all duration-150 hover:bg-accent/10 active:scale-95 disabled:opacity-40"
          >
            {activeChannelId ? 'Mudar para este canal' : 'Entrar na chamada'}
          </button>
        </div>
      </div>
    );
  }

  // Sem o ack do join ainda não existe nem o próprio tile.
  if (connectionState === 'connecting' || participants.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" style={{ background: 'var(--agree-chat-bg)' }}>
        <div className="m-auto flex items-center gap-2 text-[13px] text-neutral-500">
          <LoaderCircle size={16} className="animate-spin" />
          Conectando…
        </div>
      </div>
    );
  }

  return <VoiceStage />;
}

/** Grid N×N ou modo foco, dimensionados pelo box via `ResizeObserver`. */
function VoiceStage() {
  const {
    activeServerId,
    participants,
    speakingUserIds,
    localCamera,
    localScreen,
    remoteVideo,
    setVideoLayer,
  } = useVoiceCall();

  // Fotos: a própria do perfil, a dos outros da lista de membros — a mesma fonte da VoiceStatusBar.
  const { state: authState } = useAuth();
  const self = authState.status === 'signed-in' ? authState.user : null;
  const selfId = self?.sub ?? null;
  const membersById = useServerMembersById(
    activeServerId,
    participants.map((p) => p.userId),
  );
  const pictureOf = (userId: string) =>
    userId === selfId ? self?.profileImageUrl : membersById.get(userId)?.profileImageUrl;

  const tiles = useMemo(() => buildVoiceTiles(participants, selfId), [participants, selfId]);

  const [focus, dispatch] = useReducer(focusReducer, INITIAL_FOCUS);
  useEffect(() => {
    dispatch({ type: 'tiles', tiles });
  }, [tiles]);
  // Validado também no render: nenhum frame focando um tile que acabou de sumir.
  const focused = focus.key ? (tiles.find((t) => t.key === focus.key && t.hasVideo) ?? null) : null;
  const others = focused ? tiles.filter((t) => t.key !== focused.key) : tiles;

  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Camada de simulcast por tile remoto com vídeo (regra em `pickRid`). Serializado
  // numa string pra o debounce só recomeçar quando alguma camada muda de fato.
  const cols = gridColumns(tiles.length);
  const layerKey = tiles
    .filter((t) => !t.isSelf && t.hasVideo)
    .map((t) => {
      const placement = focused ? (t.key === focused.key ? 'focus' : 'strip') : 'grid';
      return `${t.userId}|${t.source}|${pickRid(placement, cols, t.rids) ?? ''}`;
    })
    .join(',');
  const layers = useMemo(
    () =>
      layerKey
        .split(',')
        .filter(Boolean)
        .map((entry) => {
          const [userId, source, rid] = entry.split('|');
          return { userId, source: source as 'camera' | 'screen', rid: rid as SimulcastRid | '' };
        }),
    [layerKey],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const { userId, source, rid } of layers) if (rid) setVideoLayer(userId, source, rid);
    }, LAYER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [layers, setVideoLayer]);

  const streamOf = (tile: VoiceTileModel): MediaStream | null => {
    if (!tile.hasVideo) return null;
    if (tile.isSelf) return tile.source === 'camera' ? localCamera : localScreen;
    return remoteVideo.get(tile.key) ?? null;
  };

  const renderTile = (tile: VoiceTileModel, size: { width: number; height: number }, compact = false) => (
    <VoiceTile
      key={tile.key}
      tile={tile}
      stream={streamOf(tile)}
      pictureUrl={pictureOf(tile.userId)}
      speaking={speakingUserIds.has(tile.userId)}
      width={size.width}
      height={size.height}
      focused={tile.key === focused?.key}
      compact={compact}
      onClick={() => dispatch({ type: 'click', key: tile.key, hasVideo: tile.hasVideo })}
    />
  );

  let content: ReactNode = null;
  if (box.width > 0 && box.height > 0) {
    if (focused) {
      const layout = focusLayout(box.width, box.height, GAP, others.length > 0);
      content = (
        <div className="flex h-full w-full flex-col" style={{ gap: GAP }}>
          <div className="flex min-h-0 flex-1 items-center justify-center">{renderTile(focused, layout.main)}</div>
          {others.length > 0 && (
            <div className="flex-none overflow-x-auto overflow-y-hidden" style={{ height: STRIP_HEIGHT }}>
              <div className="mx-auto flex w-max items-start gap-2 p-1">
                {others.map((tile) => renderTile(tile, layout.thumb, true))}
              </div>
            </div>
          )}
        </div>
      );
    } else {
      const layout = gridLayout(tiles.length, box.width, box.height, GAP);
      const rows: VoiceTileModel[][] = [];
      for (let i = 0; i < tiles.length; i += layout.cols) rows.push(tiles.slice(i, i + layout.cols));
      content = (
        <div className="flex h-full w-full flex-col items-center justify-center" style={{ gap: GAP }}>
          {rows.map((row, i) => (
            // Linha final incompleta fica centralizada.
            <div key={i} className="flex justify-center" style={{ gap: GAP }}>
              {row.map((tile) => renderTile(tile, { width: layout.tileWidth, height: layout.tileHeight }))}
            </div>
          ))}
        </div>
      );
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" style={{ background: 'var(--agree-chat-bg)' }}>
      <div ref={boxRef} className="min-h-0 flex-1 overflow-hidden p-4">
        {content}
      </div>
    </div>
  );
}
