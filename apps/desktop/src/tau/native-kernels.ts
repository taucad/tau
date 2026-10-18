/**
 * What the kernel utility composes its native kernels from (charter W6 phase 1, D8).
 *
 * Main seeds the payload store and reads each sealed closure's launch index, then posts one control frame naming the
 * closure every native kernel runs from, or why it has none. The broker replays the frame to every utility right after
 * its boot frame, and the desktop runtime awaits it before it composes, so a utility forked while main is still
 * seeding waits for the closures instead of composing without them. The utility never reads the store's receipts
 * itself; it re-verifies a closure only when a worker exits before its handshake, so the refusal names the damage.
 *
 * @module
 */
import { nativeCompositionSchema, nativeKernelAdopters, unavailableKernelsPlugin } from '@taucad/native-kernels';
import type { UnavailableNativeKernel } from '@taucad/native-kernels';
import { composeNativePlugins, verifyStoreClosure } from '@taucad/native-kernels/node';
import { installNativeRuntimeVerifier } from '@taucad/native-process-core';
import type { PluginInstance } from '@taucad/runtime/plugin';

import { nativeKernelsFrameType } from '#tau/native-kernels-frame.js';
import type { NativeKernelsFrame } from '#tau/native-kernels-frame.js';

/*
 * Desktop host policy for every native request (D-DT-02). The kernels default to
 * no deadline and no artifact bound, so one runaway script could hold all memory
 * for as long as it ran; a request past the deadline recycles its worker, which
 * returns the Python or CoreCLR heap to the system. Ten minutes matches the
 * geometry slot's suite deadline; no artifact the viewer or an export reads is
 * near a gibibyte, and `readFile` cannot read past two.
 */
const nativeRequestTimeoutMilliseconds = 10 * 60_000;
const nativeMaxArtifactBytes = 1024 * 1024 * 1024;
const nativeBounds = {
  requestTimeout: nativeRequestTimeoutMilliseconds,
  maxArtifactBytes: nativeMaxArtifactBytes,
} as const;

const isFrame = (value: unknown): value is NativeKernelsFrame =>
  typeof value === 'object' &&
  value !== null &&
  Reflect.get(value, 'type') === nativeKernelsFrameType &&
  Array.isArray(Reflect.get(value, 'kernels'));

let deliver: ((frame: NativeKernelsFrame) => void) | undefined;
const received = new Promise<NativeKernelsFrame>((resolve) => {
  deliver = resolve;
});

/**
 * Hand this process the composition main posted. The first frame wins: a runtime composes once per utility, and main
 * posts once per launch.
 * @param message - Any message from main; other frames are ignored.
 */
export const receiveNativeKernels = (message: unknown): void => {
  if (isFrame(message)) {
    deliver?.(message);
    deliver = undefined;
  }
};

/**
 * The composition main posted, once it arrives.
 * @returns The frame.
 */
export const awaitNativeKernels = async (): Promise<NativeKernelsFrame> => received;

/**
 * D8: a native worker that exits before its handshake re-verifies the closure it ran from against the receipt beside
 * it, so the refusal names the damaged file.
 */
export const verifyDesktopClosure = verifyStoreClosure(
  (_files, root) =>
    `Quit Tau, remove ${root} and open Tau again to restore it from the app, or run \`tau prepare --verify\`.`,
);

/**
 * Map main's frame to plugins: a sealed closure gives its kernel's options through the roster's adopter, bounded by
 * the desktop's policy, and installs the re-verifier; a kernel without one is answered by the roster's stand-in, which
 * refuses its files with main's reason.
 * @param frame - What main posted.
 * @returns The native plugins in roster order, then the stand-in, if any.
 */
export const desktopNativeKernels = async (frame: NativeKernelsFrame): Promise<readonly PluginInstance[]> => {
  const composed: unknown[] = [];
  const missing: UnavailableNativeKernel[] = [];
  for (const slot of frame.kernels) {
    const adopter = nativeKernelAdopters.find((candidate) => candidate.package === slot.package);
    if (slot.closure !== undefined && adopter !== undefined) {
      composed.push({
        package: adopter.package,
        kernel: slot.kernel,
        closureRoot: slot.closure.root,
        options: adopter.optionsFromClosure(slot.closure),
      });
    } else if (slot.extensions.length > 0) {
      missing.push({
        kernel: slot.kernel,
        package: slot.package,
        extensions: slot.extensions,
        reason: 'not-prepared',
        byteLength: 0,
        refusal: slot.refusal ?? `The ${slot.kernel} runtime is not installed on this machine.`,
      });
    }
  }
  /* Each row is checked against its adopter's options schema, which also types it by package. */
  const { kernels } = nativeCompositionSchema.parse({ kernels: composed, unavailable: [], closureRoots: [] });
  if (kernels.length > 0) {
    installNativeRuntimeVerifier(verifyDesktopClosure);
  }
  const unavailable = unavailableKernelsPlugin(missing);
  return [...(await composeNativePlugins(kernels, nativeBounds)), ...(unavailable ? [unavailable] : [])];
};
