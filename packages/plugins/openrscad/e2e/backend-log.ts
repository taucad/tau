/**
 * Which engine payload a runtime client's OpenRSCAD kernel bound.
 *
 * The kernel logs this once per kernel context and it is the only signal that
 * separates the N-API addon from the WebAssembly build — a host that fell back
 * still exports. The runtime flushes log entries *after* the `export()` promise
 * settles, so reading the collected array straight after an export finds it
 * empty; `backend()` waits for the line instead of racing it.
 *
 * Shared by the browser fixture and this suite's Node-side command so both
 * halves report the backend the same way.
 */

const backendLogPattern = /OpenRSCAD engine backend: (\w+)/u;

/** The `on('log', …)` slice of a runtime client this helper needs. */
export type LoggingClient = {
  on: (event: 'log', handler: (entry: { message: string }) => void) => unknown;
};

/** Collected runtime log lines plus a promise for the bound engine backend. */
export type BackendTracker = {
  /** Every runtime log line so far, so a failure names what the runtime did. */
  readonly logs: string[];
  /** Resolves with the bound backend, or `undefined` if the line never arrives. */
  backend: (timeoutMs?: number) => Promise<string | undefined>;
};

/**
 * Collect a runtime client's log lines and expose the engine backend it bound.
 *
 * @param client - Any runtime client, in this process or in the browser fixture.
 * @returns The growing log array and a `backend()` that waits for the log line.
 */
export const trackEngineBackend = (client: LoggingClient): BackendTracker => {
  const logs: string[] = [];
  let announce: (backend: string) => void = () => {
    // Replaced synchronously by the promise executor below.
  };
  const arrived = new Promise<string>((resolve) => {
    announce = resolve;
  });

  client.on('log', (entry) => {
    logs.push(entry.message);
    const match = backendLogPattern.exec(entry.message);
    if (match?.[1] !== undefined) {
      announce(match[1]);
    }
  });

  return {
    logs,
    backend: async (timeoutMs = 30_000) =>
      Promise.race([
        arrived,
        new Promise<undefined>((resolve) => {
          setTimeout(() => {
            resolve(undefined);
          }, timeoutMs);
        }),
      ]),
  };
};
