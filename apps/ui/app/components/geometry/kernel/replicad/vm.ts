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
import type { CadModuleExports } from '~/types/cad.js';
import { hashCode } from '~/utils/crypto.js';

// Module cache
const moduleCache = new Map<string, CadModuleExports>();

// Module registry (singleton modules pre-loaded in worker scope)
const moduleRegistry: Record<string, unknown> = {
  // These are instantiated in the worker scope
  // @ts-expect-error - globalThis is not typed
  replicad: globalThis.replicad,
  // @ts-expect-error - globalThis is not typed
  zod: globalThis.zod,
  // Add more modules here
};

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

  // Match different import patterns
  const namedImportMatch = /import\s*{\s*([^}]+)\s*}\s*from\s*['"`]([^'"`]+)['"`]/.exec(fullImportText);
  const defaultImportMatch = /import\s+(\w+)\s+from\s*['"`]([^'"`]+)['"`]/.exec(fullImportText);
  const namespaceImportMatch = /import\s*\*\s*as\s+(\w+)\s+from\s*['"`]([^'"`]+)['"`]/.exec(fullImportText);

  if (namedImportMatch) {
    const imports = namedImportMatch[1].split(',').map((imp) => imp.trim());
    const module = namedImportMatch[2];
    return { type: 'named', imports, module };
  }

  if (defaultImportMatch) {
    const defaultName = defaultImportMatch[1];
    const module = defaultImportMatch[2];
    return { type: 'default', defaultName, module };
  }

  if (namespaceImportMatch) {
    const namespaceName = namespaceImportMatch[1];
    const module = namespaceImportMatch[2];
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
    const imp = imports[i];
    const specifier = code.slice(imp.s, imp.e);

    // Non-bare specifiers will use regular browser imports
    if (!isBareSpecifier(specifier)) continue;

    if (!(specifier in moduleRegistry)) {
      throw new Error(`Unknown module "${specifier}". Allowed modules: ${Object.keys(moduleRegistry).join(', ')}`);
    }

    // Extract import details
    const importInfo = extractImportInfo(code, imp);

    if (importInfo) {
      let declaration = '';

      switch (importInfo.type) {
        case 'named': {
          // Import {draw, something} from 'replicad' -> const {draw, something} = globalThis.replicad;
          declaration = `const {${importInfo.imports.join(', ')}} = globalThis.${importInfo.module};`;
          break;
        }

        case 'default': {
          // Import replicad from 'replicad' -> const replicad = globalThis.replicad;
          declaration = `const ${importInfo.defaultName} = globalThis.${importInfo.module};`;
          break;
        }

        case 'namespace': {
          // Import * as replicad from 'replicad' -> const replicad = globalThis.replicad;
          declaration = `const ${importInfo.namespaceName} = globalThis.${importInfo.module};`;
          break;
        }

        // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- exhaustive check for safety
        default: {
          const importType: never = importInfo;
          throw new Error(`Unknown import type: ${String(importType)}`);
        }
      }

      if (declaration && !processedModules.has(declaration)) {
        moduleDeclarations.push(declaration);
        processedModules.add(declaration);
      }
    } else {
      // Fallback for unrecognized import patterns
      const moduleName = specifier;
      const declaration = `const ${moduleName} = globalThis.${moduleName};`;
      if (!processedModules.has(declaration)) {
        moduleDeclarations.push(declaration);
        processedModules.add(declaration);
      }
    }

    // Remove the import statement
    const importStart = imp.ss;
    const importEnd = imp.se;
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
 * @returns The module
 */
export async function buildEsModule(code: string): Promise<CadModuleExports> {
  try {
    // First rewrite imports to use global modules
    const rewrittenCode = await rewriteImports(code);

    const cacheKey = hashCode(rewrittenCode);
    if (moduleCache.has(cacheKey)) {
      console.log('Using cached module evaluator');
      return moduleCache.get(cacheKey)!;
    }

    console.log('Building new module evaluator');
    const startTime = performance.now();

    // Create blob and import the module
    const blob = new Blob([rewrittenCode], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    const module = (await import(/* @vite-ignore */ url)) as CadModuleExports;

    // Clean up blob URL
    URL.revokeObjectURL(url);

    // Cache the module
    moduleCache.set(cacheKey, module);

    const endTime = performance.now();
    console.log(`Module evaluator built in ${endTime - startTime}ms`);

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
 * This handles execution of CommonJS code.
 *
 * @param code - The code to run
 * @param context - The context to run the code in
 * @returns The result of the code
 */
export function runInCjsContext<Context extends Record<string, unknown>, Result>(
  code: string,
  context: Context,
): Result {
  // Create context objects for the Function constructor
  const contextKeys = Object.keys(context);
  const contextValues = contextKeys.map((key) => context[key]);

  try {
    // Use Function constructor for faster execution (like original replicad)
    // This approach avoids using eval which is slower and has security implications
    // eslint-disable-next-line no-new-func -- TODO: review this
    const runFunction = new Function(...contextKeys, code) as (...args: unknown[]) => unknown;
    const functionResult = runFunction(...contextValues) as Result;

    return functionResult;
  } catch (error) {
    console.error('Error running code in context:', error);
    throw error;
  }
}
