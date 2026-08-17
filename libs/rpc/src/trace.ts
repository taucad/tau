import type { WireMessage } from '#wire.js';

/**
 * Direction of a traced wire frame relative to the local peer.
 *
 * @public
 */
export type TraceDirection = 'OUT' | 'IN';

/**
 * Sink for trace lines. Defaults to `console.debug`. Inject in tests to capture traffic.
 *
 * @public
 */
export type TraceLogger = (line: string, frame: WireMessage) => void;

const summarize = (frame: WireMessage): string => {
  switch (frame.k) {
    case 'rq': {
      return `rq i=${frame.i} n=${frame.n}`;
    }
    case 'rs': {
      return frame.o === 1 ? `rs i=${frame.i} ok` : `rs i=${frame.i} err=${frame.e.m}`;
    }
    case 'rc': {
      return `rc i=${frame.i}`;
    }
    case 'nt': {
      return `nt n=${frame.n}`;
    }
    case 'ss': {
      return `ss i=${frame.i} n=${frame.n}`;
    }
    case 'sn': {
      return `sn i=${frame.i}`;
    }
    case 'sc': {
      return `sc i=${frame.i}`;
    }
    case 'se': {
      return `se i=${frame.i} err=${frame.e.m}`;
    }
    case 'su': {
      return `su i=${frame.i}`;
    }
    case 'lh': {
      return frame.o === 1 ? 'lh ok' : `lh err=${frame.e.m}`;
    }
    case 'lb': {
      return frame.r === undefined ? 'lb' : `lb r=${frame.r}`;
    }
    case 'fa': {
      return `fa i=${frame.i}`;
    }
    case 'fw': {
      return `fw i=${frame.i} s=${frame.s}`;
    }
  }
};

const isTraceEnabled = (): boolean => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (!env) {
    return false;
  }
  const flag = env['RPC_TRACE'];
  return flag === '1' || flag === 'true';
};

/**
 * Log a wire frame when `RPC_TRACE` env flag is set. Returns early when disabled so the cost
 * is one env lookup per call. Pass `logger` to redirect output (used in tests).
 *
 * @param direction - Whether the frame is being sent (`OUT`) or received (`IN`).
 * @param frame - The wire frame to log.
 * @param logger - Sink for trace lines. Defaults to `console.debug`.
 * @public
 */
export const traceFrame = (
  direction: TraceDirection,
  frame: WireMessage,
  logger: TraceLogger = (line) => {
    console.debug(line);
  },
): void => {
  if (!isTraceEnabled()) {
    return;
  }
  logger(`[${direction}] ${summarize(frame)}`, frame);
};
