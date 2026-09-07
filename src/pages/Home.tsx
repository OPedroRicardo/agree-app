import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';
import { LoadingScreen } from '@/components/LoadingScreen';

/** Protected route (`/`). Renders {@link AppShell} when signed-in, else redirects to `/login`. */
export function HomePage() {
  const { state } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (state.status === 'signed-out') navigate('/login', { replace: true });
  }, [state.status, navigate]);

  if (state.status !== 'signed-in') {
    return <LoadingScreen />;
  }

  return <AppShell />;
}
