import { Routes, Route } from 'react-router';
import { useAuth } from '@/lib/auth-context';
import { ReconnectingScreen } from '@/components/ReconnectingScreen';
import { LoginPage } from '@/pages/Login';
import { HomePage } from '@/pages/Home';

export default function App() {
  const { state } = useAuth();

  if (state.status === 'unreachable') return <ReconnectingScreen />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
