import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Admin_Console SPA must run on a separate origin from the Web_Client (Requirement 16.1).
// Web_Client uses the default Vite port (5173); the admin console intentionally uses 5174
// so dev environments expose a distinct origin and TOTP-gated entry point.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
  },
});
