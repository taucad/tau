import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

// Linux's real utility proof runs inside the existing sandboxed desktop guest fixture.
describe.runIf(process.platform === 'win32' || process.platform === 'darwin')(
  'native Electron authority ownership',
  () => {
    it('should exclude competing utility processes and recover after force kill and explicit release', async () => {
      const output = resolve('../../out/test-results/filesystem-authority');
      await mkdir(output, { recursive: true });
      const root = await mkdtemp(join(output, 'electron-'));
      try {
        await mkdir(join(root, 'profile'));
        await Promise.all([
          build({
            entryPoints: [join(import.meta.dirname, 'authority-writer-electron.fixture.ts')],
            outfile: join(root, 'main.mjs'),
            bundle: true,
            platform: 'node',
            format: 'esm',
            external: ['electron'],
          }),
          build({
            entryPoints: [join(import.meta.dirname, 'authority-writer-electron-utility.fixture.ts')],
            outfile: join(root, 'utility.mjs'),
            bundle: true,
            platform: 'node',
            format: 'esm',
          }),
        ]);
        const require = createRequire(import.meta.url);
        const electron: unknown = require('electron');
        if (typeof electron !== 'string') {
          throw new TypeError('Electron executable path unavailable');
        }
        const child = spawn(electron, [join(root, 'main.mjs'), root], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk;
        });
        const exitTimer = globalThis.setTimeout(() => child.kill('SIGKILL'), 60_000);
        try {
          const code = await new Promise<number | undefined>((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (status) => {
              resolve(status ?? undefined);
            });
          });
          expect(code, stderr).toBe(0);
          const receipt = stdout.split('\n').find((line) => line.startsWith('{"status":"passed"'));
          expect(receipt).toBeDefined();
          console.info('Native Electron authority receipt', receipt);
          expect(JSON.parse(receipt ?? '{}')).toMatchObject({
            status: 'passed',
            platform: process.platform,
            utilityExclusion: true,
            junctionAlias: true,
            forceKillRecovery: true,
            explicitRelease: true,
          });
        } finally {
          globalThis.clearTimeout(exitTimer);
          if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }, 90_000);
  },
);
