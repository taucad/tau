import { describe, it, expect, vi } from 'vitest';
import { isWireMessage, wireMessageSchema, wireVersion } from '#wire.js';
import type {
  WireRequest,
  WireResponseOk,
  WireResponseError,
  WireRequestCancel,
  WireNotify,
  WireStreamSubscribe,
  WireStreamNext,
  WireStreamComplete,
  WireStreamError,
  WireStreamUnsubscribe,
  WireHelloOk,
  WireHelloError,
  WireBye,
  WireFlowAck,
  WireFlowWindow,
} from '#wire.js';

describe('wireVersion', () => {
  it('is the v1 number', () => {
    expect(wireVersion).toBe(1);
  });
});

describe('wire frame corpus', () => {
  const accepted = [
    { v: 1, k: 'rq', i: 'r1', n: 'call', a: undefined },
    { v: 1, k: 'rs', i: 'r1', o: 1, d: undefined },
    { v: 1, k: 'rs', i: 'r1', o: 0, e: { m: 'failed' } },
    { v: 1, k: 'rc', i: 'r1', e: undefined },
    { v: 1, k: 'nt', n: 'event', a: undefined },
    { v: 1, k: 'ss', i: 's1', n: 'stream', a: undefined },
    { v: 1, k: 'sn', i: 's1', d: undefined },
    { v: 1, k: 'sc', i: 's1' },
    { v: 1, k: 'se', i: 's1', e: { m: 'failed' } },
    { v: 1, k: 'su', i: 's1' },
    { v: 1, k: 'lh', o: 1, d: undefined },
    { v: 1, k: 'lh', o: 0, e: { m: 'failed' } },
    { v: 1, k: 'lb', r: undefined },
    { v: 1, k: 'fa', i: 'r1' },
    { v: 1, k: 'fw', i: 's1', s: 1 },
  ] as const;

  const rejected = [
    { v: 1, k: 'rq', i: 'r1', n: 'call' },
    { v: 1, k: 'rs', i: 'r1', o: 1 },
    { v: 1, k: 'rs', i: 'r1', o: 0, e: { c: 'missing-message' } },
    { v: 1, k: 'rc', i: '' },
    { v: 1, k: 'nt', n: 'event' },
    { v: 1, k: 'ss', i: 's1', n: 'stream' },
    { v: 1, k: 'sn', i: 's1' },
    { v: 1, k: 'sc', i: '' },
    { v: 1, k: 'se', i: 's1', e: { m: 42 } },
    { v: 1, k: 'su', i: '' },
    { v: 1, k: 'lh', o: 2 },
    { v: 1, k: 'lb', r: 42 },
    { v: 1, k: 'fa', i: '' },
    { v: 1, k: 'fw', i: 's1', s: Number.POSITIVE_INFINITY },
  ] as const;

  it('drives the Zod schema with every frame shape accepted by the legacy guards', () => {
    for (const frame of accepted) {
      expect(wireMessageSchema.safeParse(frame).success, JSON.stringify(frame)).toBe(true);
      expect(isWireMessage(frame), JSON.stringify(frame)).toBe(true);
    }
  });

  it('preserves every representative legacy rejection', () => {
    for (const frame of rejected) {
      expect(wireMessageSchema.safeParse(frame).success, JSON.stringify(frame)).toBe(false);
      expect(isWireMessage(frame), JSON.stringify(frame)).toBe(false);
    }
  });

  it('diagnoses version skew for every schema-derived frame kind', () => {
    for (const frame of accepted) {
      const onVersionMismatch = vi.fn();
      expect(isWireMessage({ ...frame, v: 2 }, onVersionMismatch)).toBe(false);
      expect(onVersionMismatch).toHaveBeenCalledWith({ expected: wireVersion, received: 2, kind: frame.k });
    }
  });
});

describe('isWireMessage — RPC family', () => {
  it('accepts a request with non-empty id, name, and args slot', () => {
    const frame: WireRequest = { v: 1, k: 'rq', i: 'r1', n: 'add', a: { a: 1, b: 2 } };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('rejects a request with empty id', () => {
    expect(isWireMessage({ v: 1, k: 'rq', i: '', n: 'add', a: null })).toBe(false);
  });

  it('rejects a request with missing args slot', () => {
    expect(isWireMessage({ v: 1, k: 'rq', i: 'r1', n: 'add' })).toBe(false);
  });

  it('accepts an ok response carrying any data including null', () => {
    const frame: WireResponseOk = { v: 1, k: 'rs', i: 'r1', o: 1, d: null };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts an error response with a structured WireError', () => {
    const frame: WireResponseError = {
      v: 1,
      k: 'rs',
      i: 'r1',
      o: 0,
      e: { m: 'boom', c: 'E_BOOM', s: 'Error: boom' },
    };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('rejects an error response with a stringly-typed em (legacy v0 wire)', () => {
    expect(isWireMessage({ v: 1, k: 'rs', i: 'r1', o: 0, em: 'boom' })).toBe(false);
  });

  it('rejects an error response whose error has no message', () => {
    expect(isWireMessage({ v: 1, k: 'rs', i: 'r1', o: 0, e: { c: 1 } })).toBe(false);
  });

  it('rejects an rs frame with no o discriminator', () => {
    expect(isWireMessage({ v: 1, k: 'rs', i: 'r1', d: null })).toBe(false);
  });

  it('accepts a request-cancel without an error', () => {
    const frame: WireRequestCancel = { v: 1, k: 'rc', i: 'r1' };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts a request-cancel with a structured WireError', () => {
    const frame: WireRequestCancel = { v: 1, k: 'rc', i: 'r1', e: { m: 'aborted' } };
    expect(isWireMessage(frame)).toBe(true);
  });
});

describe('isWireMessage — notification family', () => {
  it('accepts a notification with name and args slot', () => {
    const frame: WireNotify = { v: 1, k: 'nt', n: 'progress', a: { ratio: 0.5 } };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('rejects a notification with empty name', () => {
    expect(isWireMessage({ v: 1, k: 'nt', n: '', a: null })).toBe(false);
  });

  it('rejects a notification with missing args slot', () => {
    expect(isWireMessage({ v: 1, k: 'nt', n: 'progress' })).toBe(false);
  });
});

describe('isWireMessage — stream family', () => {
  it('accepts a stream-subscribe frame', () => {
    const frame: WireStreamSubscribe = { v: 1, k: 'ss', i: 's1', n: 'ticks', a: null };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts a stream-next frame', () => {
    const frame: WireStreamNext = { v: 1, k: 'sn', i: 's1', d: 42 };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts a stream-complete frame', () => {
    const frame: WireStreamComplete = { v: 1, k: 'sc', i: 's1' };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts a stream-error frame with a structured WireError', () => {
    const frame: WireStreamError = { v: 1, k: 'se', i: 's1', e: { m: 'mid' } };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('rejects a stream-error frame with stringly-typed em', () => {
    expect(isWireMessage({ v: 1, k: 'se', i: 's1', em: 'mid' })).toBe(false);
  });

  it('accepts a stream-unsubscribe frame', () => {
    const frame: WireStreamUnsubscribe = { v: 1, k: 'su', i: 's1' };
    expect(isWireMessage(frame)).toBe(true);
  });
});

describe('isWireMessage — lifecycle family', () => {
  it('accepts a hello-ok frame with no payload', () => {
    const frame: WireHelloOk = { v: 1, k: 'lh', o: 1 };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts a hello-ok frame with a payload', () => {
    const frame: WireHelloOk = { v: 1, k: 'lh', o: 1, d: { protocol: 'runtime' } };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts a hello-error frame with a structured WireError', () => {
    const frame: WireHelloError = { v: 1, k: 'lh', o: 0, e: { m: 'protocol mismatch' } };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('rejects a hello frame with no o discriminator', () => {
    expect(isWireMessage({ v: 1, k: 'lh', d: null })).toBe(false);
  });

  it('accepts a bye frame with no reason', () => {
    const frame: WireBye = { v: 1, k: 'lb' };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts a bye frame with a reason', () => {
    const frame: WireBye = { v: 1, k: 'lb', r: 'shutdown' };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('rejects a bye frame whose reason is not a string', () => {
    expect(isWireMessage({ v: 1, k: 'lb', r: 7 })).toBe(false);
  });
});

describe('isWireMessage — flow control family', () => {
  it('accepts a flow-ack frame so receivers can drop without crashing', () => {
    const frame: WireFlowAck = { v: 1, k: 'fa', i: 'r1' };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('accepts a flow-window frame so receivers can drop without crashing', () => {
    const frame: WireFlowWindow = { v: 1, k: 'fw', i: 's1', s: 32 };
    expect(isWireMessage(frame)).toBe(true);
  });

  it('rejects a flow-window frame with a non-finite slot count', () => {
    expect(isWireMessage({ v: 1, k: 'fw', i: 's1', s: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it.each([0, -1, 1.5])('rejects an invalid flow-window slot count (%s)', (slots) => {
    expect(isWireMessage({ v: 1, k: 'fw', i: 's1', s: slots })).toBe(false);
  });
});

describe('isWireMessage — rejection paths', () => {
  it('rejects null', () => {
    expect(isWireMessage(null)).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isWireMessage('hello')).toBe(false);
    expect(isWireMessage(7)).toBe(false);
    expect(isWireMessage(undefined)).toBe(false);
  });

  it('rejects a frame with the wrong version', () => {
    expect(isWireMessage({ v: 2, k: 'rq', i: 'x', n: 'n', a: null })).toBe(false);
    expect(isWireMessage({ v: 0, k: 'rq', i: 'x', n: 'n', a: null })).toBe(false);
  });

  it('diagnoses a wrong version only for known frame kinds', () => {
    const onVersionMismatch = vi.fn();

    expect(isWireMessage({ v: 2, k: 'rq', i: 'x', n: 'n', a: null }, onVersionMismatch)).toBe(false);
    expect(isWireMessage({ v: 2, k: 'rq' }, onVersionMismatch)).toBe(false);
    expect(isWireMessage({ v: 2, k: 'unknown', i: 'x' }, onVersionMismatch)).toBe(false);

    expect(onVersionMismatch).toHaveBeenCalledTimes(2);
    expect(onVersionMismatch).toHaveBeenNthCalledWith(1, { expected: wireVersion, received: 2, kind: 'rq' });
    expect(onVersionMismatch).toHaveBeenNthCalledWith(2, { expected: wireVersion, received: 2, kind: 'rq' });
  });

  it('rejects a frame with an unknown kind', () => {
    expect(isWireMessage({ v: 1, k: 'unknown', i: 'x' })).toBe(false);
  });

  it('rejects legacy single-character kinds (v0 wire)', () => {
    expect(isWireMessage({ v: 1, k: 'c', i: 'x', n: 'n', a: null })).toBe(false);
    expect(isWireMessage({ v: 1, k: 'r', i: 'x', o: 1, d: null })).toBe(false);
    expect(isWireMessage({ v: 1, k: 'l', i: 'x', n: 'n', a: null })).toBe(false);
    expect(isWireMessage({ v: 1, k: 'p', i: 'x', d: null })).toBe(false);
    expect(isWireMessage({ v: 1, k: 'n', i: 'x' })).toBe(false);
    expect(isWireMessage({ v: 1, k: 'f', i: 'x', em: 'e' })).toBe(false);
    expect(isWireMessage({ v: 1, k: 'x' })).toBe(false);
  });

  it('rejects frames with reserved underscore-prefixed kinds', () => {
    expect(isWireMessage({ v: 1, k: '_internal' })).toBe(false);
  });
});
