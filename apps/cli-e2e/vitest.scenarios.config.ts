import { defineConfig } from 'vitest/config';

/**
 * The CLI's end-to-end suites: the built binary, `tau serve`, `tau mcp` and `tau agent` spawned against real kernels.
 * Named so the Nx Vitest plugin infers no `test` target: they run through `cli-e2e:test:scenarios` in their own CI
 * lane, not in the affected test shards.
 */
export default defineConfig({
  root: import.meta.dirname,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    /*
     * The dist-smoke test spawns the built CLI against the real birdhouse fixture; the cold path includes WASM init
     * for the replicad kernel. 60s gives plenty of headroom on slow CI runners.
     */
    testTimeout: 60_000,
    // On GitHub Actions a failure also becomes a check-run annotation, readable without the job log.
    reporters: process.env['GITHUB_ACTIONS'] === 'true' ? ['verbose', 'github-actions'] : ['verbose'],
  },
});
