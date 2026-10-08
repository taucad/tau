import { describe, expect, expectTypeOf, it } from 'vitest';

import resumableFailureCodes from '#log/resumable-failure-codes.json' with { type: 'json' };
import type { HostCompactionError } from '#harness/compaction.js';
import type { EventLogErrorCode } from '#log/event-log-error.js';
import type { GatewayModelErrorCode } from '#transport/gateway-model-transport.js';
import type { ExternalAgentRefusalCode, ExternalAgentStopCode } from '#wire/external-agent.schema.js';
import type { GatewayErrorCode } from '#wire/gateway.js';
import { isResumableRunFailure } from '#log/resumable.js';
import { gatewayErrorCodes } from '#wire/gateway.js';
import { isResumable, refusalOf, refusals } from '#wire/refusals.js';
import type { RefusalCode } from '#wire/refusals.js';

/** Today's thirteen resumable codes (the run-failure set before the registry, `tau-agent-host.ts:1188` at 6f8b77392). */
const todaysResumable = [
  'CIRCUIT_BREAKER_OPEN',
  'INSUFFICIENT_CREDIT',
  'INVALID_REQUEST',
  'MALFORMED_RESPONSE',
  'NETWORK_ERROR',
  'NO_EVICTABLE_HISTORY',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'RUN_ABANDONED',
  'SESSION_LOG_INTEGRITY',
  'SUMMARY_REQUIRED',
  'UNAUTHENTICATED',
  'UPSTREAM_REJECTED',
];

/** Registry entries with a resumable class that no code produces yet (W6, W7, W11 add their producers). */
const notYetProduced = [
  'HOST_NOT_PAIRED',
  'INVOCATION_UNRESOLVED',
  'MODEL_ATTEMPT_OTHER_ACCOUNT',
  'MODEL_STREAM_STALLED',
];

const resumableCodes = Object.keys(refusals).filter((code) => isResumable(code));

describe('the refusal registry (D11, I17)', () => {
  it('should keep isResumable equal to the thirteen-code set plus codes nothing produces yet', () => {
    expect(resumableCodes.toSorted()).toEqual([...todaysResumable, ...notYetProduced].toSorted());
  });

  it('should keep the resumable JSON that ChatLog.tla reads equal to the registry', () => {
    expect([...resumableFailureCodes].toSorted()).toEqual(resumableCodes.toSorted());
  });

  it('should resolve an unknown code to retry never, so a reader never fails on a newer code (D16)', () => {
    expect(refusalOf('A_CODE_FROM_A_NEWER_BUILD')).toEqual({ owner: 'unknown', retry: 'never' });
    expect(refusalOf('toString')).toEqual({ owner: 'unknown', retry: 'never' });
    expect(isResumable('A_CODE_FROM_A_NEWER_BUILD')).toBe(false);
  });

  it('should retain the revision transfer limit owner without automatic retry', () => {
    expect(refusalOf('FETCH_LIMIT_EXCEEDED')).toEqual({ owner: 'revisions', retry: 'never' });
  });

  it('should end no run with a wait code: a wait code is never resumable', () => {
    const waits = Object.entries(refusals).filter(([, entry]) => entry.retry === 'wait');
    expect(waits.length).toBeGreaterThan(0);
    expect(waits.filter(([code]) => isResumable(code))).toEqual([]);
  });

  it('should cover every seam code in the registry', () => {
    // Every typed producer union is a subset of the registry, so a code added to one side alone fails here.
    expectTypeOf<EventLogErrorCode>().toExtend<RefusalCode>();
    expectTypeOf<HostCompactionError['code']>().toExtend<RefusalCode>();
    expectTypeOf<GatewayErrorCode>().toExtend<RefusalCode>();
    expectTypeOf<GatewayModelErrorCode>().toExtend<RefusalCode>();
    expectTypeOf<ExternalAgentRefusalCode>().toExtend<RefusalCode>();
    expectTypeOf<ExternalAgentStopCode>().toExtend<RefusalCode>();
    // The renamed codes are gone (SC T3, T4).
    for (const retired of ['LAUNCHER_CLOSED', 'INTERRUPT_NOT_FOUND', 'LEADER_RESPONSE_TIMEOUT', 'WORKER_CRASHED']) {
      expect(Object.hasOwn(refusals, retired)).toBe(false);
    }
  });
});

describe('the route and account denials (W6, W11a)', () => {
  it.each([
    ['MODEL_ROUTE_PAUSED', 503],
    ['BILLING_ACCOUNT_RESTRICTED', 403],
  ] as const)('should register %s as a gateway code no resume continues', (code, status) => {
    expect(gatewayErrorCodes).toContain(code);
    expect(refusalOf(code)).toEqual({ owner: 'gateway', retry: 'never' });
    expect(isResumable(code)).toBe(false);
    expect(isResumableRunFailure({ code, message: `fixture ${code}`, status })).toBe(false);
    expect(resumableFailureCodes).not.toContain(code);
  });
});
