import { FormEvent, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

/**
 * Login form rendered by the `/login` route. Calls `signIn` from
 * {@link useAuth} and distinguishes a bad-credentials `ApiError` from a
 * network/connectivity failure so the message tells the user which one
 * happened. `notice` (e.g. "session expired") renders above the form.
 */
export function LoginScreen({ notice }: { notice?: string | null }) {
  const { signIn } = useAuth();
  const [emailValue, setEmailValue] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(emailValue.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'Credenciais inválidas.'
          : 'Não foi possível conectar ao backend do Agree.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative flex h-screen w-full items-center justify-center overflow-hidden p-5"
      style={{
        background:
          'linear-gradient(160deg, color-mix(in srgb, var(--agree-bg) 92%, black), var(--agree-bg) 55%, color-mix(in srgb, var(--agree-bg) 88%, white))',
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-95 flex-col gap-4.5 rounded-2xl p-8"
        style={{
          background: 'color-mix(in srgb, var(--agree-surface) 55%, transparent)',
          backdropFilter: 'blur(24px) saturate(160%)',
          animation: 'agree-fade-scale 0.45s ease both',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="h-8.5 w-8.5 flex-none rounded-md bg-accent" />
          <div className="text-[19px] font-semibold">Agree</div>
        </div>

        <div>
          <div className="mb-1 text-[22px] font-semibold">Entrar</div>
          <div className="text-[13px] text-neutral-400">
            Liberdade ao VoIP.
          </div>
        </div>

        {notice && (
          <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[12px] text-accent">
            {notice}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] text-neutral-400">E-mail ou usuário</label>
          <input
            type="text"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            placeholder="jhon@doe.com"
            className="min-h-9 rounded-md border border-divider bg-surface/60 px-2.5 py-1.5 text-[14px] outline-none focus-visible:border-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] text-neutral-400">Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="min-h-9 rounded-md border border-divider bg-surface/60 px-2.5 py-1.5 text-[14px] outline-none focus-visible:border-accent"
          />
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="mt-0.5 w-full rounded-md border border-accent px-4 py-2 text-[14px] font-medium text-accent transition hover:bg-accent/10 active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
