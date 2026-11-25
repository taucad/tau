import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

/**
 * Copies the assets `copy-files-from-to.cjson` declares before the suite runs.
 *
 * The kernel reads `src/sourcemaps/replicad.js.map` and `src/fonts/Geist-Regular.ttf`, which are generated and
 * ignored by git. Nx's `test` target copies them first (`copy-assets`), but `vitest` started directly in a fresh
 * checkout would run without them, and source-mapped stack frames would fall back to the compiled library paths.
 */
export default function copyAssets(): void {
  const cli = createRequire(import.meta.url).resolve('copy-files-from-to');
  execFileSync(process.execPath, [cli, '--when-file-exists', 'overwrite', '--silent'], {
    cwd: import.meta.dirname,
    stdio: 'inherit',
  });
}
