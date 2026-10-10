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
import type { BuiltinModule } from '#types/runtime-bundler-service.types.js';
import { isKernelIssueCode } from '#types/kernel-issue-codes.js';
import { isNode, resolveFileUrl } from '#framework/environment.js';
import { asBuffer } from '@taucad/utils/file';
import { assertRootedPath } from '@taucad/utils/path';
import { projectJsonSchemaToParameterDeclaration } from '@taucad/parameters';
import type { ParameterDeclaration } from '@taucad/parameters';
import type { JSONSchema7 } from '@taucad/json-schema';

/** @public */
// eslint-disable-next-line @typescript-eslint/naming-convention -- protocol global key mirrors its host name
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

/** Options for one registry-backed module shim. @public */
export type KernelModuleShimOptions = {
  moduleExpression: string;
  exports: Record<string, unknown>;
  exportPrefix?: string;
};

/** The `name` and `version` of an installed package, as its own `package.json` declares them. @public */
export type InstalledPackageManifest = {
  readonly name: string;
  readonly version: string;
};

/** Options for registering one built-in kernel module. @public */
export type RegisterKernelModuleOptions = {
  name: string;
  exports: Record<string, unknown>;
  globalName?: string;
  exportPrefix?: string;
} & (
  | {
      /**
       * `name` and `version` of the installed package the module comes from, as that package's own
       * `package.json` declares them. The module's `version` and npm `package` identity both derive
       * from it, so they cannot disagree.
       */
      package: InstalledPackageManifest;
      version?: never;
    }
  | { version: string; package?: never }
);

/**
 * Npm identity of a bare specifier's package: the dependency key is the specifier's package name
 * (`manifold-3d/manifoldCAD` → `manifold-3d`), and the spec is the installed version, or an
 * `npm:` alias when the installed package publishes under another name (a fork such as
 * `@taulabs/replicad` imported as `replicad`).
 *
 * @internal
 */
export function toBuiltinModulePackage(
  specifier: string,
  installed: InstalledPackageManifest,
): NonNullable<BuiltinModule['package']> {
  const name = specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');
  return { name, spec: installed.name === name ? installed.version : `npm:${installed.name}@${installed.version}` };
}

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

/** Builds the JavaScript expression used by shims to read a module from the global registry. @public */
export function createKernelModuleRegistryExpression(name: string): string {
  return `globalThis.${KERNEL_MODULES_KEY}.get(${JSON.stringify(name)})`;
}

/** Registers a registry-backed built-in module with the runtime bundler. @public */
export function registerKernelModule(
  runtime: Pick<KernelServices, 'bundler'>,
  options: RegisterKernelModuleOptions,
): void {
  const registry = getModuleRegistry();
  registry.set(options.name, options.exports);

  runtime.bundler.registerModule(options.name, {
    code: createKernelModuleShim({
      moduleExpression: createKernelModuleRegistryExpression(options.name),
      exports: options.exports,
      exportPrefix: options.exportPrefix,
    }),
    globalName: options.globalName,
    ...(options.package
      ? { version: options.package.version, package: toBuiltinModulePackage(options.name, options.package) }
      : { version: options.version }),
  });
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
