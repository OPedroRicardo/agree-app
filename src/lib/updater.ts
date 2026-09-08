import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

// Checa updates no GitHub Releases (endpoint configurado em src-tauri/tauri.conf.json)
// e instala silenciosamente em background; só reinicia quando o download termina.
export async function checkForUpdatesAndInstall(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    console.error('Falha ao checar/instalar atualização', err);
  }
}
