import type { WebSocket } from 'ws';

/**
 * Gives an accepted socket an `'error'` listener before anything else can fail.
 *
 * `ws` reports a frame it refuses (one over `maxPayload`, a malformed or
 * unmasked frame) by sending the matching close code (1009, 1002, ...) and then
 * emitting `'error'`. With no listener that emit throws and ends the process,
 * so one client frame would take every socket on the Machine down with it.
 * The close has already been sent; there is nothing left to handle here.
 *
 * @param socket - A socket just accepted by a `WebSocketServer`.
 */
export const absorbSocketErrors = (socket: WebSocket): void => {
  socket.on('error', () => {
    // `ws` has already closed the socket with the status code for this error.
  });
};
