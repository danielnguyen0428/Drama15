/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator';

const DEV_API_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://10.5.0.2:3001',
  'http://192.168.50.14:3001',
  'http://192.168.56.1:3001',
].join(' ');
const DEV_API_PROXY_ORIGIN = 'http://127.0.0.1:3001';
const API_GATEWAY_ORIGIN_PLACEHOLDER = '<API_GATEWAY_ORIGIN>';

// https://vitejs.dev/config/
//
// Production build emits a minified AND obfuscated bundle to satisfy
// Requirement 13.1 ("THE Web_Client SHALL be built minified and obfuscated
// before deployment").
//
// The obfuscator is intentionally limited to production builds. During
// `vite dev` and `vitest`, source remains readable so debugging and tests
// run at full speed.
export default defineConfig(({ command, mode }) => {
  const isProdBuild = command === 'build' && mode === 'production';

  return {
    plugins: [
      {
        name: 'drama15-csp-api-origin',
        transformIndexHtml(html) {
          const apiOrigins = command === 'serve'
            ? DEV_API_ORIGINS
            : (process.env.VITE_API_URL || 'https://api.vibify.work');
          return html.replaceAll(API_GATEWAY_ORIGIN_PLACEHOLDER, apiOrigins);
        },
      },
      react(),
      ...(isProdBuild
        ? [
            obfuscatorPlugin({
              // Match all source modules (the plugin's default matcher
              // covers .ts/.tsx/.js/.jsx/.mjs/.cjs). `enforce: 'post'`
              // (set inside the plugin) ensures we run after JSX/TS
              // have been transformed to JS, so what we obfuscate is the
              // emitted bundle code.
              exclude: [/node_modules/, /\.nuxt/],
              apply: 'build',
              debugger: false,
              options: {
                compact: true,
                controlFlowFlattening: true,
                controlFlowFlatteningThreshold: 0.5,
                deadCodeInjection: false,
                stringArray: true,
                stringArrayThreshold: 0.5,
                simplify: true,
                target: 'browser',
              },
            }),
          ]
        : []),
    ],
    server: {
      port: 5174,
      strictPort: false,
      proxy: {
        '/auth/oauth': {
          target: DEV_API_PROXY_ORIGIN,
          changeOrigin: true,
        },
        '/stories': {
          target: DEV_API_PROXY_ORIGIN,
          changeOrigin: true,
        },
        '/story': {
          target: DEV_API_PROXY_ORIGIN,
          changeOrigin: true,
        },
        '/voices': {
          target: DEV_API_PROXY_ORIGIN,
          changeOrigin: true,
        },
        '/automation': {
          target: DEV_API_PROXY_ORIGIN,
          changeOrigin: true,
        },
        '/admin': {
          target: DEV_API_PROXY_ORIGIN,
          changeOrigin: true,
        },
        '/export': {
          target: DEV_API_PROXY_ORIGIN,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
    build: {
      target: 'es2022',
      minify: 'esbuild',
      sourcemap: false,
      outDir: 'dist',
      emptyOutDir: true,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/setupTests.ts'],
      css: false,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  };
});
