import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import { bundledTypesWorkspaceRootSegment } from '#lib/bundled-types-tree.constants.js';

export type StaticTypeDefinition = Readonly<{
  packageName: string;
  content: string;
  filePath?: string;
  packageJsonContent?: string;
}>;

export type DependencyReader = {
  readdir: ComposedViewClient['readdir'];
  readFile(path: string): Promise<string | Uint8Array<ArrayBuffer>>;
};

const root = `/${bundledTypesWorkspaceRootSegment}`;
const decoder = new TextDecoder();

async function readText(reader: DependencyReader, path: string): Promise<string | undefined> {
  try {
    const bytes = await reader.readFile(path);
    return typeof bytes === 'string' ? bytes : decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

async function collectDeclarations(
  reader: DependencyReader,
  directory: string,
): Promise<Array<{ path: string; text: string }>> {
  let entries: readonly string[];
  try {
    entries = await reader.readdir(directory);
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry}`;
      if (/\.d\.(?:ts|mts|cts)$/u.test(entry)) {
        const text = await readText(reader, path);
        if (text === undefined) {
          throw new Error(`Declaration unavailable: ${path}`);
        }
        return [{ path, text }];
      }
      return collectDeclarations(reader, path);
    }),
  );
  return nested.flat();
}

export async function readStaticTypePackage(
  reader: DependencyReader,
  packageName: string,
): Promise<StaticTypeDefinition[]> {
  if (!/^(?:@[\w.-]+\/)?[\w.-]+$/u.test(packageName)) {
    return [];
  }
  const packageRoot = `${root}/${packageName}`;
  let packageJsonContent: string | undefined;
  let declarations: Array<{ path: string; text: string }>;
  try {
    [packageJsonContent, declarations] = await Promise.all([
      readText(reader, `${packageRoot}/package.json`),
      collectDeclarations(reader, packageRoot),
    ]);
  } catch {
    // A partially readable mount is retried as a unit; never cache an incomplete package.
    return [];
  }
  if (!packageJsonContent) {
    return [];
  }
  return declarations.map(({ path, text }) => ({
    packageName,
    content: text,
    filePath: `file://${path}`,
    packageJsonContent,
  }));
}

/** Read only selected packages from the existing composed dependency mount. */
export async function loadKernelStaticTypes(
  reader: DependencyReader | undefined,
  packageNames: readonly string[],
): Promise<StaticTypeDefinition[]> {
  if (!reader || packageNames.length === 0) {
    return [];
  }
  const groups = await Promise.all([...new Set(packageNames)].map(async (name) => readStaticTypePackage(reader, name)));
  return groups.flat();
}
