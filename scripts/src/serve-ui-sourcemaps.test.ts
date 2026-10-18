import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const viteCli = resolve(dirname(fileURLToPath(import.meta.resolve('vite'))), '../../bin/vite.js');

describe('serve-only generated source maps', () => {
  it('should leave website and desktop hidden maps enabled while the serve build uses its explicit false config', () => {
    const project = JSON.parse(readFileSync(join(repoRoot, 'apps/ui/project.json'), 'utf8')) as {
      targets: Record<string, { command?: string }>;
    };
    expect(project.targets['build']?.command).toContain('--sourcemapClient hidden');
    expect(project.targets['build:desktop']?.command).toContain('--sourcemapClient hidden');
    expect(project.targets['build:serve']?.command).not.toContain('--sourcemapClient');
    expect(readFileSync(join(repoRoot, 'apps/ui/serve/vite.config.ts'), 'utf8')).toContain('sourcemap: false');
  });

  it('should stop generating client debug maps while preserving public runtime maps and worker/WASM assets', () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-s12-vite-'));
    try {
      mkdirSync(join(root, 'public/sourcemaps'), { recursive: true });
      writeFileSync(join(root, 'public/sourcemaps/replicad.js.map'), '{"runtime":"required"}');
      writeFileSync(join(root, 'index.html'), '<script type="module" src="/main.js"></script>');
      writeFileSync(join(root, 'main.js'), 'new Worker(new URL("./worker.js", import.meta.url), {type:"module"});');
      writeFileSync(join(root, 'worker.js'), 'fetch(new URL("./kernel.wasm", import.meta.url));');
      writeFileSync(join(root, 'kernel.wasm'), Uint8Array.from([0, 97, 115, 109, 1, 0, 0, 0]));
      for (const sourcemap of ['hidden', false]) {
        const outDirectory = sourcemap === false ? 'without-debug' : 'hidden-debug';
        writeFileSync(
          join(root, 'vite.config.mjs'),
          `export default {build:{outDir:${JSON.stringify(outDirectory)},sourcemap:${JSON.stringify(sourcemap)},assetsInlineLimit:0},worker:{format:'es'}};`,
        );
        const result = spawnSync(process.execPath, [viteCli, 'build'], { cwd: root, encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(0);
        const assets = readdirSync(join(root, outDirectory, 'assets'));
        expect(assets.some((name) => name.endsWith('.js.map'))).toBe(sourcemap === 'hidden');
        expect(assets.some((name) => name.startsWith('worker-') && name.endsWith('.js'))).toBe(true);
        const wasm = assets.find((name) => name.endsWith('.wasm'));
        expect(wasm).toBeDefined();
        expect(readFileSync(join(root, outDirectory, 'assets', wasm!))).toEqual(
          readFileSync(join(root, 'kernel.wasm')),
        );
        expect(readFileSync(join(root, outDirectory, 'sourcemaps/replicad.js.map'), 'utf8')).toBe(
          '{"runtime":"required"}',
        );
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
