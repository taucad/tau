/**
 * The control frame main posts the native kernels' sealed closures under (charter W6). Kept apart from the
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
  /** Why it cannot run at all (main could not open the store), quoted to whoever opens one of its files. */
  readonly refusal?: string;
};

/** The frame main posts once it has read the store at startup. */
export type NativeKernelsFrame = {
  readonly type: typeof nativeKernelsFrameType;
  /**
   * The dependency store main read, by its real path. The utility's environment names no store (the staging channel
   * keeps its own), so a kernel the frame does not name is looked up here.
   */
  readonly store: string;
  readonly kernels: readonly NativeKernelSlot[];
  /**
   * Windows only: the sandbox helper and journal directory main composed, present only when the Windows sandbox is
   * enabled and its helper is bundled. The utility's environment carries no `TAU_` names, so main decides once and every
   * kernel utility contains its native workers through the same helper. Absent, a native launch on Windows is
   * unavailable.
   */
  readonly windowsSandbox?: DesktopWindowsNativeSandbox;
};

/** Where the Windows native sandbox's helper and launch journals are, as main resolved them. */
export type DesktopWindowsNativeSandbox = {
  /** `tau-windows-sandbox.exe`. */
  readonly helperPath: string;
  /** Main's per-installation directory for launch journals and receipts, outside every grant. */
  readonly journalDirectory: string;
};
