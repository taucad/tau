import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import knownRed from './baseline/known-red.json' with { type: 'json' };
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { networkKind } from './counters.ts';
/* oxlint-disable no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases. */
import {
  evaluateGate,
  measuredRow,
  p75,
  pendingRow,
  renderMarkdown,
  scenarioTable,
  ratchetAtHead,
  withinBaseline,
} from './scenarios.ts';
/* oxlint-enable no-restricted-imports */
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import type { RowProfile } from './scenarios.ts';

const profile: RowProfile = {
  fixture: { name: 'small', seed: 25, scale: 0.05, files: 100, bytes: 1, revisions: 200 },
  browser: { engine: 'chromium', version: '1' },
  server: 'none',
  network: 'none',
  storage: 'opfs',
};

describe('scenarioTable', () => {
  it('should declare S1–S20 once each, in order', () => {
    expect(scenarioTable.map((row) => row.id)).toStrictEqual(
      Array.from({ length: 20 }, (_, index) => `S${String(index + 1)}`),
    );
  });

  it('should give every gate a unique id prefixed by its scenario', () => {
    const ids = scenarioTable.flatMap((row) => row.gates.map((gate) => gate.id));

    expect(new Set(ids).size).toBe(ids.length);
    for (const row of scenarioTable) {
      expect(row.gates.every((gate) => gate.id.startsWith(`${row.id}.`))).toBe(true);
    }
  });

  it('should list only gates of runnable scenarios as known red', () => {
    const runnable = new Set(
      scenarioTable.filter((row) => row.pending === undefined).flatMap((row) => row.gates.map((gate) => gate.id)),
    );

    for (const gate of knownRed.gates) {
      expect(runnable.has(gate.id), gate.id).toBe(true);
    }
  });

  it("should list each known-red gate with the table's own limit", () => {
    const limits = new Map(scenarioTable.flatMap((row) => row.gates.map((gate) => [gate.id, gate.limit])));
    for (const gate of knownRed.gates) {
      expect(gate.limit, gate.id).toBe(limits.get(gate.id));
    }
  });

  it('should record an atHead value per engine and profile for every known-red gate', () => {
    for (const gate of knownRed.gates) {
      expect(Object.keys(gate.atHead).length, gate.id).toBeGreaterThan(0);
      for (const [key, value] of Object.entries(gate.atHead)) {
        expect(key, gate.id).toMatch(/^(?:chromium|firefox|webkit)-(?:small|full)$/u);
        expect(Number.isFinite(value), gate.id).toBe(true);
      }
    }
  });

  it('should never list a model-bound gate as known red, and give every qualifier a reason', () => {
    const listed = new Set(knownRed.gates.map((gate) => gate.id));
    for (const gate of scenarioTable.flatMap((row) => row.gates)) {
      if (gate.qualifier !== undefined) {
        expect(gate.qualifier.reason.length, gate.id).toBeGreaterThan(20);
      }
      if (gate.qualifier?.kind === 'model-bound') {
        expect(listed.has(gate.id), gate.id).toBe(false);
      }
    }
  });
});

describe('evaluateGate', () => {
  it('should compare against a number or another metric of the row', () => {
    const none = new Set<string>();

    expect(
      evaluateGate(
        { id: 'S3.writes', metric: 'writes', comparison: 'equals', limit: 'files', description: '' },
        { writes: 4, files: 4 },
        none,
      ).pass,
    ).toBe(true);
    expect(
      evaluateGate(
        { id: 'S3.writes', metric: 'writes', comparison: 'equals', limit: 'files', description: '' },
        { writes: 8, files: 4 },
        none,
      ).pass,
    ).toBe(false);
    expect(
      evaluateGate(
        { id: 'S3.lock-sets', metric: 'lockSets', comparison: 'at-most', limit: 1, description: '' },
        { lockSets: 1 },
        none,
      ).pass,
    ).toBe(true);
  });

  it('should fail a gate whose metric is missing and carry its known-red flag', () => {
    const result = evaluateGate(
      { id: 'S5.network', metric: 'networkRequests', comparison: 'equals', limit: 0, description: '' },
      {},
      new Set(['S5.network']),
    );

    expect(result).toMatchObject({ pass: false, knownRed: true, value: undefined });
  });
});

describe('withinBaseline', () => {
  const none = new Set<string>();

  it('should hold an at-most gate to its value at HEAD', () => {
    const gate = { id: 'S3.renames', metric: 'renames', comparison: 'at-most', limit: 0, description: '' } as const;

    expect(withinBaseline(evaluateGate(gate, { renames: 100 }, none), 100)).toBe(true);
    expect(withinBaseline(evaluateGate(gate, { renames: 60 }, none), 100)).toBe(true);
    expect(withinBaseline(evaluateGate(gate, { renames: 101 }, none), 100)).toBe(false);
  });

  it('should let an equals gate move only toward its limit', () => {
    const gate = {
      id: 'S6.hash-passes',
      metric: 'hashPasses',
      comparison: 'equals',
      limit: 1,
      description: '',
    } as const;

    expect(withinBaseline(evaluateGate(gate, { hashPasses: 0 }, none), 0)).toBe(true);
    expect(withinBaseline(evaluateGate(gate, { hashPasses: 1 }, none), 0)).toBe(true);
    /* As far from the limit as at HEAD, but past it: not movement toward it. */
    expect(withinBaseline(evaluateGate(gate, { hashPasses: 2 }, none), 0)).toBe(false);
    expect(withinBaseline(evaluateGate(gate, { hashPasses: 4 }, none), 5)).toBe(true);
    expect(withinBaseline(evaluateGate(gate, { hashPasses: 6 }, none), 5)).toBe(false);
  });

  it('should fail a gate with no value', () => {
    const gate = { id: 'S3.renames', metric: 'renames', comparison: 'at-most', limit: 0, description: '' } as const;

    expect(withinBaseline(evaluateGate(gate, {}, none), 100)).toBe(false);
  });
});

describe('ratchetAtHead', () => {
  const atMost = { comparison: 'at-most', limit: 0 } as const;
  const equals = { comparison: 'equals', limit: 1 } as const;

  it('should keep the better of the recorded and observed value for an at-most gate', () => {
    expect(ratchetAtHead(atMost, { recorded: 100, observed: 60, force: false })).toBe(60);
    expect(ratchetAtHead(atMost, { recorded: 100, observed: 140, force: false })).toBe(100);
  });

  it('should accept an equals gate only moving toward its limit', () => {
    expect(ratchetAtHead(equals, { recorded: 5, observed: 3, force: false })).toBe(3);
    expect(ratchetAtHead(equals, { recorded: 5, observed: 7, force: false })).toBe(5);
    expect(ratchetAtHead(equals, { recorded: 0, observed: 2, force: false })).toBe(0);
  });

  it('should take the observed value when forced, or when nothing was recorded', () => {
    expect(ratchetAtHead(atMost, { recorded: 100, observed: 140, force: true })).toBe(140);
    expect(ratchetAtHead(atMost, { recorded: undefined, observed: 140, force: false })).toBe(140);
    expect(ratchetAtHead(atMost, { recorded: 100, observed: undefined, force: false })).toBe(100);
  });
});

describe('rows', () => {
  it('should report the p75 of each metric over the samples', () => {
    expect(p75([4, 1, 3, 2])).toBe(3);
    const definition = scenarioTable.find((row) => row.id === 'S7');
    if (definition === undefined) {
      throw new Error('S7 is missing.');
    }
    const row = measuredRow(
      definition,
      {
        profile,
        samples: [
          { duration: 10, lockSets: 1 },
          { duration: 30, lockSets: 1 },
        ],
      },
      new Set(),
    );

    expect(row.metrics).toMatchObject({ duration: 30, lockSets: 1 });
    expect(row.times[0]).toMatchObject({ metric: 'duration', value: 30, met: true });
  });

  it('should render a pending row with its gates declared and no values', () => {
    const definition = scenarioTable.find((row) => row.id === 'S1');
    if (definition === undefined) {
      throw new Error('S1 is missing.');
    }
    const markdown = renderMarkdown([pendingRow(definition, profile, new Set())]);

    expect(markdown).toContain('Server: none');
    expect(markdown).toContain('| S1 | Cold open: tree visible | pending |');
    expect(markdown).toContain('declared S1.blob-reads — / 0');
  });

  it('should label model-bound gates as declared and vacuous gates as vacuous', () => {
    const s5 = scenarioTable.find((row) => row.id === 'S5');
    if (s5 === undefined) {
      throw new Error('S5 is missing.');
    }
    const row = measuredRow(
      s5,
      { profile, samples: [{ duration: 1, networkRequests: 0, metadataRequests: 101, bytesRead: 0, files: 100 }] },
      new Set(),
    );
    const markdown = renderMarkdown([row]);

    expect(markdown).toContain('green (vacuous) S5.network');
    expect(markdown).toContain('declared (model-bound) S5.compares');
  });
});

describe('networkKind', () => {
  it('should classify git and LFS requests by route', () => {
    expect(networkKind('https://api.test/git/p.git/info/refs?service=git-upload-pack')).toBe('info-refs');
    expect(networkKind('https://api.test/git/p.git/git-upload-pack')).toBe('upload-pack');
    expect(networkKind('https://api.test/git/p.git/info/lfs/objects/batch')).toBe('lfs-batch');
    expect(networkKind('https://api.test/v1/projects')).toBe('other');
  });
});
