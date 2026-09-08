import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { isTauri } from '@tauri-apps/api/core';
import { AuthProvider } from '@/lib/auth-context';
import { applyStoredTheme } from '@/lib/theme';
import { checkForUpdatesAndInstall } from '@/lib/updater';
import App from './App';
import './index.css';

applyStoredTheme();

// A janela do Tauri é transparente com Mica/Acrylic (ver `src-tauri/src/lib.rs`) —
// sem isso o `body` opaco cobriria o vidro do SO atrás das superfícies translúcidas.
// No navegador (`vite dev`) não há janela transparente, então mantemos o fundo sólido.
if (isTauri()) {
  document.documentElement.classList.add('tauri');
  void checkForUpdatesAndInstall();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
