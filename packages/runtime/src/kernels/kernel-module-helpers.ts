/**
 * Shared kernel module helpers.
 *
 * Deduplicated utility functions used by multiple kernel implementations.
 * These are pure functions with no kernel-specific dependencies.
 *
 * @public
 */

import type { KernelIssue } from '#types/runtime.types.js';
import type { KernelRuntime } from '#types/runtime-kernel.types.js';
import { isKernelIssueCode } from '#types/kernel-issue-codes.js';
import { isNode, resolveFileUrl } from '#framework/environment.js';
import { asBuffer } from '@taucad/utils/file';

// eslint-disable-next-line @typescript-eslint/naming-convention -- module-level constant
export const KERNEL_MODULES_KEY = '__KERNEL_MODULES__';

/**
 * Common shape for runtime module exports returned by `runtime.execute()`.
 * @public
 */
export type RuntimeModuleExports = {
  default?: (...args: unknown[]) => unknown;
  main?: (...args: unknown[]) => unknown;
  defaultParams?: Record<string, unknown>;
  defaultParameters?: Record<string, unknown>;
  defaultName?: string;
};

/**
 * Narrow guard for plain objects (excludes arrays and nulls).
 * @public
 */
export function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Get or create the global kernel module registry.
 *
 * The registry holds built-in module exports so that bundled user code
 * can import kernel-provided modules (e.g. `replicad`, `@jscad/modeling`).
 * @public
 */
export function getModuleRegistry(): Map<string, Record<string, unknown>> {
  let registry = (globalThis as Record<string, unknown>)[KERNEL_MODULES_KEY] as
    | Map<string, Record<string, unknown>>
    | undefined;
  if (!registry) {
    registry = new Map();
    (globalThis as Record<string, unknown>)[KERNEL_MODULES_KEY] = registry;
  }

  return registry;
}

export type KernelModuleShimOptions = {
  moduleExpression: string;
  exports: Record<string, unknown>;
  exportPrefix?: string;
};

export type RegisterKernelModuleOptions = {
  name: string;
  exports: Record<string, unknown>;
  version: string;
  globalName?: string;
  exportPrefix?: string;
};

/** Builds an ESM shim that exposes a registry-backed built-in kernel module. */
export function createKernelModuleShim({
  moduleExpression,
  exports,
  exportPrefix = '__kernel_export',
}: KernelModuleShimOptions): string {
  const exportNames = Object.keys(exports).filter((key) => key !== 'default' && isValidJavaScriptIdentifier(key));
  const namedExports = exportNames
    .map((key, index) => {
      const localName = `${exportPrefix}_${index}`;
      return `const ${localName} = __mod[${JSON.stringify(key)}];\nexport { ${localName} as ${key} };`;
    })
    .join('\n');

  return `const __mod = ${moduleExpression};\n${namedExports}\nexport default __mod;\n`;
}

/** Builds the JavaScript expression used by shims to read a module from the global registry. */
export function createKernelModuleRegistryExpression(name: string): string {
  return `globalThis.${KERNEL_MODULES_KEY}.get(${JSON.stringify(name)})`;
}

/** Registers a registry-backed built-in module with the runtime bundler. */
export function registerKernelModule(runtime: KernelRuntime, options: RegisterKernelModuleOptions): void {
  const registry = getModuleRegistry();
  registry.set(options.name, options.exports);

  runtime.bundler.registerModule(options.name, {
    code: createKernelModuleShim({
      moduleExpression: createKernelModuleRegistryExpression(options.name),
      exports: options.exports,
      exportPrefix: options.exportPrefix,
    }),
    version: options.version,
    globalName: options.globalName,
  });
}

function isValidJavaScriptIdentifier(value: string): boolean {
  return /^[$_a-z][\w$]*$/i.test(value);
}

/**
 * Extract `defaultParams` or `defaultParameters` from an executed module.
 * @public
 */
export function extractDefaultParameters(module: unknown): Record<string, unknown> {
  if (!isRecordObject(module)) {
    return {};
  }

  const params = module['defaultParams'] ?? module['defaultParameters'];
  return isRecordObject(params) ? params : {};
}

/**
 * Convert an absolute path to a relative path by stripping the base prefix.
 * @public
 */
export function resolveToRelative(absolutePath: string, basePath: string): string {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (absolutePath.startsWith(`${normalizedBase}/`)) {
    return absolutePath.slice(normalizedBase.length + 1);
  }

  return absolutePath;
}

/**
 * Convert raw build issues (from bundler/execute) to `KernelIssue` objects
 * with a fallback location when none is provided.
 *
 * Used by replicad and opencascade kernels that receive loosely-typed issue objects.
 * @public
 */
export function convertRawIssuesToKernelIssues(
  issues: Array<{ message: string; severity: string; location?: unknown; code?: unknown }>,
  fallbackFileName: string,
): KernelIssue[] {
  return issues.map((issue) => ({
    ...issue,
    message: issue.message,
    code: isKernelIssueCode(issue.code) ? issue.code : 'UNKNOWN',
    type: 'runtime',
    severity: issue.severity === 'warning' ? 'warning' : 'error',
    location: (issue.location as KernelIssue['location']) ?? {
      fileName: fallbackFileName,
      startLineNumber: 1,
      startColumn: 1,
    },
  }));
}

/**
 * Ensure each `KernelIssue` has a location, using a fallback when missing.
 *
 * Used by jscad and manifold kernels that already have typed issues.
 * @public
 */
export function enrichIssueLocation(issues: KernelIssue[], fallbackFileName: string): KernelIssue[] {
  return issues.map((issue) => ({
    ...issue,
    location: issue.location ?? {
      fileName: fallbackFileName,
      startLineNumber: 1,
      startColumn: 1,
    },
  }));
}

/**
 * Load a binary file polymorphically across browser and Node.js environments.
 *
 * Tries `fetch()` first (works in browsers and for HTTP URLs in Node.js).
 * Falls back to `node:fs/promises` for `file:` URLs in Node.js, where
 * the built-in `fetch()` (Undici) does not support the `file:` protocol.
 *
 * @param url - absolute URL to the binary file
 * @returns the file contents as an ArrayBuffer, or undefined if loading failed
 *
 * @public
 */
export async function loadBinaryFile(url: string): Promise<ArrayBuffer | undefined> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.arrayBuffer();
    }
  } catch {
    // Fetch failed — fall through to Node.js fs fallback
  }

  if (!isNode() || !url.startsWith('file:')) {
    return undefined;
  }

  try {
    const filePath = await resolveFileUrl(url);
    const { readFile } = await import('node:fs/promises');
    const buffer = await readFile(filePath);
    return asBuffer(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  } catch {
    return undefined;
  }
}
