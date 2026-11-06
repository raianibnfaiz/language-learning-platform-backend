import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setupEnv.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/server.ts',
        'src/db/seed/run.ts',
        'src/db/seed/devUser.ts',
        'src/db/migrate.ts',
        'src/openapi/write.ts',
        'src/types/**',
      ],
      thresholds: {
        lines: 85,
        'src/core/rules/**': { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
})
