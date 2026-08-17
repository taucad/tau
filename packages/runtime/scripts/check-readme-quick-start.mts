import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const quickStart = /## Quick start\s+[\s\S]*?```typescript\n(?<source>[\s\S]*?)\n```/u.exec(readme)?.groups?.['source'];

if (!quickStart) {
  throw new Error('Runtime README must contain a TypeScript fence under `## Quick start`.');
}

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const sampleDirectory = mkdtempSync(join(packageRoot, '.readme-quick-start-'));
const samplePath = join(sampleDirectory, 'sample.mts');
let status: number | undefined;

try {
  writeFileSync(samplePath, quickStart);
  status =
    spawnSync(process.execPath, ['--import', 'tsx', samplePath], {
      cwd: packageRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    }).status ?? undefined;
} finally {
  rmSync(sampleDirectory, { recursive: true, force: true });
}

if (status !== 0) {
  throw new Error(`Runtime README quick start exited with status ${status ?? 'unknown'}.`);
}
