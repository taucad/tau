/**
 * Worker bootstrap handle for language servers that need filesystem + optional shared file pool.
 *
 * @public
 */
export type LanguageWorkerHandle = {
  readonly port: MessagePort;
  readonly filePoolBuffer?: SharedArrayBuffer;
};
