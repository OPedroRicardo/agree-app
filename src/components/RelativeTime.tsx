import { useSyncExternalStore } from 'react';
import { formatTimestamp, getClockTick, subscribeClock } from '@/lib/relative-time';

const idle = () => () => {};

/**
 * A message timestamp — relative while recent, absolute once older (see
 * `formatTimestamp`). Only relative ones subscribe to the shared clock; when a
 * tick turns one absolute (e.g. past midnight) it unsubscribes itself.
 */
export function RelativeTime({ iso, className = '' }: { iso: string; className?: string }) {
  const { text, title, live } = formatTimestamp(iso, Date.now());
  useSyncExternalStore(live ? subscribeClock : idle, getClockTick);

  return (
    <time dateTime={iso} title={title} className={className}>
      {text}
    </time>
  );
}
