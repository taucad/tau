/**
 * STEP source types accepted by model loading.
 *
 * @module
 */

/**
 * STEP source forms accepted by `loadModel`.
 *
 * @public
 */
export type StepSource =
  | string
  | URL
  | Uint8Array<ArrayBuffer>
  | ArrayBuffer
  | Blob
  | File
  | ReadableStream<Uint8Array<ArrayBuffer>>
  | AsyncIterable<Uint8Array<ArrayBuffer>>;

/**
 * STEP reader strategy used by GeoSpec model loading.
 *
 * @public
 */
export type StepStreamingMode = 'auto' | 'native-stream' | 'filesystem';
