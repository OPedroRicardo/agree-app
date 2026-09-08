/**
 * Efeitos sonoros curtos de voz (entrar/sair da chamada, alguém entrar/sair,
 * mutar/desmutar), sintetizados com Web Audio — sem depender de arquivo de
 * áudio embutido. Toca num `AudioContext` próprio, independente do pipeline
 * de chamada em `VoiceClient` (que pode já ter sido derrubado quando o som
 * de "saiu" precisa tocar).
 */

type VoiceSoundKind = 'join-self' | 'leave-self' | 'peer-join' | 'peer-leave' | 'mute' | 'unmute';

type Step = { freq: number; offset: number; duration: number; gain: number };

const PATTERNS: Record<VoiceSoundKind, Step[]> = {
  'join-self': [
    { freq: 440, offset: 0, duration: 0.09, gain: 0.18 },
    { freq: 660, offset: 0.09, duration: 0.12, gain: 0.18 },
  ],
  'leave-self': [
    { freq: 660, offset: 0, duration: 0.09, gain: 0.18 },
    { freq: 392, offset: 0.09, duration: 0.14, gain: 0.18 },
  ],
  'peer-join': [{ freq: 880, offset: 0, duration: 0.07, gain: 0.11 }],
  'peer-leave': [{ freq: 330, offset: 0, duration: 0.09, gain: 0.11 }],
  mute: [{ freq: 392, offset: 0, duration: 0.06, gain: 0.14 }],
  unmute: [{ freq: 523, offset: 0, duration: 0.06, gain: 0.14 }],
};

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Um tom senoidal com envelope curto de ataque/liberação, pra não estalar. */
function scheduleTone(audioCtx: AudioContext, step: Step, startAt: number) {
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = step.freq;

  const gainNode = audioCtx.createGain();
  osc.connect(gainNode).connect(audioCtx.destination);

  const attack = 0.01;
  const release = Math.min(0.05, step.duration * 0.4);
  gainNode.gain.setValueAtTime(0, startAt);
  gainNode.gain.linearRampToValueAtTime(step.gain, startAt + attack);
  gainNode.gain.setValueAtTime(step.gain, startAt + step.duration - release);
  gainNode.gain.linearRampToValueAtTime(0, startAt + step.duration);

  osc.start(startAt);
  osc.stop(startAt + step.duration + 0.02);
}

/**
 * Toca `kind`. Best-effort: se o `AudioContext` estiver suspenso por
 * política de autoplay (sem gesto do usuário ainda) ou a API não existir,
 * falha em silêncio — um som que não toca não é motivo pra interromper o
 * fluxo de voz.
 */
export function playVoiceSound(kind: VoiceSoundKind) {
  try {
    const audioCtx = getCtx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const now = audioCtx.currentTime;
    for (const step of PATTERNS[kind]) scheduleTone(audioCtx, step, now + step.offset);
  } catch {
    // Sem áudio disponível (política de autoplay, navegador sem suporte) — ignora.
  }
}
