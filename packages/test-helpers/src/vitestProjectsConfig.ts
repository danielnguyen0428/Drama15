/**
 * Shared vitest project configuration.
 *
 * Downstream packages (`apps/api`, `apps/web`, `apps/admin`) extend their
 * `vitest.config.ts` with these projects so that:
 *
 *   - `vitest run --project unit`     → runs `*.test.ts` / `*.test.tsx`
 *   - `vitest run --project property` → runs `*.property.test.ts` only
 *
 * Property tests live next to their unit counterparts and use the
 * `*.property.test.ts` suffix so the property project can pick them up
 * without collecting the rest of the suite.
 */

export interface VitestProjectConfig {
  test: {
    name: string;
    environment?: 'node' | 'jsdom' | 'happy-dom' | 'edge-runtime';
    include: string[];
    exclude?: string[];
    setupFiles?: string[];
  };
}

/**
 * Default unit + property projects. Spread these into a `defineConfig({...})`
 * `test.projects` array to wire them in.
 */
export const vitestProjects: readonly VitestProjectConfig[] = [
  {
    test: {
      name: 'unit',
      environment: 'node',
      include: ['**/*.test.ts', '**/*.test.tsx'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.property.test.ts']
    }
  },
  {
    test: {
      name: 'property',
      environment: 'node',
      include: ['**/*.property.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**']
    }
  }
];
