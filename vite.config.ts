import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:8787' } },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
