/** Synchronous or asynchronous sidecar-file resolver used by import backends. @public */
export type FileResolver = {
  /** Return whether a sidecar exists. */
  exists(filename: string): Promise<boolean> | boolean;
  /** Read a sidecar's bytes. */
  readFile(filename: string): Promise<Uint8Array<ArrayBuffer>> | Uint8Array<ArrayBuffer>;
};
