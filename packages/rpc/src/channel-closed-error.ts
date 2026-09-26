/**
 * Why a channel closed. `CHANNEL_CLOSED`: this end closed it. `PEER_CLOSED`: the peer said bye
 * (`lb`). `PEER_GONE`: the port reported its own death, which only platforms that fire a port
 * close event do (Node sockets and `worker_threads` ports). `PEER_UNRESPONSIVE`: the liveness,
 * close-handshake or hello bound expired; a dead browser peer shows only as this.
 *
 * @public
 */
export type ChannelCloseCode = 'CHANNEL_CLOSED' | 'PEER_CLOSED' | 'PEER_GONE' | 'PEER_UNRESPONSIVE';

/**
 * Information passed to `onClose` listeners. `origin` indicates which side initiated the close,
 * `code` says why, and `reason` carries the optional human-readable reason from the lifecycle
 * bye frame (or the bound that expired, such as `liveness-timeout`).
 *
 * @public
 */
export type CloseInfo = {
  readonly origin: 'local' | 'remote' | 'timeout';
  readonly code: ChannelCloseCode;
  readonly reason?: string;
};

/**
 * Rejects every pending call, queued call and failing listen when a channel closes, and is
 * thrown by a call, notify or listen made after close. The message stays `Channel closed` so
 * existing matchers keep working; read `code` for why. On a command it means the effect is
 * unknown: re-send by key.
 *
 * @public
 */
export class ChannelClosedError extends Error {
  public override readonly name = 'ChannelClosedError';
  /** Why the channel closed. */
  public readonly code: ChannelCloseCode;
  /** The close as this end recorded it. */
  public readonly info: CloseInfo;

  public constructor(info: CloseInfo) {
    super('Channel closed');
    this.code = info.code;
    this.info = info;
  }
}
