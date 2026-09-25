import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';

const pluginPhantomNames = [
  '__exportFormats',
  '__renderOptions',
  '__kernelId',
  '__renderContent',
  '__exportContent',
  '__middlewareRenderContent',
  '__middlewareExportContent',
  '__transcodeEdges',
  '__transcodeFrom',
  '__transcoderId',
  '__transcodeContent',
  '__transcodePinnedSourceOptions',
] as const;

export const assembleRuntimeDeclarations = async (runtimeDirectory: string, outDirectory: string): Promise<void> => {
  await assembleBundledDeclarations(runtimeDirectory, outDirectory, 'runtime');
  const pluginDeclarations = await readFile(
    join(resolve(runtimeDirectory, outDirectory), 'plugins', 'plugin-types.d.mts'),
    'utf8',
  );
  for (const name of pluginPhantomNames) {
    if (
      !pluginDeclarations.includes(`declare const ${name}: unique symbol;`) ||
      !pluginDeclarations.includes(`readonly [${name}]?`) ||
      pluginDeclarations.includes(`readonly ${name}?`)
    ) {
      throw new Error(`Plugin phantom declaration is not opaque: ${name}`);
    }
  }
};
