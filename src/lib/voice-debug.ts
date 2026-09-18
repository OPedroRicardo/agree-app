/**
 * Diagnóstico do modo SFU no console — tudo com o prefixo `[voice:sfu]`.
 * Liga sozinho em dev (`npm run dev` / `npm run tauri dev`); num build, com
 * `localStorage.setItem('agree:voice-debug', '1')` e recarregar. Nunca loga o
 * SDP inteiro, só o resumo de {@link describeSdp}.
 */

function flagFromStorage(): boolean {
  try {
    return localStorage.getItem('agree:voice-debug') === '1';
  } catch {
    return false;
  }
}

export const SFU_DEBUG = import.meta.env.DEV || flagFromStorage();

export function sfuLog(...args: unknown[]) {
  if (SFU_DEBUG) console.log('[voice:sfu]', ...args);
}

/**
 * Resumo de uma descrição, no mesmo formato do log do backend:
 * `bundle=[0 1] 0:audio:sendonly[1=audio-level 4=mid] 1:video:inactive:rejected[…]`.
 * `rejected` = porta 0 (m-section de um transceiver parado). O primeiro mid do
 * BUNDLE é o que ancora o transporte compartilhado. Entre colchetes, os
 * `a=extmap` da m-section (id=uri, uri encurtada no último segmento) — é o
 * que o Chrome exige consistente entre m-sections do BUNDLE e estável por mid.
 */
export function describeSdp(sdp: string | null | undefined): string {
  if (!sdp) return '(sem sdp)';
  const lines = sdp.split(/\r?\n/);
  const bundle = lines.find((l) => l.startsWith('a=group:BUNDLE'))?.slice('a=group:BUNDLE'.length).trim() ?? '';

  const sections: string[] = [];
  let current: { kind: string; port: string; mid: string; direction: string; extmap: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const rejected = current.port === '0' ? ':rejected' : '';
    sections.push(`${current.mid}:${current.kind}:${current.direction}${rejected}[${current.extmap.join(' ')}]`);
  };
  for (const line of lines) {
    if (line.startsWith('m=')) {
      flush();
      const [kind, port] = line.slice(2).split(' ');
      current = { kind, port, mid: '?', direction: '?', extmap: [] };
    } else if (current && line.startsWith('a=mid:')) {
      current.mid = line.slice(6);
    } else if (current && /^a=(sendrecv|sendonly|recvonly|inactive)$/.test(line)) {
      current.direction = line.slice(2);
    } else if (current) {
      const ext = /^a=extmap:(\d+)(?:\/\w+)? (\S+)/.exec(line);
      if (ext) current.extmap.push(`${ext[1]}=${ext[2].split(/[:/]/).pop()}`);
    }
  }
  flush();

  return `bundle=[${bundle}] ${sections.join(' ')}`;
}

/** O que já está negociado no PC (local + remoto atuais) — pra comparar com a offer que falhou. */
export function describeNegotiated(pc: RTCPeerConnection): { local: string; remote: string } {
  return {
    local: describeSdp(pc.currentLocalDescription?.sdp),
    remote: describeSdp(pc.currentRemoteDescription?.sdp),
  };
}

/** `mid:kind:direction/currentDirection` de cada transceiver do PC, na ordem das m-sections. */
export function describeTransceivers(pc: RTCPeerConnection): string {
  return pc
    .getTransceivers()
    .map((t) => `${t.mid ?? '∅'}:${t.receiver.track.kind}:${t.direction}/${t.currentDirection ?? '∅'}`)
    .join(' ');
}

const STATS_INTERVAL_MS = 3_000;

/**
 * A cada 3 s, quantos bytes de áudio/vídeo saíram e chegaram por mid desde a
 * última amostra, mais o estado do transporte (ICE/DTLS). É o que prova se a
 * voz parou de fluir, em que sentido e a partir de quando. Devolve o `stop`.
 */
export function watchSfuStats(pc: RTCPeerConnection): () => void {
  if (!SFU_DEBUG) return () => undefined;

  const last = new Map<string, number>();
  const timer = setInterval(() => {
    void pc
      .getStats()
      .then((report) => {
        const out: string[] = [];
        const inn: string[] = [];
        let transport = '';
        report.forEach((s) => {
          if (s.type === 'outbound-rtp' || s.type === 'inbound-rtp') {
            const bytes: number = s.type === 'outbound-rtp' ? s.bytesSent : s.bytesReceived;
            const id = `${s.type}:${s.mid ?? s.id}:${s.rid ?? ''}`;
            const delta = bytes - (last.get(id) ?? bytes);
            last.set(id, bytes);
            const label = `${s.mid ?? '?'}${s.rid ? `/${s.rid}` : ''}:${s.kind}+${(delta / 1024).toFixed(1)}KB`;
            (s.type === 'outbound-rtp' ? out : inn).push(label);
          } else if (s.type === 'transport') {
            transport = `ice=${s.iceState ?? '?'} dtls=${s.dtlsState ?? '?'}`;
          }
        });
        sfuLog(`stats ${transport} | out ${out.join(' ') || '-'} | in ${inn.join(' ') || '-'}`);
      })
      .catch(() => undefined);
  }, STATS_INTERVAL_MS);

  return () => clearInterval(timer);
}
