/**
 * What the kernel utility binds its native kernels through (charter W6, D8).
 *
 * Main reads each sealed closure's launch index from the payload store at startup, then posts one control frame naming
 * the closure every prepared native kernel runs from. The broker replays the frame to every utility right after its
 * boot frame, and the desktop runtime awaits it before it composes. The runtime lists the native kernels' plugins like
 * any other; each kernel asks the closure resolver installed here for its closure when it initializes. A kernel the
 * frame does not name is read from the store on every bind, so a kernel main prepares after launch (first-use
 * download) binds on its next operation, and until then refuses with `KERNEL_NOT_PREPARED`. The utility never reads the store's receipts itself; it re-verifies a
 * closure only when a worker exits before its handshake, so the refusal names the damage.
 *
 * @module
 */
import { installNativeRuntimeVerifier } from '@taucad/native-process-core';
import {
  installNativeClosureResolver,
  storeClosureResolver,
  verifyStoreClosure,
} from '@taucad/native-process-core/store';
import type { NativeClosureResolver } from '@taucad/native-process-core/store';

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

/** The bounds the desktop runtime lists every native kernel with. */
export const desktopNativeBounds = {
  requestTimeout: nativeRequestTimeoutMilliseconds,
  maxArtifactBytes: nativeMaxArtifactBytes,
} as const;

const isFrame = (value: unknown): value is NativeKernelsFrame =>
  typeof value === 'object' &&
  value !== null &&
  Reflect.get(value, 'type') === nativeKernelsFrameType &&
  typeof Reflect.get(value, 'store') === 'string' &&
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
 * The closure resolver over main's frame: a kernel the frame gives a sealed closure binds to it; a kernel the frame
 * refuses (main could not open the store) answers with main's reason; a kernel the frame does not name (not prepared
 * at launch, or no variant fits this host) is read from the store, which also says why it cannot run yet.
 * @param frame - What main posted.
 * @param fallback - Where a kernel the frame does not name is looked up; default the frame's store.
 * @returns The resolver.
 */
export const desktopClosureResolver =
  (
    frame: NativeKernelsFrame,
    fallback: NativeClosureResolver = storeClosureResolver({ store: frame.store }),
  ): NativeClosureResolver =>
  async (request) => {
    const slot = frame.kernels.find(
      (candidate) => candidate.package === request.package && candidate.kernel === request.kernel,
    );
    if (slot === undefined) {
      const answer = await fallback(request);
      if (answer.status === 'ready') {
        /* The store resolver installs its own remedy; the desktop's names the app as the repair. */
        installNativeRuntimeVerifier(verifyDesktopClosure);
      }
      return answer;
    }
    if (slot.closure !== undefined) {
      return { status: 'ready', closures: { [slot.closure.dependency]: slot.closure } };
    }
    return {
      status: 'unavailable',
      reason: 'not-prepared',
      byteLength: 0,
      refusal: slot.refusal ?? `The ${slot.kernel} runtime is not installed on this machine.`,
    };
  };

/**
 * Bind this utility's native kernels to main's frame: install the closure resolver every native kernel initializes
 * through and, when the frame names a sealed closure, the re-verifier. Called once the frame arrives, before the
 * runtime composes.
 * @param frame - What main posted.
 */
export const installDesktopNativeKernels = (frame: NativeKernelsFrame): void => {
  installNativeClosureResolver(desktopClosureResolver(frame));
  if (frame.kernels.some(({ closure }) => closure !== undefined)) {
    installNativeRuntimeVerifier(verifyDesktopClosure);
  }
};
