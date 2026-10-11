/**
 * Shared kernel module helpers.
 *
 * Deduplicated utility functions used by multiple kernel implementations.
 * These are pure functions with no kernel-specific dependencies.
 *
 * @public
 */

import type { KernelIssue } from '#types/runtime.types.js';
import type { KernelServices } from '#types/runtime-kernel-v2.types.js';
import { isKernelIssueCode } from '#types/kernel-issue-codes.js';
import { isNode, resolveFileUrl } from '#framework/environment.js';
import { asBuffer } from '@taucad/utils/file';
import { assertRootedPath } from '@taucad/utils/path';
import { projectJsonSchemaToParameterDeclaration } from '@taucad/parameters';
import type { ParameterDeclaration } from '@taucad/parameters';
import type { JSONSchema7 } from '@taucad/json-schema';

// eslint-disable-next-line @typescript-eslint/naming-convention -- protocol global key mirrors its host name
const KERNEL_MODULES_KEY = '__KERNEL_MODULES__';

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
 * Get or create the realm's kernel module registry.
 *
 * The registry holds built-in module exports, keyed by kernel worker scope, so that bundled user code
 * can import kernel-provided modules (e.g. `replicad`, `@jscad/modeling`). Only
 * {@link registerKernelModule} and its shims read or write it.
 * @internal
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

/** Options for one registry-backed module shim. @public */
export type KernelModuleShimOptions = {
  moduleExpression: string;
  exports: Record<string, unknown>;
  exportPrefix?: string;
};

/** Options for registering one built-in kernel module. @public */
export type RegisterKernelModuleOptions = {
  name: string;
  exports: Record<string, unknown>;
  version: string;
  globalName?: string;
  exportPrefix?: string;
  /**
   * Expose one property of `exports` as the module instead of the whole object, for subpath
   * modules such as `@jscad/modeling/booleans` (`exportPath: 'booleans'`).
   */
  exportPath?: string;
};

/** Builds an ESM shim that exposes a registry-backed built-in kernel module. @public */
export function createKernelModuleShim({
  moduleExpression,
  exports,
  exportPrefix = '__kernel_export',
}: KernelModuleShimOptions): string {
  const exportNames = Object.keys(exports).filter((key) => key !== 'default' && isValidJavaScriptIdentifier(key));
  const namedExports = exportNames
    .map((key, index) => {
      const localName = isSafeBindingIdentifier(key) ? key : `${exportPrefix}_${index}`;
      const exportClause = localName === key ? localName : `${localName} as ${key}`;
      return `const ${localName} = __mod[${JSON.stringify(key)}];\nexport { ${exportClause} };`;
    })
    .join('\n');

  return `const __mod = ${moduleExpression};\n${namedExports}\nexport default __mod;\n`;
}

/** Builds the JavaScript expression shims use to read one registry entry. */
function createKernelModuleRegistryExpression(name: string): string {
  return `globalThis.${KERNEL_MODULES_KEY}.get(${JSON.stringify(name)})`;
}

/**
 * Registers a registry-backed built-in module with the runtime bundler.
 *
 * The entry is scoped to the bundler's kernel worker (`bundler.registryScope`), so two workers in
 * one realm that register the same name each resolve their own exports.
 * @public
 */
export function registerKernelModule(
  runtime: Pick<KernelServices, 'bundler'>,
  options: RegisterKernelModuleOptions,
): void {
  const exports = options.exportPath === undefined ? options.exports : options.exports[options.exportPath];
  if (!isRecordObject(exports)) {
    throw new TypeError(`Kernel module "${options.name}" export path "${options.exportPath}" is not an object.`);
  }
  const { registryScope } = runtime.bundler;
  const key = registryScope === undefined ? options.name : `${registryScope}:${options.name}`;
  getModuleRegistry().set(key, exports);

  const registryExpression = createKernelModuleRegistryExpression(key);
  runtime.bundler.registerModule(options.name, {
    code: createKernelModuleShim({
      moduleExpression: registryExpression,
      exports,
      exportPrefix: options.exportPrefix,
    }),
    version: options.version,
    globalName: options.globalName,
    registryExpression,
  });
}

/**
 * Drop every built-in module a kernel worker registered under `registryScope`.
 * @param registryScope - The worker's scope, as carried by its bundler facade.
 * @internal
 */
export function releaseKernelModuleScope(registryScope: string): void {
  const registry = getModuleRegistry();
  for (const key of registry.keys()) {
    if (key.startsWith(`${registryScope}:`)) {
      registry.delete(key);
    }
  }
}

function isValidJavaScriptIdentifier(value: string): boolean {
  return /^[$_a-z][\w$]*$/i.test(value);
}

const reservedBindingIdentifiers = new Set([
  'arguments',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'eval',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

function isSafeBindingIdentifier(value: string): boolean {
  return value !== '__mod' && isValidJavaScriptIdentifier(value) && !reservedBindingIdentifiers.has(value);
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
 * Create an admitted native declaration from a kernel producer's JSON Schema.
 * @param defaults - Producer defaults in native coordinates.
 * @param schema - Producer JSON Schema, Draft-07 or 2020-12 as its `$schema` declares, with optional OGC keywords.
 * @param identity - Caller-owned stable schema identity and name.
 * @returns An admitted immutable native parameter declaration.
 * @public
 */
export const createKernelParameterDeclaration = (
  defaults: Readonly<Record<string, unknown>>,
  schema: JSONSchema7 | Readonly<Record<string, unknown>>,
  identity: Readonly<{ id: string; name: string }>,
): ParameterDeclaration =>
  projectJsonSchemaToParameterDeclaration({
    defaults,
    schema,
    schemaId: identity.id,
    schemaName: identity.name,
  });

/**
 * Validate and return the canonical project-local entry path required by the
 * JavaScript VM adapter.
 * @public
 */
export const toVmEntryPath = (rootedPath: string): string => assertRootedPath(rootedPath);

/**
 * Convert raw build issues (from bundler/execute) to `KernelIssue` objects
 * with a fallback location when none is provided.
 *
 * Used by replicad and opencascade kernels that receive loosely-typed issue objects.
 * @public
 */
export function convertRawIssuesToKernelIssues(
  issues: Array<{
    message: string;
    severity: string;
    location?: unknown;
    code?: unknown;
  }>,
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
