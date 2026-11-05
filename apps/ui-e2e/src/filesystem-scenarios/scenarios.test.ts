import { describe, expect, it } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import knownRed from './baseline/known-red.json' with { type: 'json' };
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { networkKind } from './counters.ts';
// oxlint-disable-next-line no-restricted-imports -- The Node-only unit target intentionally runs without browser aliases.
import { evaluateGate, measuredRow, p75, pendingRow, renderMarkdown, scenarioTable } from './scenarios.ts';
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
});

describe('networkKind', () => {
  it('should classify git and LFS requests by route', () => {
    expect(networkKind('https://api.test/git/p.git/info/refs?service=git-upload-pack')).toBe('info-refs');
    expect(networkKind('https://api.test/git/p.git/git-upload-pack')).toBe('upload-pack');
    expect(networkKind('https://api.test/git/p.git/info/lfs/objects/batch')).toBe('lfs-batch');
    expect(networkKind('https://api.test/v1/projects')).toBe('other');
  });
});
