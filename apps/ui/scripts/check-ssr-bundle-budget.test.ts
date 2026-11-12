// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findSsrFilesWithForbiddenDreiCoreImport,
  findWelcomeChunksWithThree,
  staticChunkFiles,
} from '#scripts/check-ssr-bundle-budget.mjs';

let serverDirectory: string | undefined;

afterEach(async () => {
  if (!serverDirectory) {
    return;
  }

  await rm(serverDirectory, { recursive: true, force: true });
  serverDirectory = undefined;
});

describe('findSsrFilesWithForbiddenDreiCoreImport', () => {
  it('should report generated server JavaScript files containing forbidden Drei core imports', async () => {
    serverDirectory = await mkdtemp(join(tmpdir(), 'tau-ssr-bundle-'));
    const assetsDirectory = join(serverDirectory, 'assets');
    await mkdir(assetsDirectory);

    const cleanFilePath = join(serverDirectory, 'index.js');
    const ignoredTextFilePath = join(assetsDirectory, 'notes.txt');
    const offenderFilePath = join(assetsDirectory, 'parameters.js');

    await writeFile(cleanFilePath, "import { Line } from '@react-three/drei';\n");
    await writeFile(ignoredTextFilePath, "import '@react-three/drei/core/CameraControls.js';\n");
    await writeFile(
      offenderFilePath,
      'import { CameraControlsImpl } from "@react-three/drei/core/CameraControls.js";\n',
    );

    expect(findSsrFilesWithForbiddenDreiCoreImport(serverDirectory)).toEqual([offenderFilePath]);
  });
});

describe('findWelcomeChunksWithThree (onboarding S5 a)', () => {
  const manifest = {
    'node_modules/@react-router/dev/dist/config/defaults/entry.client.tsx': {
      file: 'assets/entry.client-a.js',
      imports: ['_react-b.js'],
    },
    'app/root.tsx': { file: 'assets/root-c.js', imports: ['_react-b.js', '_ui-d.js'] },
    'app/routes/welcome/route.tsx': { file: 'assets/route-e.js', imports: ['_ui-d.js'] },
    'app/routes/_index/route.tsx': { file: 'assets/route-f.js', imports: ['_three-g.js'] },
    'app/components/onboarding/setup-live-preview.tsx': {
      file: 'assets/setup-live-preview-h.js',
      imports: ['_three-g.js'],
    },
    '_react-b.js': { file: 'assets/react-b.js' },
    '_ui-d.js': { file: 'assets/ui-d.js' },
    '_three-g.js': { file: 'assets/three-g.js' },
  };
  const chunks: Record<string, string> = {
    'assets/three-g.js': 'const REVISION="170";window.__THREE__=REVISION;',
  };
  const read = (file: string): string => chunks[file] ?? 'export {};';

  it('should follow only static imports from the entry, root and /welcome', () => {
    expect(
      staticChunkFiles(manifest, [
        'node_modules/@react-router/dev/dist/config/defaults/entry.client.tsx',
        'app/root.tsx',
        'app/routes/welcome/route.tsx',
      ]),
    ).toEqual([
      'assets/entry.client-a.js',
      'assets/react-b.js',
      'assets/root-c.js',
      'assets/route-e.js',
      'assets/ui-d.js',
    ]);
  });

  it('should pass while three.js is reached only by a dynamic import', () => {
    expect(findWelcomeChunksWithThree(manifest, read)).toEqual([]);
  });

  it('should report a chunk of /welcome that holds three.js', () => {
    const imported = {
      ...manifest,
      'app/routes/welcome/route.tsx': { file: 'assets/route-e.js', imports: ['_ui-d.js', '_three-g.js'] },
    };
    expect(findWelcomeChunksWithThree(imported, read)).toEqual(['assets/three-g.js']);
  });

  it('should refuse a manifest without the /welcome route', () => {
    const { 'app/routes/welcome/route.tsx': _welcome, ...rest } = manifest;
    expect(() => findWelcomeChunksWithThree(rest, read)).toThrow(/no app\/routes\/welcome\/route entry/u);
  });
});
