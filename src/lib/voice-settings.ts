/**
 * Preferências de voz do usuário: dispositivo de entrada/saída, ganho do
 * microfone, volume de saída, sensibilidade de ativação por voz e os toggles
 * de processamento de áudio do `getUserMedia`. Persistido em `localStorage`
 * (mesmo padrão de `theme.ts`) e replicado num pub/sub simples — a modal de
 * Configurações e o `VoiceClient` (que precisa reagir a mudanças em tempo
 * real, mesmo em chamada) leem/escrevem o mesmo estado.
 */

const STORAGE_KEY = 'agree:voice-settings';

export type VoiceSettings = {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  /** Ganho aplicado ao microfone antes de sair pro `RTCPeerConnection`, em %. 100 = sem alteração. */
  inputVolumePct: number;
  /** Volume aplicado aos `<audio>` remotos, em %. 100 = sem alteração. */
  outputVolumePct: number;
  /** Limiar de ativação por voz, em dBFS (negativo; mais perto de 0 = mais sensível). */
  sensitivityDb: number;
  /** `false` = microfone sempre aberto (sem gate por sensibilidade), só o mute manual silencia. */
  voiceActivityEnabled: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  inputDeviceId: null,
  outputDeviceId: null,
  inputVolumePct: 100,
  outputVolumePct: 100,
  sensitivityDb: -50,
  voiceActivityEnabled: true,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

let current: VoiceSettings = readFromStorage();
const listeners = new Set<(settings: VoiceSettings) => void>();

function readFromStorage(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    return { ...DEFAULT_VOICE_SETTINGS, ...(JSON.parse(raw) as Partial<VoiceSettings>) };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function getVoiceSettings(): VoiceSettings {
  return current;
}

/** Aplica um patch parcial, persiste e notifica quem chamou {@link subscribeVoiceSettings}. */
export function setVoiceSettings(patch: Partial<VoiceSettings>) {
  current = { ...current, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  for (const listener of listeners) listener(current);
}

export function resetVoiceSettings() {
  current = { ...DEFAULT_VOICE_SETTINGS };
  localStorage.removeItem(STORAGE_KEY);
  for (const listener of listeners) listener(current);
}

/** Chama `listener` imediatamente e depois a cada {@link setVoiceSettings}. Retorna a função de unsubscribe. */
export function subscribeVoiceSettings(listener: (settings: VoiceSettings) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export type MediaDeviceOption = {
  deviceId: string;
  label: string;
};

/**
 * Lista os dispositivos de áudio disponíveis. Precisa de uma permissão de
 * mídia já concedida para trazer `label` preenchido — sem isso o browser
 * devolve os devices mas com rótulo vazio, daí o fallback numerado.
 */
export async function listAudioDevices(
  kind: 'audioinput' | 'audiooutput',
): Promise<MediaDeviceOption[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === kind)
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `${kind === 'audioinput' ? 'Microfone' : 'Saída de áudio'} ${i + 1}`,
    }));
}

/** `true` se o browser suportar trocar o dispositivo de saída de um `<audio>` (`setSinkId`) — Firefox e Safari não suportam. */
export function supportsOutputDeviceSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}
