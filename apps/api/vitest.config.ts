import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.property.test.ts', 'src/**/*.unit.test.ts', 'src/**/*.integration.test.ts', 'src/**/*.test.ts'],
    reporters: 'default',
    clearMocks: true,
    globals: false
  }
});
