// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSsrFilesWithForbiddenDreiCoreImport } from '#scripts/check-ssr-bundle-budget.mjs';

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
