import { describe, expect, it, vi } from 'vitest';
import { parseRuntimeEntry } from '@taucad/telemetry';
import type { RuntimeObservationInput } from '@taucad/telemetry/client';
import { forwardOperations, geoSpecRunOf, geoSpecVerifyEntry } from '#telemetry/worker-forwarding.js';
import type { GeoSpecRunSummary } from '#telemetry/worker-forwarding.js';
import type { ObservedRuntimeClient } from '#telemetry/page-telemetry.js';

const context = { route: 'browser', release: 'abcdef012345', device: 'standard', platform: 'chromium' } as const;

const accounting = (overrides: Partial<NonNullable<GeoSpecRunSummary['accounting']>> = {}) => ({
  selected: 3,
  passed: 3,
  failed: 0,
  requestedFiles: ['model.geo.ts'],
  ...overrides,
});

describe('forwardOperations', () => {
  it('should map each settled attempt with the page context and the worker caller', () => {
    const handlers: Array<(value: RuntimeObservationInput) => void> = [];
    const client = {
      on: vi.fn((event: string, handler: (value: never) => void) => {
        if (event === 'operation') {
          handlers.push(handler);
        }
        return () => undefined;
      }),
    };
    const forward = vi.fn();

    forwardOperations(client as unknown as Pick<ObservedRuntimeClient, 'on'>, 'agent', { context, forward });
    for (const handler of handlers) {
      handler({
        operation: 'render',
        kernel: 'replicad',
        outcome: { type: 'succeeded' },
        transport: 'web-worker',
        adaptations: [],
        limit: undefined,
        format: undefined,
        plugin: undefined,
        duration: 10,
        worker: undefined,
        facts: 'none',
      });
    }

    expect(forward.mock.calls[0]?.[0]).toMatchObject({ name: 'runtime.operation', detail: { caller: 'agent' } });
  });

  it('should lose a forward that throws, never throwing into the runtime', () => {
    let handler: ((value: RuntimeObservationInput) => void) | undefined;
    const client = {
      on: (event: string, next: (value: never) => void) => {
        if (event === 'operation') {
          handler = next;
        }
        return () => undefined;
      },
    };
    forwardOperations(client as unknown as Pick<ObservedRuntimeClient, 'on'>, 'geospec', {
      context,
      forward: () => {
        throw new Error('closed');
      },
    });

    expect(() =>
      handler?.({
        operation: 'evaluate',
        kernel: 'replicad',
        outcome: { type: 'succeeded' },
        transport: 'web-worker',
        adaptations: [],
        limit: undefined,
        format: undefined,
        plugin: undefined,
        duration: 1,
        worker: undefined,
        facts: 'none',
      }),
    ).not.toThrow();
  });
});

describe('geoSpecRunOf', () => {
  const timing = { duration: 40, workUnitLimitArgument: false };

  it('should classify a run that discovered no file as no-files', () => {
    expect(
      geoSpecRunOf(
        { passed: 0, total: 0, failures: [], accounting: accounting({ requestedFiles: [], selected: 0 }) },
        timing,
      ),
    ).toEqual({ status: 'no-files', duration: 40 });
  });

  it('should classify a run with counts as completed', () => {
    expect(
      geoSpecRunOf({ passed: 2, total: 3, failures: [{}], accounting: accounting({ passed: 2, failed: 1 }) }, timing),
    ).toEqual({ status: 'completed', selected: 3, passed: 2, failed: 1, duration: 40 });
  });

  it('should classify a run stopped by its work-unit budget as limit, with the origin it came from', () => {
    const output: GeoSpecRunSummary = {
      passed: 0,
      total: 1,
      failures: [{}],
      accounting: accounting({ selected: 1, passed: 0, failed: 0 }),
      tests: [{ status: 'inconclusive', limit: { kind: 'budget', declared: 1000, measured: 1500 } }],
    };

    expect(geoSpecRunOf(output, timing)).toMatchObject({
      status: 'limit',
      maximum: 1000,
      demand: 1500,
      origin: 'default',
    });
    expect(geoSpecRunOf(output, { ...timing, workUnitLimitArgument: true })).toMatchObject({ origin: 'host-option' });
  });
});

describe('geoSpecVerifyEntry', () => {
  it.each([
    [{ passed: 3, total: 3, failures: [], accounting: accounting() }, 'succeeded'],
    [{ passed: 2, total: 3, failures: [{}], accounting: accounting({ passed: 2, failed: 1 }) }, 'issue'],
    [{ passed: 0, total: 0, failures: [], accounting: accounting({ requestedFiles: [], selected: 0 }) }, 'refused'],
  ] as const)('should build an admissible run-level verify entry (%#)', (output, outcome) => {
    const entry = geoSpecVerifyEntry(output, { duration: 12, workUnitLimitArgument: false }, context);

    expect(entry.detail).toMatchObject({ operation: 'verify', outcome, caller: 'geospec', route: 'browser' });
    expect(() => parseRuntimeEntry(entry)).not.toThrow();
  });
});
