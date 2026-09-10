const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Below this a message just reads "agora" — a ticking seconds counter is noise. */
const JUST_NOW = 45_000;
/** How often live timestamps re-render. Minute granularity, so 30s caps the lag at half a unit. */
const TICK_MS = 30_000;

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fullFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' });

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface FormattedTimestamp {
  text: string;
  /** Full date/time, for the tooltip. */
  title: string;
  /** Relative text that goes stale as time passes — only these need the clock. */
  live: boolean;
}

/**
 * Relative while the message is from today ("agora", "há 5 minutos",
 * "há 3 horas"), then absolute: "Ontem às 12:05" and "10/09/2026 às 12:05".
 * Absolute texts are never refreshed, so one rendered as "Ontem" stays that
 * way past midnight — accepted, since it only happens with the app open.
 */
export function formatTimestamp(iso: string, now: number): FormattedTimestamp {
  const date = new Date(iso);
  const ms = date.getTime();
  const title = fullFmt.format(date);
  // Clamped: a server clock slightly ahead of ours would otherwise read "em 1 minuto".
  const diff = Math.max(0, now - ms);
  const today = startOfDay(now);

  if (diff < JUST_NOW) return { text: rtf.format(0, 'second'), title, live: true };
  if (diff < HOUR) {
    return { text: rtf.format(-Math.max(1, Math.floor(diff / MINUTE)), 'minute'), title, live: true };
  }
  if (ms >= today) return { text: rtf.format(-Math.floor(diff / HOUR), 'hour'), title, live: true };

  const time = timeFmt.format(date);
  // today - 1ms lands inside yesterday; startOfDay absorbs DST-length days.
  if (ms >= startOfDay(today - 1)) return { text: `Ontem às ${time}`, title, live: false };
  return { text: `${dateFmt.format(date)} às ${time}`, title, live: false };
}

// One interval shared by every live timestamp, running only while at least one
// is mounted. The snapshot is a tick counter, not the time: consumers read
// Date.now() while rendering, so a timestamp mounted while the clock is idle
// never renders against a stale value.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let tick = 0;

export function subscribeClock(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    tick++;
    listeners.forEach((l) => l());
  }, TICK_MS);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function getClockTick(): number {
  return tick;
}
