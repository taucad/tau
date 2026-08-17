/** @public */
export type File = {
  content: Uint8Array<ArrayBuffer>;
  // Could add metadata in the future
  lastModified?: number;
  size?: number;
};
