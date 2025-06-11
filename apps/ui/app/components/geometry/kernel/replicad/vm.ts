// Simple VM implementation for running user code in a sandboxed environment

import type { CadModuleExports } from '~/types/cad.js';
import { hashCode } from '~/utils/crypto.js';

// Cache for module evaluators to avoid repeated compilation
const moduleCache = new Map<string, CadModuleExports>();

/**
 * Run code in a VM-like context with the provided context
 */
export function runInContext<Context extends Record<string, unknown>, Result>(code: string, context: Context): Result {
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

/**
 * Builds a module evaluator for the given code
 * Caches modules to avoid repeated compilation
 */
export async function buildModuleEvaluator(code: string): Promise<CadModuleExports> {
  // Check cache first
  const cacheKey = hashCode(code);
  if (moduleCache.has(cacheKey)) {
    console.log('Using cached module evaluator');
    return moduleCache.get(cacheKey)!;
  }

  console.log('Building new module evaluator');
  const startTime = performance.now();

  try {
    // Create a blob URL for the module code
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);

    // Import the module dynamically
    const module = (await import(/* @vite-ignore */ url)) as CadModuleExports;

    // Cache the module for future use
    moduleCache.set(cacheKey, module);

    // Clean up the blob URL
    URL.revokeObjectURL(url);

    const endTime = performance.now();
    console.log(`Module evaluator built in ${endTime - startTime}ms`);

    return module;
  } catch (error) {
    console.error('Failed to build module evaluator:', error);
    throw error;
  }
}
