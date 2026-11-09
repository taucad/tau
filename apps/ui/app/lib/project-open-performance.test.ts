import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProjectOpenPerformance,
  pageProjectOpenPerformance,
  readLocalProjectOpenPerformance,
  resetPageProjectOpenPerformance,
} from '#lib/project-open-performance.js';
import type { ProjectOpenPerformanceConfig } from '#lib/project-open-performance.js';

const runId = '123e4567-e89b-42d3-a456-426614174000';
const journeyId = '123e4567-e89b-42d3-a456-426614174001';
const spanId = '123e4567-e89b-42d3-a456-426614174002';
const localConfig = (): ProjectOpenPerformanceConfig => ({
  enabled: true,
  origin: 'http://127.0.0.1:4518',
  runId,
  journeyId,
  buildId: 'cc200962038bb96efab158c77c821c8322a34740',
  fixtureId: 'root-10',
  routeTemplate: '/w/:workspace/:project',
  profile: 'desktop',
  cacheCohort: 'cold',
  realm: 'page',
});

const stubTiming = () => {
  const measure = vi.fn<(name: string, options: PerformanceMeasureOptions) => void>();
  let clock = 10;
  vi.stubGlobal('location', { origin: 'http://127.0.0.1:4518' });
  vi.stubGlobal('performance', { now: () => clock++, timeOrigin: 1000, measure });
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(spanId);
  return measure;
};

afterEach(() => {
  resetPageProjectOpenPerformance();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('local project-open performance recorder', () => {
  it('should be inert without explicit local harness injection', () => {
    const measure = stubTiming();

    expect(readLocalProjectOpenPerformance()).toBeUndefined();
    createProjectOpenPerformance().begin('tree.list').finish('ok', { directoryEntries: 10 });

    expect(measure).not.toHaveBeenCalled();
  });

  it('should reject a nonloopback origin and invalid identifiers', () => {
    const measure = stubTiming();
    vi.stubGlobal('location', { origin: 'https://example.com' });
    vi.stubGlobal('__TAU_LOCAL_PROJECT_OPEN_PERFORMANCE__', {
      ...localConfig(),
      origin: 'https://example.com',
    });
    expect(readLocalProjectOpenPerformance()).toBeUndefined();

    vi.stubGlobal('location', { origin: 'http://127.0.0.1:4518' });
    vi.stubGlobal('__TAU_LOCAL_PROJECT_OPEN_PERFORMANCE__', {
      ...localConfig(),
      fixtureId: '/private/project/source.ts',
    });
    expect(readLocalProjectOpenPerformance()).toBeUndefined();
    expect(measure).not.toHaveBeenCalled();
  });

  it('should snapshot admitted values and emit only bounded aggregate detail once', () => {
    const measure = stubTiming();
    const config = { ...localConfig() };
    vi.stubGlobal('__TAU_LOCAL_PROJECT_OPEN_PERFORMANCE__', config);
    const recorder = readLocalProjectOpenPerformance();
    expect(recorder).toBeDefined();

    const span = recorder?.begin('tree.list');
    Object.assign(config, { fixtureId: '/private/project/source.ts', buildId: 'secret' });
    const counters = { directoryEntries: 10, backendReads: -1, sourcePath: '/private/project/source.ts' };
    span?.finish('ok', counters);
    span?.finish('error');

    expect(measure).toHaveBeenCalledTimes(1);
    expect(measure.mock.calls[0]?.[0]).toBe('tau.load.tree.list');
    expect(measure.mock.calls[0]?.[1]?.detail).toMatchObject({
      schemaVersion: 1,
      buildId: 'cc200962038bb96efab158c77c821c8322a34740',
      fixtureId: 'root-10',
      runId,
      journeyId,
      spanId,
      parentSpanId: null,
      phase: 'tree.list',
      start: 10,
      duration: 1,
      outcome: 'ok',
      counters: { directoryEntries: 10 },
    });
    expect(JSON.stringify(measure.mock.calls)).not.toContain('/private/project/source.ts');
  });

  it('should never let a failed timing observer affect the owning operation', () => {
    const measure = stubTiming();
    measure.mockImplementation(() => {
      throw new Error('Timing observer failed');
    });

    const span = createProjectOpenPerformance(localConfig()).begin('authority.ready');
    expect(() => {
      span.finish('ok');
    }).not.toThrow();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it('should record a span its owner timed, with a closed source and no stray detail', () => {
    const measure = stubTiming();
    const recorder = createProjectOpenPerformance(localConfig());

    recorder.record('canvas.2d', { start: 40, end: 42.5, outcome: 'ok', source: 'gizmo.face' });
    recorder.record('frame.long', { start: 50, end: 120, outcome: 'ok', counters: { blocking: 20, scripts: 3 } });
    recorder.record('viewer.gizmo', {
      start: 60,
      end: 61,
      outcome: 'ok',
      source: '/private/project/source.ts' as 'gizmo.face',
    });
    recorder.record('viewer.mount', { start: Number.NaN, end: 1, outcome: 'ok' });

    expect(measure.mock.calls.map(([name]) => name)).toEqual([
      'tau.load.canvas.2d',
      'tau.load.frame.long',
      'tau.load.viewer.gizmo',
    ]);
    expect(measure.mock.calls[0]?.[1]).toMatchObject({
      start: 40,
      end: 42.5,
      detail: { phase: 'canvas.2d', start: 40, duration: 2.5, source: 'gizmo.face', parentSpanId: null },
    });
    expect(measure.mock.calls[1]?.[1]?.detail).toMatchObject({
      source: null,
      counters: { blocking: 20, scripts: 3 },
    });
    expect(JSON.stringify(measure.mock.calls)).not.toContain('/private/project/source.ts');
  });

  it('should give the page one recorder, inert without an injection', () => {
    const measure = stubTiming();

    const inert = pageProjectOpenPerformance();
    inert.begin('composer.mount').finish('ok');
    inert.record('editor.mount', { start: 1, end: 2, outcome: 'ok' });
    vi.stubGlobal('__TAU_LOCAL_PROJECT_OPEN_PERFORMANCE__', localConfig());

    expect(pageProjectOpenPerformance()).toBe(inert);
    expect(measure).not.toHaveBeenCalled();

    resetPageProjectOpenPerformance();
    pageProjectOpenPerformance().begin('composer.mount').finish('ok');
    expect(measure.mock.calls.map(([name]) => name)).toEqual(['tau.load.composer.mount']);
  });
});
