/** Signals that a cache record or content blob failed integrity validation. @public */
export class CacheCorruptionError extends Error {
  public override readonly name = 'CacheCorruptionError';

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Signals that a required cache operation could not be completed. @public */
export class CacheRequiredError extends Error {
  public override readonly name = 'CacheRequiredError';

  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
