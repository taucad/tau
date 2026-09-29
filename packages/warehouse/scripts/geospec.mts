/* oxlint-disable eslint/no-await-in-loop -- Process one project at a time to bound native memory and preserve deterministic corpus ordering. */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packageRoot, readDefinitions } from '#scripts/definitions.js';

const arguments_ = process.argv.slice(2);
const fileIndex = arguments_.indexOf('--file');
const selectedFile = fileIndex === -1 ? undefined : arguments_[fileIndex + 1];
const only = arguments_.find((argument) => argument.startsWith('--only='))?.slice(7);
const reportRoot = join(packageRoot, '../../out/reports/warehouse');
await mkdir(reportRoot, { recursive: true });
let failed = 0;
let selected = 0;
for (const { part } of await readDefinitions()) {
  if (
    (selectedFile !== undefined && !selectedFile.startsWith(part.id + '/')) ||
    (only !== undefined && !only.split(',').includes(part.id))
  ) {
    continue;
  }
  selected++;
  const forwarded = selectedFile ? ['--file', selectedFile.slice(part.id.length + 1)] : [];
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-vm-modules',
      '--import',
      'tsx',
      join(packageRoot, '../geospec-engine/src/cli/main.ts'),
      'run',
      join(packageRoot, 'parts', part.id),
      ...forwarded,
      '--json',
    ],
    { cwd: packageRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  await writeFile(join(reportRoot, `${part.id}.json`), result.stdout);
  if (result.status === 0) {
    console.log(`PASS ${part.id}`);
  } else {
    failed++;
    console.error(`FAIL ${part.id}: ${result.stderr}\n${result.stdout}`);
  }
}
if (selected === 0) {
  throw new Error('No warehouse projects matched the selection.');
}
process.exitCode = failed ? 1 : 0;

/* oxlint-enable eslint/no-await-in-loop */
