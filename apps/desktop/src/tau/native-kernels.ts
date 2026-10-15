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
import { build123dOptionsFromClosure } from '@taucad/build123d';
import type { Build123dClosureOptions } from '@taucad/build123d';
import { installNativeRuntimeVerifier } from '@taucad/native-process-core';
import type { NativeRuntimeVerifier } from '@taucad/native-process-core';
import { picogkOptionsFromClosure } from '@taucad/picogk';
import type { PicogkKernelOptions } from '@taucad/picogk';
import { createKernelError, defineKernel } from '@taucad/runtime/kernel';
import type { KernelIssue } from '@taucad/runtime/kernel';
import { definePlugin } from '@taucad/runtime/plugin';
import type { PluginInstance } from '@taucad/runtime/plugin';
import { reverifyClosure } from '@taucad/runtime/preparation/node';

import { nativeKernelsFrameType } from '#tau/native-kernels-frame.js';
import type { NativeKernelsFrame, NativeKernelSlot } from '#tau/native-kernels-frame.js';

/** The native kernel options a desktop runtime composes. */
export type DesktopNativeKernels = {
  readonly build123d?: Build123dClosureOptions;
  readonly picogk?: PicogkKernelOptions;
  /** A stand-in for every declared native kernel without a closure, answering its files with the refusal. */
  readonly unavailable?: PluginInstance;
};

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
 * @param root - The worker's closure root.
 * @param signal - Aborts the re-verification.
 * @returns The damaged files and the remedy, or `undefined` when the closure is intact.
 */
export const verifyDesktopClosure: NativeRuntimeVerifier = async (root, signal) => {
  const files = await reverifyClosure(root, signal);
  if (files?.length === 0) {
    return undefined;
  }
  return {
    files: files ?? ['receipt.json'],
    remedy: `Quit Tau, remove ${root} and open Tau again to restore it from the app, or run \`tau prepare --verify\`.`,
  };
};

const unavailableKernel = (slot: NativeKernelSlot) => {
  const issue = (entryPath: string): KernelIssue => ({
    code: 'KERNEL_NOT_PREPARED',
    type: 'kernel',
    severity: 'error',
    message: slot.refusal ?? `The ${slot.kernel} runtime is not installed on this machine.`,
    details: { kernel: slot.kernel, package: slot.package, entryPath },
  });
  return defineKernel({
    id: slot.kernel,
    extensions: slot.extensions as [string, ...string[]],
    name: `${slot.kernel} (unavailable)`,
    version: '0',
    views: {},
    exports: {},
    async initialize() {
      return undefined;
    },
    async resolve() {
      return { resolved: [], unresolved: [] };
    },
    async describe({ entryPath }) {
      return createKernelError([issue(entryPath)]);
    },
    async evaluate({ entryPath }) {
      const error = new Error(issue(entryPath).message);
      throw Object.assign(error, { issues: [issue(entryPath)] });
    },
  });
};

/**
 * Map main's frame to kernel options: a sealed closure gives its kernel's options and installs the re-verifier; a
 * kernel without one is answered by a stand-in that refuses its files with main's reason.
 * @param frame - What main posted.
 * @returns The options and the stand-in plugin, if any.
 */
export const desktopNativeKernels = (frame: NativeKernelsFrame): DesktopNativeKernels => {
  const kernels: { build123d?: Build123dClosureOptions; picogk?: PicogkKernelOptions } = {};
  const missing: NativeKernelSlot[] = [];
  for (const slot of frame.kernels) {
    if (slot.closure !== undefined && slot.package === '@taucad/build123d') {
      kernels.build123d = build123dOptionsFromClosure(slot.closure);
    } else if (slot.closure !== undefined && slot.package === '@taucad/picogk') {
      kernels.picogk = picogkOptionsFromClosure(slot.closure);
    } else if (slot.extensions.length > 0) {
      missing.push(slot);
    }
  }
  if (kernels.build123d !== undefined || kernels.picogk !== undefined) {
    installNativeRuntimeVerifier(verifyDesktopClosure);
  }
  if (missing.length === 0) {
    return kernels;
  }
  const unavailable = definePlugin({
    meta: { name: '@taucad/desktop/unavailable-native-kernels' },
    kernels: Object.fromEntries(missing.map((slot) => [slot.kernel, unavailableKernel(slot)])),
    presets: { default: missing.map((slot): `kernels.${string}` => `kernels.${slot.kernel}`) },
  });
  return { ...kernels, unavailable: unavailable() };
};
