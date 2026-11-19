/**
 * FromServer - Message demultiplexer for messages FROM the LSP server (worker).
 * Provides separate queues for responses, notifications, and requests.
 */

import { StreamDemuxer } from '#lib/kcl-language/lsp/codec/stream-demuxer.js';

export type FromServer = StreamDemuxer;

export function createFromServer(): FromServer {
  return new StreamDemuxer();
}
