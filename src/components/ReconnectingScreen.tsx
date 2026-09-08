import { WifiOff } from 'lucide-react';

/** Full-screen state for `AuthState.status === 'unreachable'` — shown app-wide until `GET /health` answers again. */
export function ReconnectingScreen() {
  return (
    <div
      className="relative flex h-screen w-full items-center justify-center overflow-hidden p-5"
      style={{
        background:
          'linear-gradient(160deg, color-mix(in srgb, var(--agree-bg) 92%, black), var(--agree-bg) 55%, color-mix(in srgb, var(--agree-bg) 88%, white))',
      }}
    >
      <div
        className="flex w-[340px] flex-col items-center gap-4 rounded-2xl p-8 text-center"
        style={{
          background: 'color-mix(in srgb, var(--agree-surface) 55%, transparent)',
          backdropFilter: 'blur(24px) saturate(160%)',
          animation: 'agree-fade-scale 0.45s ease both',
        }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-accent"
          style={{
            background: 'color-mix(in srgb, var(--agree-accent) 15%, transparent)',
            animation: 'agree-pulse 2s ease-in-out infinite',
          }}
        >
          <WifiOff size={24} />
        </div>

        <div>
          <div className="mb-1 text-[16px] font-semibold">Reconectando…</div>
          <div className="text-[13px] text-neutral-400">
            Não foi possível falar com o servidor do Agree. Tentando de novo automaticamente.
          </div>
        </div>

        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full bg-accent"
              style={{ animation: `agree-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
