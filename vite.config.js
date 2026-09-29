import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  // VITE_* as usual; NEXT_PUBLIC_* too, so the Supabase integration of v0 / Vercel works as it is
  // (it sets NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY). Only public values use these prefixes.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  worker: { format: 'es' },
  // v0 / shadcn import paths: `@/components/…`, `@/lib/utils`
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Dev server only: let v0 / Vercel sandboxes open the preview (hosts like sb-….vercel.run).
  server: { allowedHosts: ['.vercel.run', '.vusercontent.net', '.v0.app', '.v0.dev'] },
  preview: { allowedHosts: ['.vercel.run', '.vusercontent.net', '.v0.app', '.v0.dev'] },
});
