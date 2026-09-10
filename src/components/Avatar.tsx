import { useState } from 'react';

const AVATAR_COLORS = [
  "var(--agree-accent)",
  "var(--agree-accent-600)",
  "var(--agree-neutral-500)",
  "var(--agree-neutral-600)",
];

/** Deterministically picks one of `AVATAR_COLORS` from a seed string. */
function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/** Up to two uppercase initials from a name (splits on `.`, `_`, whitespace). */
export function initialsOf(name: string): string {
  const parts = name.split(/[._\s]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Renders `avatarUrl` when given and loadable, else a colored initials circle from `seed`. */
export function Avatar({
  seed,
  avatarUrl,
  size = 36,
  className = "",
}: {
  seed: string;
  /** `''`, `null` and `undefined` all mean "no picture" — e.g. messages sent before `senderAvatarUrl` was populated. */
  avatarUrl?: string | null;
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}) {
  // Remembers *which* URL failed, not just that one did, so a new URL on the
  // same instance (a cache revalidation, a changed picture) gets its own try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(avatarUrl) && avatarUrl !== failedUrl;

  if (showImage) {
    return (
      <img
        src={avatarUrl!}
        alt={seed}
        width={size}
        height={size}
        onError={() => setFailedUrl(avatarUrl!)}
        className={`flex-none rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: hashColor(seed),
      }}
    >
      {initialsOf(seed)}
    </div>
  );
}
