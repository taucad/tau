import type { ComponentObservation, MachineReport } from '@taucad/runtime/machine';
import { describe, expect, it } from 'vitest';

import { grblObservation } from '#grbl.report.js';

const position = (x: number, receivedAt: string): ComponentObservation => ({
  componentId: 'motion',
  group: 'position',
  receivedAt,
  knowledge: 'known',
  value: { kind: 'switch', on: x > 0 },
});

const tools: ComponentObservation = {
  componentId: 'tools',
  group: 'tools',
  receivedAt: '2026-10-09T12:00:00.000Z',
  knowledge: 'unknown',
  reason: 'Not reported yet.',
};

const report = (components: readonly ComponentObservation[], status: 'ready' | 'active' = 'ready'): MachineReport => ({
  connection: 'connected',
  observedAt: components[0]?.receivedAt ?? '2026-10-09T12:00:00.000Z',
  state: { status },
  components,
  activities: [],
  checks: [],
  availability: [],
  alerts: [],
});

describe('grblObservation', () => {
  const first = report([position(0, '2026-10-09T12:00:00.000Z'), tools]);

  it('starts with a snapshot', () => {
    expect(grblObservation(undefined, first)).toEqual({ type: 'snapshot', snapshot: first });
  });

  it('sends only the groups that moved, a fresh receivedAt included, while nothing else changed', () => {
    const next = report([position(0, '2026-10-09T12:00:00.200Z'), tools]);
    expect(grblObservation(first, next)).toEqual({
      type: 'changed',
      observedAt: '2026-10-09T12:00:00.200Z',
      components: [position(0, '2026-10-09T12:00:00.200Z')],
    });
  });

  it('sends a snapshot when more than the components moved, and nothing when nothing moved', () => {
    const active = report([position(0, '2026-10-09T12:00:00.000Z'), tools], 'active');
    expect(grblObservation(first, active)).toEqual({ type: 'snapshot', snapshot: active });
    expect(grblObservation(first, report([position(0, '2026-10-09T12:00:00.000Z'), tools]))).toBeUndefined();
  });
});
