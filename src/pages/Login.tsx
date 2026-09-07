import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/auth-context';
import { LoginScreen } from '@/components/LoginScreen';
import { LoadingScreen } from '@/components/LoadingScreen';

/** Public route (`/login`). Renders {@link LoginScreen} when signed-out, else redirects to `/`. */
export function LoginPage() {
  const { state } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (state.status === 'signed-in') navigate('/', { replace: true });
  }, [state.status, navigate]);

  if (state.status === 'loading' || state.status === 'signed-in') {
    return <LoadingScreen />;
  }

  return <LoginScreen notice={state.notice} />;
}
