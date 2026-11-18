/**
 * Admit a qualification run's T-B22.4 recovery rows (`qualification-recovery.mts`) before its receipts are published:
 * exactly the scope's rows, each passed, all on one A and B. Reads every downloaded `desktop-route-recovery-*`
 * artifact under `out/qualification-recovery` and writes the admitted set to `out/qualification-receipts`.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
// oxlint-disable-next-line no-restricted-imports -- The installed runner's own scenario module defines its receipts.
import { assertRecoveryReceipts } from './qualification-recovery.mjs';

const scope = z.enum(['all', 'linux', 'macos', 'windows']).parse(process.env['TAU_DESKTOP_QUALIFICATION_SCOPE']);
const root = 'out/qualification-recovery';
const directories = await readdir(root).catch((error: unknown) => {
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    return [];
  }
  throw error;
});
const receipts = await Promise.all(
  directories
    .filter((name) => name.startsWith('desktop-route-recovery-'))
    .sort()
    .map(async (name) => JSON.parse(await readFile(join(root, name, 'recovery-receipt.json'), 'utf8')) as unknown),
);
const admitted = assertRecoveryReceipts(scope, receipts);
await mkdir('out/qualification-receipts', { recursive: true });
await writeFile('out/qualification-receipts/recovery-receipts.json', JSON.stringify(admitted, undefined, 2), {
  flag: 'wx',
});
console.log(`Admitted ${String(admitted.length)} T-B22.4 recovery row(s) for scope ${scope}.`);
