import { describe, it, expect, afterEach } from 'vitest';
import { traceFrame } from '#trace.js';
import type { WireMessage } from '#wire.js';

describe('@taucad/rpc traceFrame (R16, F10)', () => {
  const previous = process.env['RPC_TRACE'];

  afterEach(() => {
    if (previous === undefined) {
      delete process.env['RPC_TRACE'];
    } else {
      process.env['RPC_TRACE'] = previous;
    }
  });

  it('should log nothing when RPC_TRACE is not set', () => {
    delete process.env['RPC_TRACE'];
    const lines: string[] = [];
    const frame: WireMessage = { v: 1, k: 'rq', i: 'a', n: 'render', a: null };
    traceFrame('OUT', frame, (line) => lines.push(line));
    expect(lines).toEqual([]);
  });

  it('should log a structured [OUT] line for a request when RPC_TRACE=1', () => {
    process.env['RPC_TRACE'] = '1';
    const lines: string[] = [];
    const frame: WireMessage = { v: 1, k: 'rq', i: '42', n: 'render', a: { x: 1 } };
    traceFrame('OUT', frame, (line) => lines.push(line));
    expect(lines).toEqual(['[OUT] rq i=42 n=render']);
  });

  it('should log a structured [IN ] line for a successful response when RPC_TRACE=true', () => {
    process.env['RPC_TRACE'] = 'true';
    const lines: string[] = [];
    const frame: WireMessage = { v: 1, k: 'rs', i: '42', o: 1, d: { ok: true } };
    traceFrame('IN', frame, (line) => lines.push(line));
    expect(lines).toEqual(['[IN] rs i=42 ok']);
  });

  it('should log an error response with its message', () => {
    process.env['RPC_TRACE'] = '1';
    const lines: string[] = [];
    const frame: WireMessage = { v: 1, k: 'rs', i: '42', o: 0, e: { m: 'boom' } };
    traceFrame('OUT', frame, (line) => lines.push(line));
    expect(lines).toEqual(['[OUT] rs i=42 err=boom']);
  });

  it('should log notify, stream, lifecycle, and flow control kinds', () => {
    process.env['RPC_TRACE'] = '1';
    const lines: string[] = [];
    const frames: WireMessage[] = [
      { v: 1, k: 'rc', i: '1' },
      { v: 1, k: 'nt', n: 'progress', a: null },
      { v: 1, k: 'ss', i: '2', n: 'stream', a: null },
      { v: 1, k: 'sn', i: '2', d: 0 },
      { v: 1, k: 'sc', i: '2' },
      { v: 1, k: 'se', i: '2', e: { m: 'fail' } },
      { v: 1, k: 'su', i: '2' },
      { v: 1, k: 'lh', o: 1 },
      { v: 1, k: 'lh', o: 0, e: { m: 'no kernel' } },
      { v: 1, k: 'lb' },
      { v: 1, k: 'lb', r: 'shutdown' },
      { v: 1, k: 'fa', i: '99' },
      { v: 1, k: 'fw', i: '99', s: 4 },
    ];
    for (const frame of frames) {
      traceFrame('OUT', frame, (line) => lines.push(line));
    }
    expect(lines).toEqual([
      '[OUT] rc i=1',
      '[OUT] nt n=progress',
      '[OUT] ss i=2 n=stream',
      '[OUT] sn i=2',
      '[OUT] sc i=2',
      '[OUT] se i=2 err=fail',
      '[OUT] su i=2',
      '[OUT] lh ok',
      '[OUT] lh err=no kernel',
      '[OUT] lb',
      '[OUT] lb r=shutdown',
      '[OUT] fa i=99',
      '[OUT] fw i=99 s=4',
    ]);
  });

  it('should pass the original frame as the second argument to the logger', () => {
    process.env['RPC_TRACE'] = '1';
    const captured: Array<{ line: string; frame: WireMessage }> = [];
    const frame: WireMessage = { v: 1, k: 'nt', n: 'tick', a: 7 };
    traceFrame('IN', frame, (line, raw) => {
      captured.push({ line, frame: raw });
    });
    expect(captured).toEqual([{ line: '[IN] nt n=tick', frame }]);
  });
});
