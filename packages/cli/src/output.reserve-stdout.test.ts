import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const outputModule = fileURLToPath(new URL('output.ts', import.meta.url));

/* `reserveStdout` rebinds the process's stdout and console, so it runs in a child process of its own. */
const script = `
import { Worker } from 'node:worker_threads';
const { emit, reserveStdout } = await import(${JSON.stringify(outputModule)});
reserveStdout();
console.log('kernel log');
console.info('kernel info');
process.stdout.write('glue\\n');
const worker = new Worker("process.stdout.write('worker stdout\\\\n')", { eval: true, stdout: false });
await new Promise((resolve) => worker.once('exit', resolve));
await emit({ kind: 'test', ok: true });
`;

describe('reserveStdout', () => {
  it('should leave only the command record on stdout and move every other write to stderr', async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      script,
    ]);

    expect(stdout).toBe('{"v":1,"kind":"test","ok":true}\n');
    expect(stderr).toContain('kernel log');
    expect(stderr).toContain('kernel info');
    expect(stderr).toContain('glue');
    expect(stderr).toContain('worker stdout');
  });
});
