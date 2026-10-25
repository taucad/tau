import { describe, expect, it } from 'vitest';
import {
  admissionEntry,
  createJobSnapshotObserver,
  jobAttentionBounds,
  jobEntry,
  machineEntry,
  nodeOsClass,
  preparationEntry,
  reconcileEntry,
  submitEntry,
} from '#client.js';
import type { RuntimeOperationEntry } from '#client.js';
import { parseRuntimeEntry } from '#runtime-ingest.js';

const context = { route: 'cli', caller: 'host', release: '1.2.3', platform: 'node', os: 'linux' } as const;

const admissible = (entry: RuntimeOperationEntry | undefined): void => {
  if (entry === undefined) {
    throw new Error('expected an entry');
  }
  expect(() => parseRuntimeEntry(entry)).not.toThrow();
};

describe('preparationEntry', () => {
  it.each([
    [{ status: 'blocked', reason: 'offline-miss' }, 'refused', 'offline-miss'],
    [{ status: 'failed', code: 'STORE_EXHAUSTED' }, 'refused', 'STORE_EXHAUSTED'],
    [{ status: 'cancelled' }, 'cancelled', undefined],
    [{ status: 'ready' }, 'succeeded', undefined],
  ] as const)('should map %o', (state, outcome, code) => {
    const entry = preparationEntry(state, 120, context);

    admissible(entry);
    expect(entry?.detail).toMatchObject({ operation: 'prepare', outcome });
    expect(entry?.detail.code).toBe(code);
  });

  it.each([{ status: 'idle' }, { status: 'preparing' }] as const)(
    'should skip a state that is not terminal',
    (state) => {
      expect(preparationEntry(state, 0, context)).toBeUndefined();
    },
  );
});

describe('admissionEntry', () => {
  it('should record a refusal before dispatch with its closed code', () => {
    const entry = admissionEntry({ code: 'SESSION_REVOKED' }, context);

    admissible(entry);
    expect(entry.detail).toMatchObject({ operation: 'admit', outcome: 'refused', code: 'SESSION_REVOKED' });
  });
});

describe('submitEntry and reconcileEntry', () => {
  it('should count a deduplicated submit as a success, never an error', () => {
    const entry = submitEntry({ type: 'accepted', deduplicated: true }, 40, context);

    admissible(entry);
    expect(entry.detail).toMatchObject({ operation: 'submit', outcome: 'succeeded', deduplicated: true });
    expect(entry.detail).not.toHaveProperty('code');
  });

  it('should keep a lost reply unknown and reconcile under its own operation', () => {
    expect(submitEntry({ type: 'unknown' }, 0, context).detail.outcome).toBe('unknown');
    const reconciled = reconcileEntry({ type: 'refused', code: 'UNKNOWN' }, 5, context);

    admissible(reconciled);
    expect(reconciled.detail).toMatchObject({ operation: 'reconcile', outcome: 'refused' });
  });
});

describe('jobEntry', () => {
  it.each([
    ['completed', 'succeeded'],
    ['failed', 'failed'],
    ['cancelled', 'cancelled'],
    ['attention_required', 'attention'],
  ] as const)('should map %s to %s', (to, outcome) => {
    const entry = jobEntry({ to, plugin: 'tau.calculix.container', code: 'UNKNOWN' }, 1000, context);

    admissible(entry);
    expect(entry.detail).toMatchObject({ operation: 'job', outcome, plugin: 'tau.calculix.container' });
    expect('code' in entry.detail).toBe(outcome !== 'succeeded');
  });
});

describe('createJobSnapshotObserver', () => {
  const job = (state: string, jobId = 'job-1') => ({ jobId, state, providerId: 'tau.openfoam.container', queuedAt: 0 });

  it('should record each terminal state once and skip non-terminal transitions', () => {
    const recorded: RuntimeOperationEntry[] = [];
    const observe = createJobSnapshotObserver({ record: (entry) => recorded.push(entry), context, now: () => 5000 });

    observe(undefined, job('queued'));
    observe(job('queued'), job('running'));
    observe(job('running'), job('completed'));
    observe(job('completed'), job('completed'));

    expect(recorded.map((entry) => [entry.detail.outcome, entry.duration])).toEqual([['succeeded', 5000]]);
  });

  it('should count attention once per job id, even when it re-enters after waiting', () => {
    const recorded: RuntimeOperationEntry[] = [];
    const observe = createJobSnapshotObserver({ record: (entry) => recorded.push(entry), context });

    observe(job('running'), job('attention_required'));
    observe(job('attention_required'), job('waiting'));
    observe(job('waiting'), job('attention_required'));

    expect(recorded.map((entry) => entry.detail.outcome)).toEqual(['attention']);
  });

  it('should bound the seen-set, so an evicted id may count again', () => {
    const recorded: RuntimeOperationEntry[] = [];
    let clock = 0;
    const observe = createJobSnapshotObserver({ record: (entry) => recorded.push(entry), context, now: () => clock });

    observe(job('running', 'old'), job('attention_required', 'old'));
    clock = jobAttentionBounds.maxAge + 1;
    observe(job('waiting', 'old'), job('attention_required', 'old'));
    for (let index = 0; index < jobAttentionBounds.ids + 1; index += 1) {
      observe(job('running', `job-${index}`), job('attention_required', `job-${index}`));
    }
    observe(job('waiting', 'job-0'), job('attention_required', 'job-0'));

    expect(recorded).toHaveLength(2 + jobAttentionBounds.ids + 1 + 1);
  });

  it('should never throw into the job owner', () => {
    const observe = createJobSnapshotObserver({
      record: () => {
        throw new Error('sink failed');
      },
      context,
    });

    expect(() => {
      observe(job('running'), job('failed'));
    }).not.toThrow();
  });
});

describe('machineEntry', () => {
  it('should map an accepted action with its family and the requester as caller', () => {
    const entry = machineEntry(
      { provider: 'bambu', kind: 'action', action: 'controller.wake', status: 'accepted', requester: 'agent' },
      30,
      { route: 'desktop', release: '1.2.3', platform: 'electron', os: 'macos' },
    );

    admissible(entry);
    expect(entry.detail).toMatchObject({
      operation: 'machine',
      outcome: 'succeeded',
      plugin: 'bambu',
      machineKind: 'action',
      machineAction: 'controller.wake',
      caller: 'agent',
    });
  });

  it('should carry the code on a rejection and a refusal, and no action family off an action', () => {
    const rejected = machineEntry(
      {
        provider: 'grbl',
        kind: 'stop',
        action: 'controller.wake',
        status: 'rejected',
        code: 'MACHINE_ACTION_BUSY',
        requester: 'person',
      },
      0,
      context,
    );

    admissible(rejected);
    expect(rejected.detail).toMatchObject({ outcome: 'issue', code: 'MACHINE_ACTION_BUSY', caller: 'editor' });
    expect(rejected.detail).not.toHaveProperty('machineAction');
    expect(
      machineEntry({ provider: 'grbl', kind: 'hold', status: 'unknown', code: 'X', requester: 'person' }, 0, context)
        .detail,
    ).not.toHaveProperty('code');
  });
});

describe('nodeOsClass', () => {
  it.each([
    ['win32', 'windows'],
    ['darwin', 'macos'],
    ['linux', 'linux'],
    ['freebsd', 'other'],
  ])('should classify %s', (platform, expected) => {
    expect(nodeOsClass(platform)).toBe(expected);
  });
});
