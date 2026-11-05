/**
 * Worker bootstrap handle for language servers that need the filesystem.
 *
 * @public
 */
export type LanguageWorkerHandle = {
  readonly port: MessagePort;
};
