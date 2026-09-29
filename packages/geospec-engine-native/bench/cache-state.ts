import { isDeepStrictEqual } from 'node:util';
import type { ProductCacheOptions, ProductEngine } from '#bench/lib';

/** Read only explicitly configured native A3 constructor options. @internal
 * @returns The selected private store, or resident-only construction.
 */
export const cacheOptions = (): ProductCacheOptions | undefined => {
  const encoded = process.env['GEOSPEC_CAMPAIGN_CACHE'];
  return encoded === undefined ? undefined : (JSON.parse(encoded) as ProductCacheOptions);
};
/** Flush after the public suite ACK, retaining actual authenticated-cache diagnostics before close.
 * @internal
 * @param engine - Actual installed public native engine.
 * @param receipt - Mutable result receipt returned after finally has closed the engine.
 */
export const closeMeasuredEngine = (engine: ProductEngine, receipt: Record<string, unknown>): void => {
  try {
    if (cacheOptions()) {
      if (!engine.flushCache || !engine.cacheProducerIdentity || !engine.close) {
        throw new Error('Selected product lacks the declared A3 cache lifecycle.');
      }
      receipt['producer'] = JSON.parse(Buffer.from(engine.cacheProducerIdentity()).toString());
      receipt['flush'] = JSON.parse(Buffer.from(engine.flushCache()).toString());
    }
  } finally {
    engine.close?.();
  }
};
/** Require a real sealed prefill publication on a verified A3 producer. @internal
 * @param value - Actual cache receipt.
 * @returns Whether an authenticated record was published without reported cache failures.
 */
export const cachePublicationPresent = (value: unknown): boolean => {
  const record = (input: unknown): input is Record<string, unknown> => typeof input === 'object' && input !== null;
  if (
    !record(value) ||
    !record(value['producer']) ||
    value['producer']['verified'] !== true ||
    !record(value['flush'])
  ) {
    return false;
  }
  const { flush } = value;
  return (
    flush['sealed'] === true &&
    typeof flush['writes'] === 'number' &&
    flush['writes'] > 0 &&
    ['authenticationFailures', 'ioFailures', 'rejectedWrites'].every((key) => flush[key] === 0)
  );
};
/** Qualify an actual prefill/write followed by a fresh-process authenticated hit on the same producer.
 * @internal
 * @param prefill - Post-ACK seed cache receipt.
 * @param replay - Post-ACK measured cache receipt.
 * @returns Whether positive publication/replay diagnostics justify persisted-warm attribution.
 */
export const cacheReplayMatches = (prefill: unknown, replay: unknown): boolean => {
  const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
  if (
    !cachePublicationPresent(prefill) ||
    !record(prefill) ||
    !record(replay) ||
    !record(prefill['producer']) ||
    !record(replay['producer']) ||
    prefill['producer']['verified'] !== true ||
    !isDeepStrictEqual(prefill['producer'], replay['producer'])
  ) {
    return false;
  }
  const left = prefill['flush'];
  const right = replay['flush'];
  if (
    !record(left) ||
    !record(right) ||
    left['sealed'] !== true ||
    right['sealed'] !== true ||
    typeof right['reads'] !== 'number' ||
    !Number.isFinite(right['reads']) ||
    right['reads'] <= 0 ||
    right['hits'] !== right['reads'] ||
    right['misses'] !== 0 ||
    right['writes'] !== 0
  ) {
    return false;
  }
  return [left, right].every((value) =>
    ['authenticationFailures', 'ioFailures', 'rejectedWrites'].every((key) => value[key] === 0),
  );
};
