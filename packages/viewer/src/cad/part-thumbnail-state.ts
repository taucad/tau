/**
 * The render state of a part thumbnail, keeping the last successful preview bytes while a refresh is pending or has failed.
 *
 * @public
 */
export type PartThumbnailState = Readonly<{
  status: 'pending' | 'ready' | 'failed';
  /** The last successfully rendered preview stays visible during refresh or failure. */
  bytes?: Uint8Array<ArrayBuffer>;
  error?: unknown;
}>;
