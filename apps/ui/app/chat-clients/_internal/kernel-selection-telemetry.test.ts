import { describe, expect, it, vi } from 'vitest';
import type { ClientMetricEntry } from '@taucad/telemetry';
import { clientMetricEntrySchema } from '@taucad/telemetry';
import { kernelRoutingRubricVersion } from '@taucad/types/constants';
import type { CadAgentExecution } from '@taucad/chat';
import { reportAutoKernelTurn, reportKernelOverride } from '#chat-clients/_internal/kernel-selection-telemetry.js';

/* Blueprint D10: Auto resolved, override after Auto, first outcome; each entry passes the ingest allowlist. */

const tau: CadAgentExecution = { kind: 'tau', model: 'anthropic/claude-sonnet-5-5' };
const acp: CadAgentExecution = { kind: 'acp', hostId: 'desktop', agentId: 'claude', model: 'opus' };
const capture = () => {
  const report = vi.fn<(entry: ClientMetricEntry) => void>();
  const entries = () =>
    report.mock.calls.map(([entry]) => {
      expect(clientMetricEntrySchema.safeParse(entry).success).toBe(true);
      return entry;
    });
  return { report, entries };
};

describe('reportAutoKernelTurn', () => {
  it('reports a first-turn adoption as resolved and ready', () => {
    const { report, entries } = capture();
    reportAutoKernelTurn(
      { ownerAtAdmission: undefined, readOwner: () => 'replicad', execution: tau },
      { agentId: 'tau', turns: 1, evaluated: true },
      report,
    );
    expect(entries()).toEqual([
      {
        name: 'kernel.autoResolved',
        duration: 0,
        detail: {
          hostProfile: 'web',
          agentId: 'tau',
          kernel: 'replicad',
          hadOwner: false,
          model: 'anthropic/claude-sonnet-5-5',
          rubricVersion: kernelRoutingRubricVersion,
        },
      },
      {
        name: 'kernel.firstOutcome',
        duration: 0,
        detail: {
          hostProfile: 'web',
          kernel: 'replicad',
          outcome: 'ready',
          turnsToFirstRender: 1,
          rubricVersion: kernelRoutingRubricVersion,
        },
      },
    ]);
  });

  it('reports a first turn that bound nothing as failed when it evaluated and none when it did not', () => {
    for (const evaluated of [true, false]) {
      const { report, entries } = capture();
      reportAutoKernelTurn(
        { ownerAtAdmission: undefined, readOwner: () => undefined, execution: tau },
        { agentId: 'tau', turns: 1, evaluated },
        report,
      );
      const [resolved, outcome] = entries();
      expect(resolved?.detail).not.toHaveProperty('kernel');
      expect(outcome?.detail).toMatchObject({ outcome: evaluated ? 'failed' : 'none', turnsToFirstRender: 1 });
    }
  });

  it('reports no first outcome once the project already had an owner, and no model for an ACP agent', () => {
    const { report, entries } = capture();
    reportAutoKernelTurn(
      {
        ownerAtAdmission: 'openscad',
        readOwner: () => 'openscad',
        execution: acp,
      },
      { agentId: 'claude', turns: 4, evaluated: true },
      report,
    );
    const reported = entries();
    expect(reported.map((entry) => entry.name)).toEqual(['kernel.autoResolved']);
    expect(reported[0]?.detail).not.toHaveProperty('model');
  });

  it('reports ready on the later turn that first binds a kernel, with the turns it took', () => {
    const { report, entries } = capture();
    reportAutoKernelTurn(
      { ownerAtAdmission: undefined, readOwner: () => 'openscad', execution: tau },
      { agentId: 'tau', turns: 3, evaluated: true },
      report,
    );
    expect(entries()[1]).toMatchObject({ detail: { outcome: 'ready', turnsToFirstRender: 3, kernel: 'openscad' } });
  });
});

describe('reportKernelOverride', () => {
  it('reports the kernel Auto had bound against the manual pick', () => {
    const { report, entries } = capture();
    reportKernelOverride({ resolved: 'openscad', manual: 'replicad', turnsSince: 2 }, report);
    reportKernelOverride({ resolved: undefined, manual: 'build123d', turnsSince: 0 }, report);
    expect(entries().map((entry) => entry.detail)).toEqual([
      { hostProfile: 'web', resolved: 'openscad', manual: 'replicad', turnsSince: 2, rubricVersion: 1 },
      { hostProfile: 'web', manual: 'build123d', turnsSince: 0, rubricVersion: 1 },
    ]);
  });
});
