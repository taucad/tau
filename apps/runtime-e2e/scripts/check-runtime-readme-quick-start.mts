import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The gate lives here rather than in `packages/runtime` because the quick start imports
// `@taucad/replicad` and `@taucad/esbuild`, which peer-depend on the runtime — a devDependency
// back from the runtime would be a cycle. `runtime-e2e` already depends on all three.
const readme = readFileSync(new URL('../../../packages/runtime/README.md', import.meta.url), 'utf8');
const quickStart = /## Quick start\s+[\s\S]*?```typescript\n(?<source>[\s\S]*?)\n```/u.exec(readme)?.groups?.['source'];

if (!quickStart) {
  throw new Error('Runtime README must contain a TypeScript fence under `## Quick start`.');
}

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const sampleDirectory = mkdtempSync(join(projectRoot, '.readme-quick-start-'));
const samplePath = join(sampleDirectory, 'sample.mts');
let status: number | undefined;

try {
  writeFileSync(samplePath, quickStart);
  status =
    spawnSync(process.execPath, ['--import', 'tsx', samplePath], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    }).status ?? undefined;
} finally {
  rmSync(sampleDirectory, { recursive: true, force: true });
}

if (status !== 0) {
  throw new Error(`Runtime README quick start exited with status ${status ?? 'unknown'}.`);
}
