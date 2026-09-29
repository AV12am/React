import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  worker: { format: 'es' },
  // v0 / shadcn import paths: `@/components/…`, `@/lib/utils`
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Dev server only: let v0 / Vercel sandboxes open the preview (hosts like sb-….vercel.run).
  server: { allowedHosts: ['.vercel.run', '.vusercontent.net', '.v0.app', '.v0.dev'] },
  preview: { allowedHosts: ['.vercel.run', '.vusercontent.net', '.v0.app', '.v0.dev'] },
});
