/**
 * Shared kernel typings, compiler defaults, and Automatic Type Acquisition (ATA)
 * for the split TS/JS language contributions (`typescript-contribution.ts`,
 * `javascript-contribution.ts`). Keeps a single refcounted ATA instance when both
 * families are active in one session.
 */

import type * as Monaco from 'monaco-editor';
import type { FileManagerRef, FileManagerProxy } from '#machines/file-manager.machine.types.js';
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

async function waitForProxy(fileManagerRef: FileManagerRef): Promise<FileManagerProxy | undefined> {
  const initial = fileManagerRef.getSnapshot().context.proxy;
  if (initial) {
    return initial;
  }

  return new Promise<FileManagerProxy | undefined>((resolve) => {
    const subscription = fileManagerRef.subscribe((snapshot) => {
      const { proxy } = snapshot.context;
      if (proxy) {
        subscription.unsubscribe();
        resolve(proxy);
      } else if (snapshot.matches('error')) {
        subscription.unsubscribe();
        resolve(undefined);
      }
    });
  });
}

async function readTextFile(proxy: FileManagerProxy, path: string): Promise<string | undefined> {
  try {
    const bytes = await proxy.readFile(path);
    return typeof bytes === 'string' ? bytes : decoder.decode(bytes);
  } catch {
    return undefined;
  }
}

async function collectDeclarationFiles(
  proxy: FileManagerProxy,
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
  proxy: FileManagerProxy,
  packageName: string,
): Promise<StaticTypeDefinition[]> {
  const packageRoot = `/node_modules/${packageName}`;
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

async function loadScopedStaticTypes(proxy: FileManagerProxy, scopeName: string): Promise<StaticTypeDefinition[]> {
  let packageNames: readonly string[];
  try {
    packageNames = await proxy.readdir(`/node_modules/${scopeName}`);
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
 * mount. The mount is populated eagerly during FM worker init (see
 * `apps/ui/app/machines/file-manager.worker.ts`) so by the time the proxy
 * is non-undefined, every package's `index.d.ts` is on disk.
 *
 * @public
 */
export async function loadKernelStaticTypesFromMount(
  proxy: FileManagerProxy | undefined,
): Promise<StaticTypeDefinition[]> {
  if (!proxy) {
    return [];
  }

  let packageNames: readonly string[];
  try {
    packageNames = await proxy.readdir('/node_modules');
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
    const proxy = await waitForProxy(fileManagerRef);
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
