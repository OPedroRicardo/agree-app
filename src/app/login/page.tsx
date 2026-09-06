'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { LoginScreen } from '@/components/LoginScreen';
import { LoadingScreen } from '@/components/LoadingScreen';

/** Public route (`/login`). Renders {@link LoginScreen} when signed-out, else redirects to `/`. */
export default function LoginPage() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'signed-in') router.replace('/');
  }, [state.status, router]);

  if (state.status === 'loading' || state.status === 'signed-in') {
    return <LoadingScreen />;
  }

  return <LoginScreen notice={state.notice} />;
}
