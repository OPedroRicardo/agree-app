import type { SimulcastRid, VideoProfileName, VoiceContentHint, VoiceTrackSource } from './types';

/**
 * Helpers puros do modo SFU — ver "Fase 2 — SFU" em `docs/voice-client.md`.
 * Nada aqui guarda estado: o `VoiceClient` e a UI (`voice-layout.ts`) usam as
 * mesmas regras.
 */

/**
 * Codecs que andam junto de um codec primário (retransmissão, redundância,
 * FEC). O servidor tolera esses na offer; qualquer outro primário além do
 * permitido faz o publish ser recusado.
 */
const AUX_CODECS = ['rtx', 'red', 'ulpfec', 'flexfec-03'];

/**
 * Restringe a offer do transceiver a `allowed` (+ auxiliares) via
 * `setCodecPreferences`. Sem isso o browser oferece VP9/H264/AV1 junto do VP8
 * e o servidor recusa o publish ("must offer only VP8").
 */
export function restrictCodecs(
  transceiver: RTCRtpTransceiver,
  kind: 'audio' | 'video',
  allowed: string[],
) {
  const ok = allowed.map((c) => c.toLowerCase());
  const codecs = RTCRtpReceiver.getCapabilities(kind)?.codecs.filter((c) => {
    const name = c.mimeType.split('/')[1]?.toLowerCase() ?? '';
    return ok.includes(name) || AUX_CODECS.includes(name);
  });
  if (codecs?.length) transceiver.setCodecPreferences(codecs);
}

/** A ladder de simulcast que uma fonte de vídeo codifica — mesma regra do `profileFor` do backend. */
export function profileFor(source: 'camera' | 'screen', hint?: VoiceContentHint | null): VideoProfileName {
  if (source === 'camera') return 'camera';
  return hint === 'motion' ? 'screenMotion' : 'screenDetail';
}

const RID_ORDER: SimulcastRid[] = ['f', 'h', 'q'];

/**
 * A camada de `rids` mais próxima de `wanted` — o servidor recusa um
 * `preferredRid` que a track não tem (ex.: `q` num screenshare `detail`, que
 * só tem `f;h`). Num empate fica a mais barata: é egress que o servidor paga.
 */
export function clampRid(wanted: SimulcastRid, rids: SimulcastRid[]): SimulcastRid | undefined {
  if (rids.includes(wanted)) return wanted;
  const target = RID_ORDER.indexOf(wanted);
  let best: SimulcastRid | undefined;
  let bestDistance = Infinity;
  for (const rid of rids) {
    const distance = Math.abs(RID_ORDER.indexOf(rid) - target);
    if (distance < bestDistance || (distance === bestDistance && best && RID_ORDER.indexOf(rid) > RID_ORDER.indexOf(best))) {
      best = rid;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * `getDisplayMedia` existe neste runtime? Não existe no WebKitGTK (Linux) nem
 * em WKWebView antigo — aí o botão de compartilhar tela nem aparece.
 */
export function canShareScreen(): boolean {
  return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

/** Chave de uma track de um participante (`<userId>:<source>`) — de stream, de `<audio>` e de tile. */
export function trackKey(userId: string, source: VoiceTrackSource): string {
  return `${userId}:${source}`;
}
