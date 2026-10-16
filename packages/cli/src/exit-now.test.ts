/**
 * `exitNow` ends the process it runs in, so each case runs in its own Node child.
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const exitNowUrl = pathToFileURL(new URL('exit-now.ts', import.meta.url).pathname).href;

/**
 * Run a script that imports `exitNow` in a fresh Node.
 *
 * @param body - Statements run after the import.
 * @returns The child's exit status and its stderr.
 */
const run = (body: string): { readonly status: number | undefined; readonly stderr: string } => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', `import { exitNow } from ${JSON.stringify(exitNowUrl)};\n${body}`],
    { encoding: 'utf8', timeout: 30_000 },
  );
  return { status: result.status ?? undefined, stderr: result.stderr };
};

describe('exitNow', () => {
  it('should end the process with the given code, after its exit listeners and before anything else runs', () => {
    const { status, stderr } = run(
      [
        String.raw`process.once('exit', (code) => process.stderr.write('exit listener ' + String(code) + '\n'));`,
        'await exitNow(3);',
        String.raw`process.stderr.write('after exit\n');`,
      ].join('\n'),
    );

    expect(status).toBe(3);
    expect(stderr).toContain('exit listener 3');
    expect(stderr).not.toContain('after exit');
  });

  it('should end with 0 and print no experimental warning', () => {
    const { status, stderr } = run('await exitNow(0);');

    expect(status).toBe(0);
    expect(stderr).not.toContain('ExperimentalWarning');
  });
});
