/**
 * App-level aliases for the runtime client used across the UI.
 *
 * The UI owns a concrete runtime definition. Keep this alias projected from
 * that definition so app code keeps the runtime client's format-specific
 * render/export typing instead of erasing it.
 */

import type { RuntimeClient } from '@taucad/runtime';
import type { RuntimeClientOptionsWithTransport } from '@taucad/runtime/client';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import type { RuntimeKernels, RuntimeTranscoders } from '@taucad/runtime/worker';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';

/**
 * The runtime client type used throughout the UI app.
 *
 * Use this alias instead of inlining the runtime projection so that
 * downstream consumers have a single source of truth.
 */
export type AppRuntimeClient = RuntimeClient<RuntimeKernels<typeof runtime>, RuntimeTranscoders<typeof runtime>>;

export type AppRuntimeExportFormat = Parameters<AppRuntimeClient['export']>[0];

/**
 * Deferred-construction shape for typed runtime client options.
 *
 * The web-worker transport requires the file-system bridge handle and
 * the file-content `SharedArrayBuffer` to be supplied at construction
 * time, but both are owned by the file-manager machine and only
 * become available after it reaches `ready`. UI surfaces accept this
 * factory and invoke it inside the cad-machine's `connectKernelActor`
 * once the snapshot is in scope, keeping the runtime invariant that
 * `client.connect()` takes no arguments.
 */
export type KernelOptionsFactory = (deps: {
  readonly fileSystem: RuntimeFileSystem;
  readonly filePoolBuffer?: SharedArrayBuffer;
  readonly runtimeConfig: UiRuntimeConfigInput;
}) => RuntimeClientOptionsWithTransport<typeof runtime>;

export type PageKernelOptionsFactory = (
  deps: Omit<Parameters<KernelOptionsFactory>[0], 'runtimeConfig'>,
) => RuntimeClientOptionsWithTransport<typeof runtime>;

/**
 * Async loader for {@link KernelOptionsFactory}.
 *
 * Invoked from `connectKernelActor` after the file-manager worker is ready so
 * `@taucad/runtime` and `kernel-worker.constants` stay off the SSR eager graph.
 */
export type LazyKernelOptionsFactory = () => Promise<PageKernelOptionsFactory>;
