const probeTimeout = 5000;

/** Probe the worker-only OPFS sync-access API Tau relies on. */
export const probeHomeOpfs = async (): Promise<boolean> => {
  if (typeof Worker === 'undefined' || typeof navigator.storage.getDirectory !== 'function') {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const worker = new Worker(new URL('home-opfs-probe.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (supported: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(probeTimeoutId);
      worker.terminate();
      resolve(supported);
    };
    const probeTimeoutId = setTimeout(() => {
      finish(false);
    }, probeTimeout);

    worker.addEventListener(
      'message',
      (event: MessageEvent<unknown>) => {
        finish(event.data === true);
      },
      { once: true },
    );
    worker.addEventListener(
      'error',
      () => {
        finish(false);
      },
      { once: true },
    );
    worker.postMessage(undefined);
  });
};
