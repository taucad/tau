/**
 * The CLI's side of the native kernel roster: `@taucad/native-kernels` owns the roster, composition and preparation;
 * this module injects the CLI's payload store and managed profile, and maps refusals to CLI errors and exit codes.
 *
 * @module
 */
import { defaultPayloadStore } from '@taucad/host';
import type { NativeKernelComposition, UnavailableNativeKernel } from '@taucad/native-kernels';
import {
  composeNativeKernels as composeFromStore,
  nativeKernelFor as nativeKernelFromStore,
  nativePreparationPlugins as rosterPreparationPlugins,
  openNativePreparation as openRosterPreparation,
  UnknownNativeKernelError,
  verifyStoreClosure as storeClosureVerifier,
} from '@taucad/native-kernels/node';
import type { NativePreparation, NativeStoreInput } from '@taucad/native-kernels/node';
import { readManagedPreparation } from '@taucad/runtime/preparation/node';
import type { ManagedPreparation, PreparationPlugin } from '@taucad/runtime/preparation/node';

import { cliError, exitCodes } from '#output.js';

/**
 * D8: a native worker that exits before its handshake re-verifies its closure against the receipt beside it, so the
 * refusal names the damaged file and the `tau prepare` call that repairs it.
 */
export const verifyStoreClosure = storeClosureVerifier((files) =>
  files === undefined ? 'Run `tau prepare` for the kernel to rebuild it.' : 'Run `tau prepare --verify` to repair it.',
);

/**
 * The managed acquisition profile from the environment.
 * @returns The profile.
 * @throws {Error} `MANAGED_PROFILE_INVALID` (exit 2) when a variable is malformed.
 */
export const readManaged = (): ManagedPreparation => {
  try {
    return readManagedPreparation(process.env);
  } catch (error) {
    throw cliError('MANAGED_PROFILE_INVALID', error instanceof Error ? error.message : String(error), exitCodes.usage);
  }
};

const storeInput = (): NativeStoreInput => ({ store: defaultPayloadStore(), managed: readManaged() });

/**
 * The native plugins this CLI can prepare, with their seal steps and package directories, in roster order.
 * @returns The roster.
 */
export const nativePreparationPlugins = (): readonly PreparationPlugin[] =>
  rosterPreparationPlugins({ directory: 'resolve' });

/**
 * Every kernel `prepare_kernel` and `tau prepare` take, with the extensions it handles, in roster order.
 * @returns One row per declared kernel.
 */
export const preparableKernels = (): ReadonlyArray<{
  readonly kernel: string;
  readonly extensions: readonly string[];
}> =>
  rosterPreparationPlugins().flatMap(({ deployment }) =>
    Object.entries(deployment.kernels).map(([kernel, { extensions }]) => ({ kernel, extensions })),
  );

/** Why the native kernel for an input could not be composed. */
export type UnpreparedNativeKernel = {
  readonly code: 'KERNEL_NOT_PREPARED' | 'UNSUPPORTED_TARGET';
  readonly message: string;
};

const unpreparedFor = (row: UnavailableNativeKernel): UnpreparedNativeKernel =>
  row.reason === 'unsupported-target'
    ? { code: 'UNSUPPORTED_TARGET', message: row.detail ?? `${row.kernel} cannot run on this machine.` }
    : {
        code: 'KERNEL_NOT_PREPARED',
        message: `The ${row.kernel} kernel is not prepared on this machine. Run \`tau prepare ${row.kernel}\` once, then export again.`,
      };

/**
 * The native kernel whose `tau-plugin.json` row handles an input, read from the store's launch index alone: nothing is
 * downloaded, and an input no native kernel handles leaves the store untouched.
 * @param extension - The input file's extension, without the dot.
 * @returns The composition holding the prepared kernel, the typed refusal when it is not prepared, or `undefined` when
 *   no native kernel handles the extension.
 */
export const nativeKernelFor = async (
  extension: string,
): Promise<NativeKernelComposition | UnpreparedNativeKernel | undefined> => {
  const row = await nativeKernelFromStore({ ...storeInput(), extension });
  if (row === undefined) {
    return undefined;
  }
  if ('reason' in row) {
    return unpreparedFor(row);
  }
  return { kernels: [row], unavailable: [], closureRoots: [row.closureRoot] };
};

/**
 * Compose every native kernel in the roster from the CLI's payload store: a sealed closure gives its kernel's options,
 * and any other state gives the refusal the runtime answers that kernel's files with. Launch indexes only, so this is
 * a per-launch cost (I11).
 * @returns The composition.
 */
export const composeNativeKernels = async (): Promise<NativeKernelComposition> => composeFromStore(storeInput());

/**
 * Open the preparation host `tau mcp` and `tau serve` prepare through: the roster with its seal steps, the shared
 * store and the managed profile, with the process's unrestricted `fetch` (D4).
 * @param options - The transport, for tests.
 * @returns The preparation and its disposal; preparing an unknown kernel throws `UNKNOWN_KERNEL` (exit 2).
 */
export const openNativePreparation = (options: { readonly fetch?: typeof fetch } = {}): NativePreparation => {
  let opened: NativePreparation | undefined;
  const open = (): NativePreparation => {
    opened ??= openRosterPreparation({
      ...storeInput(),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    return opened;
  };
  return {
    prepare: async (kernel, context) => {
      try {
        return await open().prepare(kernel, context);
      } catch (error) {
        if (error instanceof UnknownNativeKernelError) {
          throw cliError(error.code, error.message, exitCodes.usage);
        }
        throw error;
      }
    },
    dispose: async () => opened?.dispose(),
  };
};

/**
 * The kernels a tool result refuses as not prepared: every `KERNEL_NOT_PREPARED` issue's `details.kernel`, wherever
 * the tool placed its issues.
 * @param value - A tool result's content.
 * @param found - Accumulator.
 * @returns The kernel names.
 */
export const refusedKernels = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) {
    for (const item of value) {
      refusedKernels(item, found);
    }
    return found;
  }
  if (typeof value !== 'object' || value === null) {
    return found;
  }
  const details: unknown = Reflect.get(value, 'details');
  const kernel: unknown = typeof details === 'object' && details !== null ? Reflect.get(details, 'kernel') : undefined;
  if (Reflect.get(value, 'code') === 'KERNEL_NOT_PREPARED' && typeof kernel === 'string') {
    found.add(kernel);
  }
  for (const child of Object.values(value)) {
    refusedKernels(child, found);
  }
  return found;
};
