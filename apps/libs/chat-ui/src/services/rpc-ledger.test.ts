import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RpcClientErrorCode } from '@taucad/chat';
import { rpcClientErrorCode } from '@taucad/chat';
import type { RpcOutcome } from '#services/rpc-ledger.js';
import { clearLedger, getRpcOutcome, recordRpcOutcome } from '#services/rpc-ledger.js';

describe('rpcLedger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    clearLedger('c1');
    clearLedger('c2');
    vi.useRealTimers();
  });

  it('isolates chats by chatId', () => {
    recordRpcOutcome('c1', 't1', { kind: 'success', output: { a: 1 } });
    recordRpcOutcome('c2', 't1', { kind: 'success', output: { b: 2 } });

    expect(getRpcOutcome('c1', 't1')).toEqual({ kind: 'success', output: { a: 1 } });
    expect(getRpcOutcome('c2', 't1')).toEqual({ kind: 'success', output: { b: 2 } });
  });

  it('drops entries older than the 10s TTL on read', () => {
    recordRpcOutcome('c1', 't_old', { kind: 'success', output: {} });

    vi.advanceTimersByTime(10_001);
    expect(getRpcOutcome('c1', 't_old')).toBeUndefined();
  });

  it('keeps entries within the 10s TTL window on read', () => {
    recordRpcOutcome('c1', 't_fresh', { kind: 'success', output: { x: true } });

    vi.advanceTimersByTime(9000);
    expect(getRpcOutcome('c1', 't_fresh')).toEqual({ kind: 'success', output: { x: true } });
  });

  it('clearLedger removes chat namespace', () => {
    recordRpcOutcome('c1', 'tx', { kind: 'success', output: null });
    clearLedger('c1');
    expect(getRpcOutcome('c1', 'tx')).toBeUndefined();
  });

  // T2.5: compile-only assertion that `RpcOutcome.errorCode` is the typed
  // `RpcClientErrorCode` union, not a free-form string. If the type widens,
  // the `satisfies` check below will fail to compile.
  it('typechecks RpcOutcome.errorCode as RpcClientErrorCode', () => {
    const errorOutcome = {
      kind: 'error',
      errorCode: rpcClientErrorCode.ioError,
      message: 'disk error',
    } satisfies RpcOutcome;

    const code: RpcClientErrorCode = errorOutcome.errorCode;
    expect(code).toBe(rpcClientErrorCode.ioError);
  });
});
