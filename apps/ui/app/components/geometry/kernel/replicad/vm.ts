/**
 * The purpose of this file is to operate as a Javascript VM.
 *
 * Eventually this should be replaced by a more robust VM that handles
 * import maps and provides a secure environment for untrusted code
 * execution.
 *
 * It suffices for now as it keeps bundle size low whilst supporting
 * both CommonJS and ESM.
 */

import { init, parse } from 'es-module-lexer';
import type { ImportSpecifier } from 'es-module-lexer';
import type { CadModuleExports } from '@taucad/types';
import * as jscadModeling from '@jscad/modeling';
import * as replicad from 'replicad';
import * as zod from 'zod/v4';
import { hashCode } from '#utils/crypto.utils.js';

// Module cache - keyed by both code hash and active modules to prevent cross-kernel contamination
const moduleCache = new Map<string, CadModuleExports>();

// Track registration state to prevent race conditions in worker contexts
let modulesRegistered = false;

/**
 * Register kernel modules in globalThis in a thread-safe way.
 * This avoids race conditions when multiple workers initialize simultaneously.
 *
 * While Web Workers run in separate threads, we use an explicit flag to ensure
 * idempotent registration and prevent redundant assignments to globalThis.
 */
export function registerKernelModules(): void {
  // Early exit if already registered
  if (modulesRegistered) {
    return;
  }

  const g = globalThis as unknown as {
    replicad?: unknown;
    zod?: unknown;
    jscadModeling?: unknown;
  };

  // Register modules explicitly (only if not already present)
  if (g.replicad === undefined) {
    g.replicad = replicad;
  }

  if (g.zod === undefined) {
    g.zod = zod;
  }

  if (g.jscadModeling === undefined) {
    g.jscadModeling = jscadModeling;
  }

  // Mark as registered to prevent future redundant registrations
  modulesRegistered = true;
}

// Module registry getter function (lazy evaluation to support runtime injection)
// This allows workers to inject modules into globalThis after the VM module loads
const getModuleRegistry = (): Record<string, unknown> => {
  const g = globalThis as unknown as {
    replicad?: unknown;
    zod?: unknown;
    jscadModeling?: unknown;
  };

  return {
    // These are instantiated in the worker scope
    replicad: g.replicad,
    zod: g.zod,
    // Allow JSCAD worker to reuse the VM and inject @jscad/modeling at runtime
    // eslint-disable-next-line @typescript-eslint/naming-convention -- scoped module name
    '@jscad/modeling': g.jscadModeling,
    // Add more modules here
  };
};

/**
 * Get active kernel identifier based on which globals are defined
 * This ensures cache isolation between different kernels
 */
function getActiveKernelIdentifier(): string {
  const registry = getModuleRegistry();
  const activeModules: string[] = [];

  for (const [moduleName, moduleValue] of Object.entries(registry)) {
    if (moduleValue !== undefined) {
      activeModules.push(moduleName);
    }
  }

  // Sort to ensure consistent cache keys
  return activeModules.sort().join('+');
}

const moduleGlobalFromModuleName = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- scoped module name.
  '@jscad/modeling': 'jscadModeling',
  replicad: 'replicad',
  zod: 'zod',
} as const;

// Utility for detecting bare imports
function isBareSpecifier(specifier: string): boolean {
  return !(
    specifier.startsWith('./') ||
    specifier.startsWith('../') ||
    specifier.startsWith('/') ||
    specifier.startsWith('http://') ||
    specifier.startsWith('https://')
  );
}

/**
 * Extract import information from code
 * @param code - The code to extract import information from
 * @param importStatement - The import statement to extract information from
 * @returns The import information
 */
function extractImportInfo(
  code: string,
  importStatement: ImportSpecifier,
):
  | {
      type: 'default';
      defaultName: string;
      module: string;
    }
  | {
      type: 'named';
      imports: string[];
      module: string;
    }
  | {
      type: 'namespace';
      namespaceName: string;
      module: string;
    } {
  const fullImportText = code.slice(importStatement.ss, importStatement.se);

  // Match different import patterns - handling empty imports
  const namedImportMatch = /import\s*{\s*([^}]*)\s*}\s*from\s*['"`]([^'"`]+)['"`]/.exec(fullImportText);
  const defaultImportMatch = /import\s+(\w+)\s+from\s*['"`]([^'"`]+)['"`]/.exec(fullImportText);
  const namespaceImportMatch = /import\s*\*\s*as\s+(\w+)\s+from\s*['"`]([^'"`]+)['"`]/.exec(fullImportText);

  if (namedImportMatch) {
    // Handle empty imports by filtering out empty strings after split and trim
    const imports = namedImportMatch[1]!
      .split(',')
      .map((imp) => imp.trim())
      .filter((imp) => imp.length > 0);
    const module = namedImportMatch[2]!;
    return { type: 'named', imports, module };
  }

  if (defaultImportMatch) {
    const defaultName = defaultImportMatch[1]!;
    const module = defaultImportMatch[2]!;
    return { type: 'default', defaultName, module };
  }

  if (namespaceImportMatch) {
    const namespaceName = namespaceImportMatch[1]!;
    const module = namespaceImportMatch[2]!;
    return { type: 'namespace', namespaceName, module };
  }

  throw new Error(`Unable to extract import info from: ${fullImportText}`);
}

// Rewrite imports to use module registry
async function rewriteImports(code: string): Promise<string> {
  await init;
  const [imports] = parse(code);

  if (imports.length === 0) {
    return code; // No imports to rewrite
  }

  let rewrittenCode = code;
  const moduleDeclarations: string[] = [];
  const processedModules = new Set<string>();

  // Process imports in reverse order to maintain string positions
  for (let i = imports.length - 1; i >= 0; i--) {
    const imp = imports[i]!;
    const specifier = code.slice(imp.s, imp.e);

    // Non-bare specifiers will use regular browser imports
    if (!isBareSpecifier(specifier)) {
      continue;
    }

    const moduleRegistry = getModuleRegistry();
    if (!(specifier in moduleRegistry)) {
      throw new Error(`Unknown module "${specifier}". Allowed modules: ${Object.keys(moduleRegistry).join(', ')}`);
    }

    // Extract import details
    const importInfo = extractImportInfo(code, imp);

    let declaration = '';
    const moduleGlobal = moduleGlobalFromModuleName[importInfo.module as keyof typeof moduleGlobalFromModuleName];

    switch (importInfo.type) {
      case 'named': {
        // Import {draw, something} from 'replicad' -> const {draw, something} = globalThis.replicad;
        declaration = `const {${importInfo.imports.join(', ')}} = globalThis.${moduleGlobal};`;
        break;
      }

      case 'default': {
        // Import replicad from 'replicad' -> const replicad = globalThis.replicad;
        declaration = `const ${importInfo.defaultName} = globalThis.${moduleGlobal};`;
        break;
      }

      case 'namespace': {
        // Import * as replicad from 'replicad' -> const replicad = globalThis.replicad;
        declaration = `const ${importInfo.namespaceName} = globalThis.${moduleGlobal};`;
        break;
      }

      default: {
        const importType: never = importInfo;
        throw new Error(`Unknown import type: ${String(importType)}`);
      }
    }

    if (declaration && !processedModules.has(declaration)) {
      moduleDeclarations.push(declaration);
      processedModules.add(declaration);
    }

    // Remove the import statement
    const importStart = imp.ss;
    let importEnd = imp.se;

    // Check for and remove trailing semicolon and whitespace
    while (importEnd < rewrittenCode.length && /[;\s]/.test(rewrittenCode[importEnd]!)) {
      importEnd++;
    }

    rewrittenCode = rewrittenCode.slice(0, importStart) + rewrittenCode.slice(importEnd);
  }

  // Add module variable declarations at the top
  if (moduleDeclarations.length > 0) {
    rewrittenCode = moduleDeclarations.join('\n') + '\n' + rewrittenCode;
  }

  return rewrittenCode;
}

/**
 * Build a module evaluator.
 *
 * This is used to evaluate ESM code in a sandboxed environment.
 *
 * @param code - The code to build the module evaluator for
 * @param additionalModuleExports - Additional module exports to add to the module
 * @returns The module
 */
export async function buildEsModule(code: string): Promise<CadModuleExports> {
  try {
    // First rewrite imports to use global modules
    const rewrittenCode = await rewriteImports(code);

    // Include active kernel in cache key to prevent cross-kernel contamination
    const kernelId = getActiveKernelIdentifier();
    const cacheKey = `${kernelId}:${hashCode(rewrittenCode)}`;

    if (moduleCache.has(cacheKey)) {
      return moduleCache.get(cacheKey)!;
    }

    // Create blob and import the module
    const blob = new Blob([rewrittenCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    const module = (await import(/* @vite-ignore */ url)) as CadModuleExports;

    // Clean up blob URL
    URL.revokeObjectURL(url);

    // Cache the module with kernel-specific key
    moduleCache.set(cacheKey, module);

    return module;
  } catch (error) {
    console.error('Failed to build module evaluator:', error);
    console.error('Original code:', code);
    throw error;
  }
}

// Optional: clear module cache (e.g. for hot-reloading)
export function clearModuleCache(): void {
  moduleCache.clear();
}

/**
 * Run code in a context.
 *
 * This handles execution of CommonJS code with full module.exports and require support.
 *
 * @param code - The code to run
 * @param context - The context to run the code in
 * @returns The result of the code
 */
export function runInCjsContext<Context extends Record<string, unknown>, Result>(
  code: string,
  context: Context,
): Result {
  // Create a module object to capture exports
  const module: { exports: Record<string, unknown> } = { exports: {} };
  const { exports } = module;

  // Create a require function that resolves modules from the registry
  const require = (moduleName: string): unknown => {
    const moduleRegistry = getModuleRegistry();
    if (moduleName in moduleRegistry) {
      return moduleRegistry[moduleName];
    }

    throw new Error(`Module "${moduleName}" not found. Available modules: ${Object.keys(moduleRegistry).join(', ')}`);
  };

  // Inject module, exports, and require into the context
  const enhancedContext = {
    ...context,
    module,
    exports,
    require,
  };

  // Create context objects for the Function constructor
  const contextKeys = Object.keys(enhancedContext);
  const contextValues = contextKeys.map((key) => enhancedContext[key]);

  try {
    // Use Function constructor for faster execution (like original replicad)
    // This approach avoids using eval which is slower and has security implications
    // eslint-disable-next-line no-new-func -- TODO: review this
    const runFunction = new Function(...contextKeys, code) as (...args: unknown[]) => unknown;
    const functionResult = runFunction(...contextValues) as Result;

    // Return the function result if present, otherwise return module.exports
    return (functionResult ?? module.exports) as Result;
  } catch (error) {
    console.error('Error running code in context:', error);
    throw error;
  }
}
