'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';
import { LoadingScreen } from '@/components/LoadingScreen';

/** Protected route (`/`). Renders {@link AppShell} when signed-in, else redirects to `/login`. */
export default function Home() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'signed-out') router.replace('/login');
  }, [state.status, router]);

  if (state.status !== 'signed-in') {
    return <LoadingScreen />;
  }

  return <AppShell />;
}
