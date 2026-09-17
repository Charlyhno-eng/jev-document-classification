import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    watch: { ignored: ['**/config/config.toml'] },
    proxy: { '/api': 'http://localhost:8787' },
  },
});
