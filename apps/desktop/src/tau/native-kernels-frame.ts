/**
 * The control frame main posts the native kernels' sealed closures under (charter W6 phase 1). Kept apart from the
 * kernel-side mapping so main's bundle carries the frame's shape and nothing of the kernels.
 *
 * @module
 */
import type { ClosureLaunch } from '@taucad/runtime/preparation/node';

/** The control-frame `type` main posts the native composition under. */
export const nativeKernelsFrameType = 'tau:native-kernels';

/** One native kernel `tau-plugin.json` declares, as main found it in the store. */
export type NativeKernelSlot = {
  /** Kernel name, as the manifest's `kernels` row names it (`build123d`, `picogk`). */
  readonly kernel: string;
  readonly package: string;
  /** Extensions it handles, without the dot. */
  readonly extensions: readonly string[];
  /** The sealed closure it runs from, read from its launch index; absent when it has none. */
  readonly closure?: ClosureLaunch;
  /** Why it has no closure, quoted to whoever opens one of its files. */
  readonly refusal?: string;
};

/** The frame main posts once the store is seeded. */
export type NativeKernelsFrame = {
  readonly type: typeof nativeKernelsFrameType;
  /**
   * The payload store main seeded, by its real path. The utility's environment names no store (the staging channel
   * keeps its own), so a kernel the frame does not name is looked up here.
   */
  readonly store: string;
  readonly kernels: readonly NativeKernelSlot[];
};
