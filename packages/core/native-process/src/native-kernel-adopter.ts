/**
 * The deployment contract of a native kernel package: what a host needs to prepare the package's closure (its
 * `tau-plugin.json`, package root, seal step and launch set) and what the kernel needs to bind to that closure (the
 * mapping from a sealed closure to its options). The deployment rides on the kernel registration the package's own
 * plugin produces, so listing the plugin in a runtime definition is the whole integration: a host discovers every
 * native kernel from its resolved runtime with `nativeDeploymentsOf` (`./store`) and names none.
 *
 * Browser-safe: no `node:*` import, and runtime types only.
 *
 * @module
 */
import type { ClosureLaunch, PreparationPlugin } from '@taucad/runtime/preparation/node';
import type { z } from 'zod';

/**
 * Host policy every native kernel's options accept on top of what its closure gives.
 * @public
 */
export type NativeKernelBounds = {
  /** Reject a request after this duration; zero waits for completion or cancellation. Milliseconds. */
  readonly requestTimeout?: number;
  /** The largest artifact the kernel may return, in bytes. */
  readonly maxArtifactBytes?: number;
};

/**
 * What a host needs of one native kernel package to prepare its closure, and what the kernel needs to bind to it.
 * Kernel ids, extensions and required dependencies come from `manifest`.
 * @public
 */
export type NativeKernelDeployment<
  Options extends Record<string, unknown> = Record<string, unknown>,
  Package extends string = string,
> = {
  /** The npm package name, such as `@taucad/build123d`; the `package` its receipts record. */
  readonly package: Package;
  /** The ecosystem of the projects the kernel owns, which picks their project template files. */
  readonly ecosystem: 'pypi' | 'nuget' | 'none';
  /** The package's unparsed `tau-plugin.json`, imported statically so a bundled host carries it. */
  readonly manifest: unknown;
  /** `file:` URL of the package root, with a trailing slash; payloads shipped inside the package resolve against it. */
  readonly packageRoot: string;
  /**
   * `file:` URL of the module that exports this deployment. It imports no kernel code, so a parent process that
   * learned of the deployment from another process re-imports it to run the seal step and the launch set.
   */
  readonly entry: string;
  /** The options a sealed closure maps to. */
  readonly optionsSchema: z.ZodType<Options>;
  /** Map a sealed closure (its receipt, or a launch view) to the kernel's options. */
  readonly optionsFromClosure: (closure: ClosureLaunch) => Options;
  /** The seal step the preparation host runs before it seals a closure, when the kernel has one. */
  readonly seal?: PreparationPlugin['seal'];
  /** The closure-relative paths every launch hashes, which the preparation host records in the launch index. */
  readonly launchSet: NonNullable<PreparationPlugin['launchSet']>;
};

const packageNamePattern = /^@[\d_a-z~-][\d._a-z~-]*\/[\d_a-z~-][\d._a-z~-]*$/u;

const isClosureRelative = (path: string): boolean =>
  path.length > 0 &&
  !path.startsWith('/') &&
  !path.includes('\\') &&
  path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');

const assertPackageName = (packageName: string, role: string): void => {
  if (!packageNamePattern.test(packageName)) {
    throw new TypeError(`A native kernel ${role}'s package must be a scoped npm package name, got '${packageName}'.`);
  }
};

const assertLaunchSet = (packageName: string, launchSet: NativeKernelDeployment['launchSet']): void => {
  const invalid = launchSet([]).filter((path) => !isClosureRelative(path));
  if (invalid.length > 0) {
    throw new TypeError(
      `${packageName}'s launch set must hold closure-relative POSIX paths, got ${invalid.map((path) => `'${path}'`).join(', ')}.`,
    );
  }
};

/**
 * Define a native kernel package's deployment. The options type follows `optionsFromClosure`; the schema must agree
 * with it. The package name stays a literal type.
 *
 * Export the result from a light module (the package's `/native` subpath) that imports no kernel code: a parent
 * process re-imports it by `entry` to prepare the kernel without loading it.
 *
 * @param input - The package, its ecosystem and `tau-plugin.json`, the defining module's `import.meta.url`, an optional
 *   package root (default: the directory above the defining module, which suits `src/native.ts` and
 *   `dist/native.mjs`), the options a sealed closure maps to, the seal step and the launch set.
 * @returns The deployment.
 * @throws {TypeError} When `package` is not a scoped npm package name, or the launch set of an empty closure holds a
 *   path that is not closure-relative.
 * @public
 * @example <caption>A Rust worker whose closure holds one executable</caption>
 * ```typescript
 * import { join } from 'node:path';
 *
 * import { defineNativeKernelDeployment } from '@taucad/native-process-core/adopter';
 * import { z } from 'zod';
 *
 * import manifest from '../tau-plugin.json' with { type: 'json' };
 *
 * export const rustcadNative = defineNativeKernelDeployment({
 *   package: '@acme/rustcad',
 *   ecosystem: 'none',
 *   manifest,
 *   moduleUrl: import.meta.url,
 *   optionsSchema: z.object({ executable: z.string(), runtimePath: z.string() }),
 *   optionsFromClosure: ({ root }) => ({ executable: join(root, 'bin', 'rustcad'), runtimePath: root }),
 *   launchSet: () => ['bin/rustcad'],
 * });
 * ```
 */
export const defineNativeKernelDeployment = <Options extends Record<string, unknown>, Package extends string>(input: {
  readonly package: Package;
  readonly ecosystem: NativeKernelDeployment['ecosystem'];
  readonly manifest: unknown;
  readonly moduleUrl: string;
  readonly packageRoot?: string;
  readonly optionsSchema: z.ZodType<NoInfer<Options>>;
  readonly optionsFromClosure: (closure: ClosureLaunch) => Options;
  readonly seal?: PreparationPlugin['seal'];
  readonly launchSet: NonNullable<PreparationPlugin['launchSet']>;
}): NativeKernelDeployment<Options, Package> => {
  assertPackageName(input.package, 'deployment');
  assertLaunchSet(input.package, input.launchSet);
  const { moduleUrl, packageRoot, seal, ...rest } = input;
  return {
    ...rest,
    packageRoot: new URL(packageRoot ?? '..', moduleUrl).href.replace(/\/?$/u, '/'),
    entry: moduleUrl,
    ...(seal && { seal }),
  };
};

/** The non-enumerable slot on a kernel registration that carries its deployment, shared by every copy of this package. */
const deploymentSlot: unique symbol = Symbol.for('@taucad/native-process-core/deployment');

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null;

/**
 * The extensions a deployment's `tau-plugin.json` declares for one kernel.
 * @param deployment - The deployment.
 * @param kernel - The kernel id.
 * @returns The extensions, or `undefined` when the manifest declares no such kernel.
 */
const manifestExtensions = (deployment: NativeKernelDeployment, kernel: string): readonly unknown[] | undefined => {
  const kernels = isRecord(deployment.manifest) ? deployment.manifest['kernels'] : undefined;
  const row = isRecord(kernels) && Object.hasOwn(kernels, kernel) ? kernels[kernel] : undefined;
  const extensions = isRecord(row) ? row['extensions'] : undefined;
  return Array.isArray(extensions) ? (extensions as readonly unknown[]) : undefined;
};

/**
 * Bind a deployment to a kernel factory: every registration the returned factory produces carries it. The factory's
 * own properties (the runtime's "accepts options" marker among them) are copied, so `definePlugin` accepts the
 * result exactly as it accepts the factory.
 *
 * @param factory - The kernel factory `defineKernel` returned.
 * @param deployment - The package's deployment.
 * @returns A factory with the same signature.
 * @throws {TypeError} When a registration's id is not a kernel of the deployment's `tau-plugin.json`, or the manifest
 *   does not declare one of its extensions; thrown when the factory is invoked.
 * @public
 * @example <caption>A kernel whose registrations carry the package's deployment</caption>
 * ```typescript
 * import { withNativeDeployment } from '@taucad/native-process-core/adopter';
 * import { defineKernel } from '@taucad/runtime/kernel';
 *
 * import { rustcadDefinition } from './rustcad.definition.js';
 * import { rustcadNative } from './native.js';
 *
 * export const rustcadKernel = withNativeDeployment(defineKernel(rustcadDefinition), rustcadNative);
 * ```
 */
export const withNativeDeployment = <
  Factory extends (...args: never[]) => { readonly id: string; readonly extensions: readonly string[] },
>(
  factory: Factory,
  deployment: NativeKernelDeployment,
): Factory => {
  const bound = (...args: Parameters<Factory>): { readonly id: string; readonly extensions: readonly string[] } => {
    const registration: { readonly id: string; readonly extensions: readonly string[] } = Reflect.apply(
      factory,
      undefined,
      args,
    );
    const declared = manifestExtensions(deployment, registration.id);
    const missing = registration.extensions.filter((extension) => !declared?.includes(extension));
    if (declared === undefined || missing.length > 0) {
      throw new TypeError(
        declared === undefined
          ? `${deployment.package}'s tau-plugin.json declares no kernel '${registration.id}'.`
          : `${deployment.package}'s tau-plugin.json does not declare kernel '${registration.id}' for ${missing.map((extension) => `'${extension}'`).join(', ')}.`,
      );
    }
    Object.defineProperty(registration, deploymentSlot, {
      value: deployment,
      enumerable: false,
      configurable: false,
      writable: false,
    });
    return registration;
  };
  for (const key of Reflect.ownKeys(factory)) {
    const descriptor = Object.getOwnPropertyDescriptor(factory, key);
    if (descriptor !== undefined && key !== 'prototype') {
      Object.defineProperty(bound, key, descriptor);
    }
  }
  return bound as unknown as Factory;
};

/**
 * The deployment a kernel registration carries. Works on the rows `resolveRuntimeDefinition(...).kernels` returns,
 * which are the registrations the plugins produced.
 * @param kernel - A kernel registration.
 * @returns Its deployment, or `undefined` for a kernel that is not native.
 * @public
 */
export const nativeDeploymentOf = (kernel: { readonly id: string }): NativeKernelDeployment | undefined => {
  const deployment: unknown = Reflect.get(kernel, deploymentSlot);
  return isRecord(deployment) && typeof deployment['package'] === 'string'
    ? (deployment as NativeKernelDeployment)
    : undefined;
};
