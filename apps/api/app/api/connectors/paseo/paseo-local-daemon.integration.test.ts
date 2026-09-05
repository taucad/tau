import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const integrationEnabled = process.env['RUN_PASEO_CONNECTOR_INTEGRATION'] === '1';
const execFileAsync = promisify(execFile);

describe.skipIf(!integrationEnabled)('Paseo API connector with the upstream local daemon', () => {
  it('passes the public SDK lifecycle contract against the unmodified daemon fake provider', async () => {
    const checkout = fileURLToPath(new URL('../../../../../../repos/paseo/', import.meta.url));
    const result = await execFileAsync(
      'pnpm',
      [
        '--dir',
        checkout,
        'exec',
        'vitest',
        'run',
        'packages/server/src/server/public-client-sdk.e2e.test.ts',
        '--maxWorkers=1',
      ],
      { timeout: 90_000 },
    );
    expect(result.stderr).not.toContain('FAIL');
    expect(result.stdout).toContain('1 passed');
  }, 100_000);
});
