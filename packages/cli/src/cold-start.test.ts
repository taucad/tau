import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const cliBinPath = resolve(repoRoot, 'packages/cli/dist/bin/tau.mjs');
const { version } = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as { version: string };

/** Printed on stderr, with the importing module, each time a module resolves to the `sharp` package. */
const sharpMarker = 'tau-cold-start: sharp resolved from';

/*
 * A module-load probe preloaded ahead of everything else. A synchronous resolve hook sees every ESM import and
 * CommonJS require in the process, so a `sharp` load anywhere in the startup graph reports here.
 */
const sharpProbe = `data:text/javascript,${encodeURIComponent(`
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (/[\\\\/]node_modules[\\\\/]sharp[\\\\/]/.test(result.url)) {
      process.stderr.write(${JSON.stringify(sharpMarker)} + ' ' + context.parentURL + '\\n');
    }
    return result;
  },
});
`)}`;

type ProbeRun = { stdout: string; stderr: string; exitCode: number };

/** Run Node with the sharp probe preloaded; never rejects, so a failure reports its output. */
const runProbed = async (
  args: readonly string[],
  options: { cwd: string; typescript?: boolean },
): Promise<ProbeRun> => {
  /* In this workspace `@taucad/*` export TypeScript source, so the built bin needs the loader `runCli` gives it. */
  const loader = options.typescript === false ? [] : ['--import', '@oxc-node/core/register'];
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--import', sharpProbe, ...loader, ...args], {
      cwd: options.cwd,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- environment variables are not camelCase
      env: { ...process.env, NX_PREFER_NODE_STRIP_TYPES: 'true' },
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? '',
      exitCode: typeof failure.code === 'number' ? failure.code : 1,
    };
  }
};

describe('tau cold start', () => {
  it('reports sharp when a module graph does load it', async () => {
    // `@gltf-transform/functions` reaches `sharp` through `ndarray-pixels` at module load in Node.
    const run = await runProbed(['--input-type=module', '--eval', "await import('@gltf-transform/functions');"], {
      cwd: resolve(repoRoot, 'packages/core/geometry'),
      typescript: false,
    });

    expect(run.exitCode, run.stderr).toBe(0);
    expect(run.stderr).toContain(sharpMarker);
  });

  it.each([
    { command: '--version', output: version },
    { command: '--help', output: 'USAGE tau' },
    { command: 'check --help', output: 'USAGE tau check' },
    { command: 'prepare --help', output: 'USAGE tau prepare' },
    { command: 'test --help', output: 'USAGE tau test' },
  ])('does not load sharp for `tau $command`', async ({ command, output }) => {
    const run = await runProbed([cliBinPath, ...command.split(' ')], { cwd: repoRoot });

    expect(run.exitCode, run.stderr).toBe(0);
    expect(run.stdout).toContain(output);
    expect(run.stderr).not.toContain(sharpMarker);
  });
});
