import { defineConfig } from 'vitest/config';
import { vitestProjects } from './src/vitestProjectsConfig.js';

export default defineConfig({
  test: {
    projects: vitestProjects.map((p) => ({ test: { ...p.test } }))
  }
});
