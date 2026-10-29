import { describe, expect, it } from 'vitest';
import { planTestShards } from '#ci-test-shards.js';

const now = Date.parse('2026-10-29T00:00:00Z');
const environment = { runner: 'ubuntu-latest', nodeMajor: 24, nxVersion: '22.7.12' };
const projects = [
  { name: 'a', fileWeight: 100 },
  { name: 'b', fileWeight: 80 },
  { name: 'c', fileWeight: 60 },
  { name: 'd', fileWeight: 40 },
  { name: 'e', fileWeight: 20 },
];
const history = {
  schemaVersion: 1,
  environment,
  samples: projects.map((p, i) => ({
    project: p.name,
    duration: [10, 10, 80, 100, 90][i]! * 1000,
    observedAt: '2026-10-28T00:00:00Z',
    outcome: 'success',
    cache: 'miss',
    run: '1',
    job: String(i),
    sourceRevision: 'a'.repeat(40),
  })),
};
const plan = (snapshot: unknown = history) => planTestShards({ projects, history: snapshot, environment, now });

describe('CI test shard assignment', () => {
  it('should preserve exactly once coverage while balancing measured durations', () => {
    const result = plan();
    expect(result.strategy).toBe('duration');
    expect(result.shards).toEqual([['d'], ['e', 'b'], ['c', 'a']]);
    expect(result.shards.flat().toSorted()).toEqual(projects.map((p) => p.name).toSorted());
    expect(new Set(result.shards.flat()).size).toBe(projects.length);
  });
  it('should fall back to the complete original assignment when any history is missing', () => {
    const result = plan({ ...history, samples: history.samples.slice(1) });
    expect(result.strategy).toBe('file-count');
    expect(result.shards).toEqual([['a'], ['b', 'e'], ['c', 'd']]);
    expect(result.reason).toContain('a');
    expect(result.weights).toEqual(Object.fromEntries(projects.map((p) => [p.name, p.fileWeight])));
  });
  it.each([null, {}, { ...history, schemaVersion: 2 }, { ...history, environment: { ...environment, nodeMajor: 26 } }])(
    'should use file counts for an incompatible snapshot',
    (snapshot) => {
      expect(plan(snapshot).strategy).toBe('file-count');
    },
  );
  it.each(['failure', 'cancelled', 'skipped'])('should reject non-success observations: %s', (outcome) => {
    expect(plan({ ...history, samples: history.samples.map((s) => ({ ...s, outcome })) }).strategy).toBe('file-count');
  });
  it.each(['local-cache', 'remote-cache'])('should reject cached timings: %s', (cache) => {
    expect(plan({ ...history, samples: history.samples.map((s) => ({ ...s, cache })) }).strategy).toBe('file-count');
  });
  it.each(['2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z', 'invalid'])(
    'should reject stale, future or invalid timestamps: %s',
    (observedAt) => {
      expect(plan({ ...history, samples: history.samples.map((s) => ({ ...s, observedAt })) }).strategy).toBe(
        'file-count',
      );
    },
  );
  it.each([0, -1, Infinity, Number.NaN, '100'])('should reject invalid durations: %s', (duration) => {
    expect(plan({ ...history, samples: history.samples.map((s) => ({ ...s, duration })) }).strategy).toBe('file-count');
  });
  it('should use the median of at most five recent distinct observations per project', () => {
    const samples = [1, 2, 3, 4, 100, 500].flatMap((n, i) =>
      history.samples.map((s) => ({
        ...s,
        duration: n * 1000,
        job: `${s.job}-${i}`,
        observedAt: `2026-10-${22 + i}T00:00:00Z`,
      })),
    );
    const result = plan({ ...history, samples: [...samples, ...samples] });
    expect(result.weights).toEqual({ a: 4000, b: 4000, c: 4000, d: 4000, e: 4000 });
  });
  it('should preserve deterministic ties independent of project input order', () => {
    const tied = { ...history, samples: history.samples.map((s) => ({ ...s, duration: 1000 })) };
    const first = plan(tied);
    const reversed = planTestShards({ projects: [...projects].reverse(), history: tied, environment, now });
    expect(reversed.shards).toEqual(first.shards);
    expect(reversed.identity).toBe(first.identity);
    expect(first.shards).toEqual([['a', 'd'], ['b', 'e'], ['c']]);
  });
  it('should support empty and single-heavy selected sets without duplicating tasks', () => {
    expect(planTestShards({ projects: [], history, environment, now }).shards).toEqual([[], [], []]);
    expect(planTestShards({ projects: [projects[0]!], history, environment, now }).shards).toEqual([['a'], [], []]);
  });
  it('should ignore removed projects and fall back for renamed or new selected projects', () => {
    expect(planTestShards({ projects: projects.slice(1), history, environment, now }).strategy).toBe('duration');
    expect(planTestShards({ projects: [{ name: 'new', fileWeight: 1 }], history, environment, now }).strategy).toBe(
      'file-count',
    );
  });
  it.each(['constructor', 'toString'])('should not mistake an inherited object member for a timing: %s', (name) => {
    const result = planTestShards({ projects: [{ name, fileWeight: 3 }], history, environment, now });
    expect(result.strategy).toBe('file-count');
    expect(result.weights).toEqual({ [name]: 3 });
    expect(result.shards).toEqual([[name], [], []]);
  });
  it('should reject invalid or duplicate selected targets rather than silently losing coverage', () => {
    expect(() => planTestShards({ projects: [...projects, projects[0]!], history, environment, now })).toThrow(
      'duplicate',
    );
    expect(() =>
      planTestShards({ projects: [{ name: 'tag:scope:api', fileWeight: 1 }], history, environment, now }),
    ).toThrow('Invalid project');
  });
});
