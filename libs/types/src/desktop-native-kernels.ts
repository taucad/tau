/**
 * What a native kernel's preparation answered: `prepare_kernel`'s outcome, as main's payload store reports it to the
 * isolated renderer (desktop first-use download).
 */
export type DesktopKernelPreparation =
  | { readonly status: 'ready'; readonly kernel: string; readonly byteLength: number }
  | {
      readonly status: 'blocked';
      readonly kernel: string;
      readonly reason: 'unsupported-target' | 'offline-miss' | 'missing-system-library';
      readonly message: string;
    }
  | { readonly status: 'cancelled'; readonly kernel: string; readonly message: string }
  | { readonly status: 'failed'; readonly kernel: string; readonly code: string; readonly message: string };

/** One progress report of a kernel's preparation: bytes done of the total, strictly increasing per preparation. */
export type DesktopKernelProgress = {
  readonly kernel: string;
  readonly progress: number;
  readonly total: number;
  readonly message: string;
};

/** Fixed IPC routes; the renderer names a kernel, never a store, an origin or a path. */
export const desktopNativeKernelChannels = {
  prepare: 'tau:native-kernels:prepare',
  cancel: 'tau:native-kernels:cancel',
  progress: 'tau:native-kernels:progress',
} as const;

/** Narrow capabilities exposed by Electron's preload. */
export type DesktopNativeKernelBridge = {
  /** Download, verify and seal a kernel's runtime; resolves once it is ready or cannot be. */
  prepare(kernel: string): Promise<DesktopKernelPreparation>;
  /** Cancel a kernel's preparation; verified payloads are kept, so the next one downloads only the rest. */
  cancel(kernel: string): Promise<void>;
  /** Every progress report main makes, for any kernel. */
  subscribe(listener: (progress: DesktopKernelProgress) => void): () => void;
};
