import { WebSocket } from 'ws';
import type { RawData } from 'ws';

import type { MetricsService, WsCloseReason, WsGateway } from '#telemetry/metrics.js';

/**
 * Bounded `ws.close.reason` for a close code, so the label never carries the
 * peer's free-text reason.
 *
 * @param code - The close code `ws` reports on `'close'` (1006 when the transport dropped).
 * @returns One of normal, going_away, server_shutdown, auth_failed, policy_violation, unavailable,
 * replaced, error, other.
 */
export const wsCloseReason = (code: number): WsCloseReason => {
  switch (code) {
    case 1000:
    case 1005: {
      return 'normal';
    }
    case 1001: {
      return 'going_away';
    }
    case 1012: {
      return 'server_shutdown';
    }
    case 4003:
    case 4401:
    case 4403: {
      return 'auth_failed';
    }
    case 1008: {
      return 'policy_violation';
    }
    case 1013: {
      return 'unavailable';
    }
    case 4001: {
      return 'replaced';
    }
    case 1002:
    case 1003:
    case 1006:
    case 1007:
    case 1009:
    case 1011: {
      return 'error';
    }
    default: {
      return 'other';
    }
  }
};

const byteLength = (data: unknown): number => {
  if (typeof data === 'string') {
    return Buffer.byteLength(data);
  }
  if (Array.isArray(data)) {
    return (data as Array<{ byteLength: number }>).reduce((total, chunk) => total + chunk.byteLength, 0);
  }
  const sized = data as { byteLength?: number; size?: number } | undefined;
  return sized?.byteLength ?? sized?.size ?? 0;
};

/**
 * Accounts one accepted socket in `ws.connections.active`, `ws.disconnections`
 * and `ws.message.size` until it closes.
 *
 * Outbound frames leave from several owners (the host frame relay, control
 * fan-out, the Zoo proxy), so `send` is wrapped once here instead of at each.
 * A frame sent once the socket has left OPEN is dropped by `ws`, so it is not counted.
 *
 * @param metrics - The API's instruments.
 * @param gateway - The upgrade route that accepted the socket.
 * @param socket - A socket just accepted by a `WebSocketServer`.
 */
export const trackSocket = (metrics: MetricsService, gateway: WsGateway, socket: WebSocket): void => {
  const labels = { 'ws.gateway': gateway };
  metrics.wsActiveConnections.add(1, labels);
  socket.on('message', (raw: RawData) => {
    metrics.wsMessageSize.record(byteLength(raw), { ...labels, 'ws.direction': 'inbound' });
  });
  const send = socket.send.bind(socket) as (...arguments_: unknown[]) => void;
  socket.send = ((data: unknown, ...rest: unknown[]) => {
    if (socket.readyState === WebSocket.OPEN) {
      metrics.wsMessageSize.record(byteLength(data), { ...labels, 'ws.direction': 'outbound' });
    }
    send(data, ...rest);
  }) as WebSocket['send'];
  socket.once('close', (code: number) => {
    metrics.wsActiveConnections.add(-1, labels);
    metrics.wsDisconnections.add(1, { ...labels, 'ws.close.reason': wsCloseReason(code) });
  });
};
