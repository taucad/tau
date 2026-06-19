/**
 * App-level aliases for the runtime client used across the UI.
 *
 * The UI does not statically know which kernels and transcoders it consumes
 * (the set is configured via runtime client options at startup), so these
 * aliases intentionally point to the wide-default erasure forms, matching
 * how the app accepts any plugin configuration configured at runtime.
 */

import type { RuntimeClient } from '@taucad/runtime';
import type { RuntimeClientOptionsWithTransport } from '@taucad/runtime/client';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import type { runtime } from '#runtime/ui-runtime.definition.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';

/**
 * The runtime client type used throughout the UI app.
 *
 * Use this alias instead of inlining the runtime projection so that
 * downstream consumers have a single source of truth.
 */
// oxlint-disable-next-line @typescript-eslint/no-explicit-any -- the UI stores an intentionally erased client; runtime capabilities gate broad file-extension workflows at runtime.
export type AppRuntimeClient = RuntimeClient<any, any>;

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
