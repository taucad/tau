import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  plugins: [nxViteTsPaths()],
  test: {
    environment: 'node',
    // Vitest's typecheck uses TypeScript 5.9.3, which crashes (TS internal bug in
    // `chooseOverload` → `getTypeListId`) above a critical mass of generic call
    // expressions combined with our typed `Channel<P>` / `ChannelServer<P>` surface.
    // The authoritative typecheck pipeline runs via `tsgo` under
    // `pnpm nx typecheck rpc`, which reads the same tsconfig.spec.json and
    // includes every `*.test-d.ts` file, so type-level assertions remain enforced.
    typecheck: {
      enabled: false,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.spec.json',
      ignoreSourceErrors: true,
    },
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../out/reports/coverage/libs/rpc',
      include: ['src/**/*'],
      exclude: ['src/**/*.{test,spec,test-d}.ts', 'src/index.ts'],
      // V8: optional chains and branch coverage on the wire handler; keep a high floor.
      // Functions threshold is 90 because the close controller registers several defensive
      // no-op closures (e.g. unsubscribe handles returned for late onClose registrations,
      // initial-listen onAbort placeholder before a signal binds) that are intentionally
      // never invoked by the tested code paths but document the contract.
      thresholds: {
        lines: 98,
        statements: 97,
        branches: 88,
        functions: 90,
      },
    },
  },
});
