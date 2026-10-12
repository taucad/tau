import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBrainEvidence } from '#validate-brain-evidence.js';

const fixtures: string[] = [];
afterEach(() => {
  for (const root of fixtures.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const brain = (files: Record<string, string | Uint8Array<ArrayBuffer>>): string => {
  const root = mkdtempSync(resolve(tmpdir(), 'tau-brain-evidence-'));
  fixtures.push(root);
  execFileSync('git', ['-C', root, 'init', '-q']);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), content);
  }

  return root;
};

const mebibytes = (count: number, fill = 0x61): Uint8Array<ArrayBuffer> =>
  new Uint8Array(count * 1024 * 1024 + 1).fill(fill);

describe('checkBrainEvidence', () => {
  it('admits text, small binaries and LFS-routed binaries', () => {
    const root = brain({
      '.gitattributes': 'research/artifacts/**/*.png filter=lfs diff=lfs merge=lfs -text\n',
      'research/a.md': '# A\n',
      'research/artifacts/s/run/table.csv': 'a'.repeat(2 * 1024 * 1024 + 1),
      'research/artifacts/s/run/small.bin': Buffer.from([0, 1, 2]),
      'research/artifacts/s/run/shot.png': mebibytes(2, 0),
    });

    expect(checkBrainEvidence(root)).toStrictEqual([]);
  });

  it('refuses build products, unrouted binaries and oversized files', () => {
    const root = brain({
      'research/artifacts/s/run/node_modules/x/index.js': 'x\n',
      'research/artifacts/s/run/kernel.wasm': 'x',
      'research/artifacts/s/run/blob.bin': mebibytes(2, 0),
      'research/artifacts/s/run/log.txt': mebibytes(11),
    });

    expect(checkBrainEvidence(root).map(({ level, path }) => `${level} ${path}`)).toStrictEqual([
      'ERROR research/artifacts/s/run/blob.bin',
      'ERROR research/artifacts/s/run/kernel.wasm',
      'WARN research/artifacts/s/run/log.txt',
      'ERROR research/artifacts/s/run/node_modules/x/index.js',
    ]);
  });
});
