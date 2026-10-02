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
    packageNames.map(async (packageName): Promise<StaticTypeDefinition | undefined> => {
      try {
        const bytes = await proxy.readFile(`/node_modules/${packageName}/index.d.ts`);
        const content = typeof bytes === 'string' ? bytes : decoder.decode(bytes);
        return { packageName, content, prewrapped: true };
      } catch {
        return undefined;
      }
    }),
  );

  return definitions.filter((definition): definition is StaticTypeDefinition => definition !== undefined);
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
