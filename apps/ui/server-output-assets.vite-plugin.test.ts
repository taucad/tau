import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// oxlint-disable-next-line eslint/no-restricted-imports -- Vite plugin test lives outside app aliases.
import { createServerOutputAssets, removeServerAssetCopy } from './server-output-assets.vite-plugin.js';

let root: string | undefined;

afterEach(() => {
  if (root !== undefined) {
    rmSync(root, { recursive: true, force: true });
    root = undefined;
  }
});

/** A build root with `server/` and `client/`, each holding the given files and contents. */
const writeBuild = (files: Readonly<Record<string, string>>): { server: string; client: string } => {
  root = mkdtempSync(path.join(tmpdir(), 'tau-server-output-assets-'));
  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return { server: path.join(root, 'server'), client: path.join(root, 'client') };
};

describe('removeServerAssetCopy', () => {
  it('should remove a server asset the client output holds byte for byte', () => {
    const build = writeBuild({ 'server/assets/a-1.webp': 'image', 'client/assets/a-1.webp': 'image' });

    expect(
      removeServerAssetCopy({
        fileName: 'assets/a-1.webp',
        serverDirectory: build.server,
        clientDirectory: build.client,
      }),
    ).toBe('removed');
    expect(existsSync(path.join(build.server, 'assets/a-1.webp'))).toBe(false);
    expect(readFileSync(path.join(build.client, 'assets/a-1.webp'), 'utf8')).toBe('image');
  });

  it('should keep an asset only the server emitted where the server build put it', () => {
    const build = writeBuild({ 'server/assets/b-2.md': 'server only', 'client/index.html': '' });

    expect(
      removeServerAssetCopy({
        fileName: 'assets/b-2.md',
        serverDirectory: build.server,
        clientDirectory: build.client,
      }),
    ).toBe('kept');
    expect(readFileSync(path.join(build.server, 'assets/b-2.md'), 'utf8')).toBe('server only');
    expect(existsSync(path.join(build.client, 'assets/b-2.md'))).toBe(false);
  });

  it('should keep a same-named server asset whose bytes differ, and a file already gone', () => {
    const build = writeBuild({ 'server/assets/c-3.md': 'server', 'client/assets/c-3.md': 'client' });

    expect(
      removeServerAssetCopy({
        fileName: 'assets/c-3.md',
        serverDirectory: build.server,
        clientDirectory: build.client,
      }),
    ).toBe('kept');
    expect(readFileSync(path.join(build.server, 'assets/c-3.md'), 'utf8')).toBe('server');
    expect(readFileSync(path.join(build.client, 'assets/c-3.md'), 'utf8')).toBe('client');
    expect(
      removeServerAssetCopy({
        fileName: 'assets/gone.md',
        serverDirectory: build.server,
        clientDirectory: build.client,
      }),
    ).toBe('kept');
  });
});

describe('createServerOutputAssets', () => {
  it('should apply to the server build only', () => {
    const plugin = createServerOutputAssets({ clientDirectory: '/client' });
    const apply = plugin.apply as unknown as (
      config: Record<string, unknown>,
      environment: Record<string, unknown>,
    ) => boolean;

    expect(apply({}, { command: 'build', mode: 'production', isSsrBuild: true })).toBe(true);
    expect(apply({}, { command: 'build', mode: 'production', isSsrBuild: false })).toBe(false);
    expect(apply({}, { command: 'serve', mode: 'development', isSsrBuild: true })).toBe(false);
  });

  it('should hand over emitted assets and leave chunks, source maps and the server manifest', () => {
    const build = writeBuild({
      'server/index.js': 'export {}',
      'server/index.js.map': '{}',
      'server/.vite/manifest.json': '{}',
      'server/assets/a-1.webp': 'image',
      'client/assets/a-1.webp': 'image',
    });
    const plugin = createServerOutputAssets({ clientDirectory: build.client });
    const configResolved = plugin.configResolved as (config: Record<string, unknown>) => void;
    configResolved({
      root: path.dirname(build.server),
      build: { outDir: 'server' },
      logger: { info: () => undefined },
    });
    const writeBundle = plugin.writeBundle as unknown as {
      handler: (options: Record<string, unknown>, bundle: Record<string, unknown>) => void;
    };

    writeBundle.handler(
      {},
      {
        'index.js': { type: 'chunk', fileName: 'index.js' },
        'index.js.map': { type: 'asset', fileName: 'index.js.map' },
        '.vite/manifest.json': { type: 'asset', fileName: '.vite/manifest.json' },
        'assets/a-1.webp': { type: 'asset', fileName: 'assets/a-1.webp' },
      },
    );

    expect(existsSync(path.join(build.server, 'assets/a-1.webp'))).toBe(false);
    for (const kept of ['index.js', 'index.js.map', '.vite/manifest.json']) {
      expect(existsSync(path.join(build.server, kept)), kept).toBe(true);
    }
  });
});
