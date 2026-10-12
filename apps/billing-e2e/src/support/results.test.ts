import { describe, expect, it } from 'vitest';
import { assertFilable, renderMatrix } from '#support/results.js';
import type { Row } from '#support/results.js';

const row = (overrides: Partial<Row> & Pick<Row, 'id' | 'outcome'>): Row => ({
  p: 'P0',
  evidence: [],
  requestIds: [],
  calls: [],
  durationMs: 1,
  ...overrides,
});

describe('assertFilable', () => {
  it('should accept a pass or skip without a cause', () => {
    expect(() => {
      assertFilable({ id: 'TU-01', outcome: 'pass', evidence: [] });
    }).not.toThrow();
    expect(() => {
      assertFilable({ id: 'TU-08', outcome: 'skipped', evidence: [] });
    }).not.toThrow();
  });

  it('should refuse a fail or block that names no cause', () => {
    expect(() => {
      assertFilable({ id: 'TU-01', outcome: 'fail', evidence: [] });
    }).toThrow(/must name its finding/u);
    expect(() => {
      assertFilable({ id: 'TU-01', outcome: 'blocked', evidence: [] });
    }).toThrow(/must name its finding/u);
  });

  it('should let a block name a harness issue or a finding seen elsewhere, never unclassified', () => {
    expect(() => {
      assertFilable({ id: 'FD-02', outcome: 'blocked', defect: 'F-24', evidence: [] });
    }).not.toThrow();
    expect(() => {
      assertFilable({ id: 'AC-02', outcome: 'blocked', defect: 'H-05', evidence: [] });
    }).not.toThrow();
    expect(() => {
      assertFilable({ id: 'AC-02', outcome: 'blocked', defect: 'unclassified', evidence: [] });
    }).toThrow(/not unclassified/u);
  });

  it('should let a fail name a finding or stay unclassified, never a harness issue', () => {
    expect(() => {
      assertFilable({ id: 'TU-01', outcome: 'fail', defect: 'F-01', evidence: [] });
    }).not.toThrow();
    expect(() => {
      assertFilable({ id: 'MK-03', outcome: 'fail', defect: 'unclassified', evidence: [] });
    }).not.toThrow();
    expect(() => {
      assertFilable({ id: 'TU-01', outcome: 'fail', defect: 'H-01', evidence: [] });
    }).toThrow(/not H-01/u);
  });
});

describe('renderMatrix', () => {
  const header = { runId: 'run-1', baseUrl: 'https://taucad.dev', apiUrl: 'https://api.taucad.dev' };

  it('should count outcomes and print each row with its cause and first request ids', () => {
    const matrix = renderMatrix(
      {
        rows: [
          row({ id: 'TU-01', outcome: 'pass', evidence: ['paid'], requestIds: ['a', 'b', 'c', 'd', 'e', 'f'] }),
          row({ id: 'FD-02', outcome: 'blocked', defect: 'F-24', evidence: ['502 | UPSTREAM_REJECTED'] }),
        ],
        orphans: [],
      },
      header,
    );
    expect(matrix).toContain('run run-1');
    expect(matrix).toContain('1 pass, 0 fail, 1 blocked, 0 skipped');
    expect(matrix).toContain(
      '| TU-01 | P0 | pass | paid; request ids `a`, `b`, `c`, `d`; +2 more request ids in results.json |',
    );
    expect(matrix).toContain(String.raw`| FD-02 | P0 | blocked (F-24) | 502 \| UPSTREAM_REJECTED |`);
    expect(matrix).not.toContain('could not delete');
  });

  it('should fold whitespace, cut long evidence and list orphaned accounts', () => {
    const matrix = renderMatrix(
      {
        rows: [row({ id: 'AU-01', outcome: 'pass', evidence: [`line\n${'x'.repeat(700)}`] })],
        orphans: [{ caseId: 'au02', email: 'a@b.c', userId: 'u1', reason: 'no session' }],
      },
      header,
    );
    expect(matrix).toContain(`| AU-01 | P0 | pass | line ${'x'.repeat(595)}… |`);
    expect(matrix).toContain('`a@b.c` (user u1, row au02: no session)');
  });
});
