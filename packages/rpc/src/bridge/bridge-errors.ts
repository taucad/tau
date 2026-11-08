/**
 * Serializable error representation transmitted over the bridge wire protocol.
 * @public
 */
export type BridgeError = {
  message: string;
  name: string;
  stack?: string;
  code?: string;
  /**
   * Why the call was refused, finer than `code`: a masked path's `EPERM`
   * carries `WORKSPACE_MASKED_PATH`. Optional and additive, so a peer that
   * does not know it ignores it.
   */
  reason?: string;
  metadata?: Record<string, unknown>;
};
