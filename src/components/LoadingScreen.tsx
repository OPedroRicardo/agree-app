/**
 * Full-screen "Carregando…" placeholder shared by both routes: shown while
 * `AuthProvider` resolves the stored token on first load, and during the
 * brief window between a `router.replace()` call and the destination route
 * actually mounting.
 */
export function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg text-[13px] text-neutral-500">
      Carregando…
    </div>
  );
}
