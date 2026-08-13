/**
 * The GeoSpec runner worker entry.
 *
 * This module is a bootstrap, and its static import graph is type-only on
 * purpose. A module worker whose entry graph fails to evaluate is silent in
 * Chrome — the worker fires no `error` event, no `messageerror`, and logs
 * nothing — so a broken import anywhere under the engine would leave the client
 * waiting on an `initialized` message that can never arrive, and the only
 * symptom would be its initialization timeout minutes later.
 *
 * Loading the implementation through a dynamic import turns that same failure
 * into a rejected promise: this module is already evaluated and already
 * listening, so it can answer every pending request with the real error.
 *
 * @module
 */

import type { GeoSpecRunnerWorkerRequest, GeoSpecRunnerWorkerResponse } from '#workers/geospec-runner.types.js';

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<GeoSpecRunnerWorkerRequest>) => void): void;
  postMessage(message: GeoSpecRunnerWorkerResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;

/** Requests that arrived before the implementation finished loading. */
const buffered: GeoSpecRunnerWorkerRequest[] = [];
let handleRequest: ((message: GeoSpecRunnerWorkerRequest) => void) | undefined;

// Registered before the await below so no request is dropped while the
// implementation loads.
workerScope.addEventListener('message', (event) => {
  if (handleRequest) {
    handleRequest(event.data);
    return;
  }
  buffered.push(event.data);
});

try {
  ({ handleGeoSpecRunnerRequest: handleRequest } = await import('#workers/geospec-runner.impl.js'));
} catch (error) {
  const message = `GeoSpec worker failed to load: ${error instanceof Error ? error.message : String(error)}`;
  handleRequest = (request) => {
    workerScope.postMessage({ type: 'error', requestId: request.requestId, message });
  };
}

for (const request of buffered.splice(0)) {
  handleRequest(request);
}
