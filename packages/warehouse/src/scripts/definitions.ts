import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PartDefinition } from '#definition.js';

export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Read the trusted local authoring catalog without initializing a CAD kernel.
 * @returns Definitions with the source directory containing their model.
 */
export async function readDefinitions(): Promise<
  ReadonlyArray<{ readonly part: PartDefinition; readonly directory: string }>
> {
  const directory = join(packageRoot, 'definitions');
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const family = join(directory, entry.name);
        const files = await readdir(family);
        if (!files.includes('catalog.ts')) {
          return [];
        }
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Trusted, statically typechecked author modules are loaded from the local definitions directory.
        const module: { parts: readonly PartDefinition[] } = await import(
          pathToFileURL(join(family, 'catalog.ts')).href
        );
        return module.parts.map((part) => ({ part, directory: family }));
      }),
  );
  return groups.flat().sort((left, right) => left.part.id.localeCompare(right.part.id));
}
