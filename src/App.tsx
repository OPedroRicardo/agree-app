import { Routes, Route } from 'react-router';
import { LoginPage } from '@/pages/Login';
import { HomePage } from '@/pages/Home';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
