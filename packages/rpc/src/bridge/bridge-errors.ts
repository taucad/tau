/**
 * Serializable error representation transmitted over the bridge wire protocol.
 * @public
 */
export type BridgeError = {
  message: string;
  name: string;
  stack?: string;
  code?: string;
  metadata?: Record<string, unknown>;
};
