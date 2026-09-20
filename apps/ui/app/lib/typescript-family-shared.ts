/**
 * Shared kernel typings, compiler defaults, and Automatic Type Acquisition (ATA)
 * for the split TS/JS language contributions (`typescript-contribution.ts`,
 * `javascript-contribution.ts`). Keeps a single refcounted ATA instance when both
 * families are active in one session.
 */

import type * as Monaco from 'monaco-editor';
import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import { bundledTypesWorkspaceRootSegment } from '#lib/bundled-types-tree.constants.js';
import type { StaticTypeDefinition } from '#lib/type-acquisition-service.js';
import { TypeAcquisitionService } from '#lib/type-acquisition-service.js';

/**
 * `ModuleResolutionKind.Bundler` from TypeScript 5.0+ (numeric value 100). Monaco's
 * public typings omit this enum member but the bundled language service supports it.
 */
const moduleResolutionBundler = 100 as Monaco.typescript.CompilerOptions['moduleResolution'];

const inlayHintsOptions = {
  includeInlayParameterNameHints: 'all',
  includeInlayParameterNameHintsWhenArgumentMatchesName: true,
} as const;

let ataInstance: TypeAcquisitionService | undefined;
let ataBootPromise: Promise<void> | undefined;
let ataRefCount = 0;

const decoder = new TextDecoder();

/**
 * What the bundled typings need: two reads of the dependency mount.
 *
 * The composed client, not the authority proxy: the mount is a root of its own
 * and is read through its rooted `'user'` connection since W11, so the editor's
 * typings come from the same composition the file tree's `node_modules` rows do
 * (charter D1, deviation H3 closed).
 */
type DependencyReader = Pick<ComposedViewClient, 'readFile' | 'readdir'>;

/** The dependency mount, as this module addresses it. */
const dependencyRoot = `/${bundledTypesWorkspaceRootSegment}`;

async function waitForViewClient(fileManagerRef: FileManagerRef): Promise<DependencyReader | undefined> {
  const initial = fileManagerRef.getSnapshot().context.viewClient;
  if (initial) {
    return initial;
  }

  return new Promise<DependencyReader | undefined>((resolve) => {
    const subscription = fileManagerRef.subscribe((snapshot) => {
      const { viewClient } = snapshot.context;
      if (viewClient) {
        subscription.unsubscribe();
        resolve(viewClient);
      } else if (snapshot.matches('error')) {
        subscription.unsubscribe();
        resolve(undefined);
      }
    });
  });
}

async function readTextFile(proxy: DependencyReader, path: string): Promise<string | undefined> {
  try {
    const bytes = await proxy.readFile(path);
    return typeof bytes === 'string' ? bytes : decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

async function collectDeclarationFiles(
  proxy: DependencyReader,
  directory: string,
  packageRoot: string,
): Promise<Array<{ relativePath: string; content: string }>> {
  let entries: readonly string[];
  try {
    entries = await proxy.readdir(directory);
  } catch {
    return [];
  }

  const collected = await Promise.all(
    entries.map(async (entry) => {
      const path = `${directory}/${entry}`;
      if (entry.endsWith('.d.ts')) {
        const content = await readTextFile(proxy, path);
        return content === undefined
          ? []
          : [
              {
                relativePath: path.slice(packageRoot.length + 1),
                content,
              },
            ];
      }
      return collectDeclarationFiles(proxy, path, packageRoot);
    }),
  );

  return collected.flat();
}

async function readStaticTypeDefinitions(
  proxy: DependencyReader,
  packageName: string,
): Promise<StaticTypeDefinition[]> {
  const packageRoot = `${dependencyRoot}/${packageName}`;
  const packageJsonContent = await readTextFile(proxy, `${packageRoot}/package.json`);
  const declarationFiles = await collectDeclarationFiles(proxy, packageRoot, packageRoot);

  if (declarationFiles.length === 0) {
    const content = await readTextFile(proxy, `${packageRoot}/index.d.ts`);
    return content === undefined
      ? []
      : [
          {
            packageName,
            content,
            packageJsonContent,
          },
        ];
  }

  return declarationFiles.map((file) => ({
    packageName,
    content: file.content,
    filePath: `file://${packageRoot}/${file.relativePath}`,
    packageJsonContent,
  }));
}

async function loadScopedStaticTypes(proxy: DependencyReader, scopeName: string): Promise<StaticTypeDefinition[]> {
  let packageNames: readonly string[];
  try {
    packageNames = await proxy.readdir(`${dependencyRoot}/${scopeName}`);
  } catch {
    return [];
  }

  const definitions = await Promise.all(
    packageNames.map(async (packageName) => readStaticTypeDefinitions(proxy, `${scopeName}/${packageName}`)),
  );
  return definitions.flat();
}

/**
 * Read kernel static type definitions from the FM worker's `/node_modules`
 * mount, through the composed client's dependency arm. The mount is populated
 * eagerly during FM worker init (see `apps/ui/app/machines/file-manager.worker.ts`)
 * so by the time the client exists, every package's `index.d.ts` is on disk.
 *
 * @public
 */
export async function loadKernelStaticTypesFromMount(
  proxy: DependencyReader | undefined,
): Promise<StaticTypeDefinition[]> {
  if (!proxy) {
    return [];
  }

  let packageNames: readonly string[];
  try {
    packageNames = await proxy.readdir(dependencyRoot);
  } catch {
    return [];
  }

  const definitions = await Promise.all(
    packageNames.map(async (packageName): Promise<StaticTypeDefinition[]> => {
      if (packageName.startsWith('@')) {
        return loadScopedStaticTypes(proxy, packageName);
      }
      return readStaticTypeDefinitions(proxy, packageName);
    }),
  );

  return definitions.flat();
}

/**
 * Ensures ATA boots once; reference-counted so TS and JS contributions can each
 * `dispose()` their handle independently.
 */
export function ensureAtaBoot(monaco: typeof Monaco, fileManagerRef: FileManagerRef): Monaco.IDisposable {
  ataRefCount += 1;
  ataBootPromise ??= (async (): Promise<void> => {
    const proxy = await waitForViewClient(fileManagerRef);
    const staticTypes = await loadKernelStaticTypesFromMount(proxy);
    ataInstance = new TypeAcquisitionService();
    ataInstance.initialize(monaco, { staticTypes });
    ataInstance.startWatching();
  })();

  let disposed = false;
  return {
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      // async-iife: bootstrap
      void (async (): Promise<void> => {
        try {
          await ataBootPromise;
        } finally {
          ataRefCount -= 1;
          if (ataRefCount <= 0) {
            ataInstance?.dispose();
            ataInstance = undefined;
            ataBootPromise = undefined;
            ataRefCount = 0;
          }
        }
      })();
    },
  };
}

/** Forward project session change to the live ATA singleton (if any). */
export function forwardAtaProjectSessionChange(_projectId: string): void {
  ataInstance?.onProjectSessionChange();
}

export function setTsCompilerOptions(monaco: typeof Monaco): void {
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    experimentalDecorators: true,
    allowSyntheticDefaultImports: true,
    allowImportingTsExtensions: true,
    moduleResolution: moduleResolutionBundler,
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    noLib: false,
    allowNonTsExtensions: true,
    noEmit: true,
    esModuleInterop: true,
    baseUrl: '.',
  });
  monaco.typescript.typescriptDefaults.setInlayHintsOptions(inlayHintsOptions);
}

export function setJsCompilerOptions(monaco: typeof Monaco): void {
  monaco.typescript.javascriptDefaults.setCompilerOptions({
    allowSyntheticDefaultImports: true,
    moduleResolution: moduleResolutionBundler,
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.ESNext,
    allowJs: true,
    checkJs: true,
    esModuleInterop: true,
  });
  monaco.typescript.javascriptDefaults.setInlayHintsOptions(inlayHintsOptions);
}
