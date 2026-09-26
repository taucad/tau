/**
 * Desktop runs GeoSpec in its services utility and must never construct the
 * browser runner: that worker carries the whole browser kernel runtime and its
 * WASM. The GeoSpec client reports this refusal as a failed run.
 */
export const createBrowserGeoSpecWorker = (): Worker => {
  throw new Error(
    'The browser GeoSpec runner is unavailable in the desktop app. GeoSpec runs in its services utility.',
  );
};
