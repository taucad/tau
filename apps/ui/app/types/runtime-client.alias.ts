/**
 * App-level aliases for the runtime client used across the UI.
 *
 * The UI can connect to browser-authored or independently hosted runtimes.
 * Variable app state therefore uses the runtime's host-neutral client shape,
 * while local option authoring remains projected from the exact browser runtime.
 */

import type { RuntimeClient } from '@taucad/runtime';
import type { RuntimeClientOptionsWithTransport } from '@taucad/runtime/client';
import type { ComputeBinding } from '@taucad/runtime';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';

/**
 * The runtime client type used throughout the UI app.
 *
 * Use this alias instead of inlining the runtime projection so that
 * downstream consumers have a single source of truth.
 */
export type AppRuntimeClient = RuntimeClient;

export type AppCapabilitiesManifest = NonNullable<AppRuntimeClient['capabilities']>;

/**
 * Deferred-construction shape for typed runtime client options.
 *
 * The web-worker transport requires the opaque project filesystem to be
 * supplied at construction time, but it is owned by the file-manager machine and only
 * become available after it reaches `ready`. UI surfaces accept this
 * factory and invoke it inside the cad-machine's `connectKernelActor`
 * once the snapshot is in scope, keeping the runtime invariant that
 * `client.connect()` takes no arguments.
 */
export type KernelOptionsFactory = (deps: {
  readonly fileSystem: RuntimeFileSystem;
  readonly runtimeConfig: UiRuntimeConfigInput;
  readonly compute?: ComputeBinding;
}) => RuntimeClientOptionsWithTransport<typeof runtime>;

export type PageKernelOptionsFactory = (
  deps: Omit<Parameters<KernelOptionsFactory>[0], 'runtimeConfig'>,
) => RuntimeClientOptionsWithTransport;

/**
 * Async loader for {@link KernelOptionsFactory}.
 *
 * Invoked from `connectKernelActor` after the file-manager worker is ready so
 * `@taucad/runtime` and `kernel-worker.constants` stay off the SSR eager graph.
 */
export type LazyKernelOptionsFactory = () => Promise<PageKernelOptionsFactory>;
