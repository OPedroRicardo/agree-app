import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    strictPort: true,
    watch: {
      // Evita EBUSY no Windows: o `cargo run` do Tauri escreve/trava esse
      // binário durante a compilação, e o watcher do Vite não precisa dele.
      ignored: ['**/src-tauri/**'],
    },
  },
});
