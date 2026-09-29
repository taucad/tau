import { desktopBridge } from '#filesystem/desktop-bridge.js';
import type { ExactRequest, ExactResponse } from './measurement-exact.worker.js';

/** One desktop utility port per exact query; closing it suppresses late native results. */
export const runExactRequest = async (request: ExactRequest, signal?: AbortSignal): Promise<ExactResponse> =>
  new Promise<ExactResponse>((resolve) => {
    let finished = false;
    let port: MessagePort | undefined;
    const unavailable = (reason: string): ExactResponse => ({ id: request.id, status: 'unavailable', reason });
    const finish = (response: ExactResponse): void => {
      if (finished) {
        return;
      }
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(queryTimeout);
      port?.close();
      resolve(response);
    };
    const onAbort = (): void => {
      finish(unavailable('The exact query was cancelled.'));
    };
    const queryTimeout = setTimeout(() => {
      finish(unavailable('The AP242 query timed out.'));
    }, 120_000);
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    const connect = async (): Promise<void> => {
      try {
        const connected = await desktopBridge()?.exactMeasurement.connect();
        if (!connected) {
          finish(unavailable('The desktop exact measurement host is unavailable.'));
          return;
        }
        if (finished) {
          connected.close();
          return;
        }
        port = connected;
        port.addEventListener('message', (event: MessageEvent<ExactResponse>) => {
          finish(
            event.data.id === request.id
              ? event.data
              : unavailable('The AP242 response identity changed.'),
          );
        });
        port.addEventListener('messageerror', () => {
          finish(unavailable('The AP242 response could not be decoded.'));
        });
        port.start();
        port.postMessage(request);
      } catch {
        finish(unavailable('The AP242 request could not be sent.'));
      }
    };
    void connect();
  });
