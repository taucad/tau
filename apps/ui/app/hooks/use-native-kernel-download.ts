import { useEffect, useRef, useState } from 'react';
import type { KernelIssue } from '@taucad/runtime';
import type { DesktopKernelPreparation } from '@taucad/types/desktop-native-kernels';
import { desktopNativeKernels } from '#filesystem/desktop-bridge.js';

/** A native kernel the desktop is downloading for the viewed model, or could not download. */
export type NativeKernelDownload =
  | Readonly<{
      status: 'downloading';
      kernel: string;
      /** The closure's download size, from the kernel's refusal; absent when it did not say. */
      byteLength: number | undefined;
      /** Bytes done of the total, once main reports progress. */
      progress: Readonly<{ done: number; total: number }> | undefined;
      cancel: () => void;
    }>
  | Readonly<{ status: 'stopped'; kernel: string; message: string; retry: () => void }>;

/**
 * The kernel a `KERNEL_NOT_PREPARED` refusal names, and its download size.
 * @param issues - The viewed model's issues.
 * @returns The first unprepared kernel, or `undefined`.
 */
export const unpreparedKernelOf = (
  issues: readonly KernelIssue[] | undefined,
): Readonly<{ kernel: string; byteLength: number | undefined }> | undefined => {
  for (const issue of issues ?? []) {
    if (issue.code !== 'KERNEL_NOT_PREPARED' || typeof issue.details !== 'object' || issue.details === null) {
      continue;
    }
    const kernel: unknown = Reflect.get(issue.details, 'kernel');
    const byteLength: unknown = Reflect.get(issue.details, 'byteLength');
    if (typeof kernel === 'string' && kernel !== '') {
      return { kernel, byteLength: typeof byteLength === 'number' && byteLength > 0 ? byteLength : undefined };
    }
  }
  return undefined;
};

/**
 * Download on first use (desktop first-use download blueprint, DS-1): when the viewed model's kernel refuses with
 * `KERNEL_NOT_PREPARED`, ask the desktop's main process to prepare it, the same preparation as `prepare_kernel`, and
 * call `onReady` so the model renders again once it is ready. Each kernel starts on its own once per mount; a
 * cancelled or failed download waits for `retry`. Off the desktop, or on a shell that bundles its kernels, it does
 * nothing and the refusal stays as it is.
 * @param issues - The viewed model's issues.
 * @param onReady - Renders the model again.
 * @returns The download in progress or stopped, or `undefined`.
 */
export const useNativeKernelDownload = (
  issues: readonly KernelIssue[] | undefined,
  onReady: () => void,
): NativeKernelDownload | undefined => {
  const unprepared = unpreparedKernelOf(issues);
  const kernel = unprepared?.kernel;
  const byteLength = unprepared?.byteLength;
  const [state, setState] = useState<NativeKernelDownload | undefined>(undefined);
  const started = useRef(new Set<string>());
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  const start = useRef((name: string, size: number | undefined): void => {
    const bridge = desktopNativeKernels();
    if (bridge === undefined) {
      return;
    }
    started.current.add(name);
    const cancel = (): void => {
      void bridge.cancel(name);
    };
    setState({ status: 'downloading', kernel: name, byteLength: size, progress: undefined, cancel });
    const unsubscribe = bridge.subscribe((report) => {
      if (report.kernel === name) {
        setState((current) =>
          current?.status === 'downloading' && current.kernel === name
            ? { ...current, progress: { done: report.progress, total: report.total } }
            : current,
        );
      }
    });
    const finish = (outcome: DesktopKernelPreparation): void => {
      unsubscribe();
      if (outcome.status === 'ready') {
        setState(undefined);
        onReadyRef.current();
        return;
      }
      setState({
        status: 'stopped',
        kernel: name,
        message: outcome.message,
        retry: () => {
          start.current(name, size);
        },
      });
    };
    // async-iife: bootstrap -- the download reports through state; nothing awaits it.
    void (async () => {
      try {
        finish(await bridge.prepare(name));
      } catch (error) {
        finish({
          status: 'failed',
          kernel: name,
          code: 'PREPARE_KERNEL_FAILED',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  useEffect(() => {
    if (kernel !== undefined && !started.current.has(kernel)) {
      start.current(kernel, byteLength);
    }
  }, [kernel, byteLength]);

  /* A download for a kernel the model no longer needs (another entry, or a fix) stays out of the view. */
  return state !== undefined && state.kernel === kernel ? state : undefined;
};
