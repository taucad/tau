import { describe, expect, it } from 'vitest';
import {
  createMemoryKillSignal,
  killDetectionWindowMilliseconds,
  killMarkerVersion,
  killTrailLimit,
  markerByteLimit,
  pendingKillLimit,
  scrubPath,
  setKillContextSink,
} from '#lib/memory-kill-signal.js';

const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
};

type LoadOptions = Readonly<{ now?: () => number; path?: string; visible?: boolean }>;

/** One document's life: load, maybe work, then either a clean `pagehide` or a kill (nothing). */
const load = (storage: Storage, navigationType: string, { now, path = '/w/a/b', visible = true }: LoadOptions = {}) =>
  createMemoryKillSignal({
    storage,
    navigationType,
    deviceClass: 'constrained',
    now: now ?? (() => 1000),
    readRoute: () => 'routes/w.$workspace.$project',
    readPath: () => path,
    readBuild: () => '1793324757615',
    readVisible: () => visible,
  });

/** The marker as it sits in storage, read only for the fields a test asserts on. */
type StoredMarker = Readonly<{
  version?: number;
  consecutiveKills?: number;
  trail?: readonly unknown[];
  pending?: readonly unknown[];
}>;

const storedMarker = (storage: Storage): StoredMarker =>
  JSON.parse(storage.getItem('tau:alive') ?? '{}') as StoredMarker;

describe('memory kill signal (B-01, D-UI-25, SB3)', () => {
  it('reports one foreground kill when a reload follows a page that never reached pagehide', () => {
    const storage = memoryStorage();
    const killed = load(storage, 'navigate');
    expect(killed.takeDetectedKills()).toEqual([]);
    killed.setCounts({ liveProjectCount: 2, chatCount: 5 });
    killed.breadcrumb('render');
    /* Safari kills the tab: no pagehide, no JS. The person (or Safari) reloads. */

    const next = load(storage, 'reload');
    const [kill, ...rest] = next.takeDetectedKills();

    expect(rest).toEqual([]);
    expect(kill).toMatchObject({
      classification: 'foreground',
      route: 'routes/w.$workspace.$project',
      path: '/w/a/b',
      buildId: '1793324757615',
      deviceClass: 'constrained',
      liveProjectCount: 2,
      chatCount: 5,
      lastActivity: 'render',
      consecutiveKills: 1,
      trail: [{ at: 1000, name: 'render' }],
    });
    /* Exactly one report per kill, per load. */
    expect(next.takeDetectedKills()).toEqual([]);
  });

  it('reports nothing for a normal reload that reached pagehide', () => {
    const storage = memoryStorage();
    const page = load(storage, 'navigate');
    page.takeDetectedKills();
    page.breadcrumb('open');
    page.finish();

    expect(load(storage, 'reload').takeDetectedKills()).toEqual([]);
  });

  it('reports a kill when iOS calls the return a navigation to the same path inside the window', () => {
    const storage = memoryStorage();
    const killed = load(storage, 'navigate', { now: () => 10_000 });
    killed.takeDetectedKills();
    killed.breadcrumb('export');

    const soon = load(storage, 'navigate', { now: () => 10_000 + killDetectionWindowMilliseconds - 1 });

    expect(soon.takeDetectedKills()).toHaveLength(1);
  });

  it('reports nothing for a navigation to another path, or to the same one long after', () => {
    const storage = memoryStorage();
    const first = load(storage, 'navigate');
    first.takeDetectedKills();
    first.breadcrumb('open');

    expect(load(storage, 'navigate', { path: '/w/a/other' }).takeDetectedKills()).toEqual([]);

    const later = load(storage, 'navigate', { now: () => 1000 + killDetectionWindowMilliseconds });
    expect(later.takeDetectedKills()).toEqual([]);
  });

  it('classifies a kill on a hidden page as a background discard and says how long it was hidden', () => {
    const storage = memoryStorage();
    let clock = 1000;
    const page = createMemoryKillSignal({
      storage,
      navigationType: 'navigate',
      deviceClass: 'standard',
      now: () => clock,
      readPath: () => '/w/a/b',
      readVisible: () => clock < 5000,
    });
    page.takeDetectedKills();
    clock = 5000;
    page.observeVisibility();
    clock = 9000;
    /* Work in a hidden tab still writes; only the heartbeat holds off. */
    page.breadcrumb('render');
    page.heartbeat();

    const [kill] = load(storage, 'reload', { now: () => 12_000 }).takeDetectedKills();

    expect(kill).toMatchObject({ classification: 'background', hiddenForMilliseconds: 4000 });
  });

  it('counts kills in a row, and starts again after a clean finish', () => {
    const storage = memoryStorage();
    load(storage, 'navigate').takeDetectedKills();
    /* Each load reports and settles its kill, as a delivering page does. */
    const reportAndSettle = (): number | undefined => {
      const page = load(storage, 'reload');
      const kills = page.takeDetectedKills();
      for (const kill of kills) {
        page.settleKill(kill.id);
      }
      return kills.at(-1)?.consecutiveKills;
    };

    expect(reportAndSettle()).toBe(1);
    expect(reportAndSettle()).toBe(2);
    expect(reportAndSettle()).toBe(3);

    const clean = load(storage, 'reload');
    for (const kill of clean.takeDetectedKills()) {
      clean.settleKill(kill.id);
    }
    clean.finish();

    expect(load(storage, 'reload').takeDetectedKills()).toEqual([]);
    expect(storedMarker(storage).consecutiveKills).toBe(0);
  });

  it('keeps an unreported kill in the marker until it is settled, and never past the pending limit (G17)', () => {
    const storage = memoryStorage();
    load(storage, 'navigate').takeDetectedKills();
    /* Each load is killed again before it can report, so the undelivered kills pile up. */
    for (let loads = 0; loads < pendingKillLimit + 2; loads += 1) {
      load(storage, 'reload').takeDetectedKills();
    }
    const { pending } = storedMarker(storage);
    expect(pending).toHaveLength(pendingKillLimit);

    const reporting = load(storage, 'reload');
    const carried = reporting.takeDetectedKills();
    expect(carried.length).toBe(pendingKillLimit + 1);
    for (const kill of carried) {
      reporting.settleKill(kill.id);
    }

    expect(storedMarker(storage).pending).toEqual([]);
    /* A settled kill is gone for good, even though this page then dies too. */
    expect(load(storage, 'reload').takeDetectedKills()).toHaveLength(1);
  });

  it('keeps the trail to the newest names and the marker inside its byte budget', () => {
    const storage = memoryStorage();
    const page = load(storage, 'navigate');
    page.takeDetectedKills();
    for (let index = 0; index < killTrailLimit + 5; index += 1) {
      page.breadcrumb(`render.step-${String(index)}`);
    }
    const { trail, version } = storedMarker(storage);

    expect(trail).toHaveLength(killTrailLimit);
    expect(trail?.at(-1)).toEqual({
      at: 1000,
      name: `render.step-${String(killTrailLimit + 4)}`,
    });
    expect(version).toBe(killMarkerVersion);
    expect(new TextEncoder().encode(storage.getItem('tau:alive') ?? '').length).toBeLessThanOrEqual(markerByteLimit);
  });

  it('ignores a marker of another shape rather than reading its fields', () => {
    const storage = memoryStorage();
    storage.setItem('tau:alive', JSON.stringify({ finished: false, startedAt: 1, updatedAt: 2 }));

    expect(load(storage, 'reload').takeDetectedKills()).toEqual([]);
  });

  it('works without storage at all, as in a private window', () => {
    const page = createMemoryKillSignal({ storage: undefined, navigationType: 'reload', deviceClass: 'standard' });

    expect(page.takeDetectedKills()).toEqual([]);
    expect(() => {
      page.breadcrumb('open');
      page.heartbeat();
      page.finish();
    }).not.toThrow();
  });

  it('hands the live kill context to the sink as tags, only when it changes (D13)', () => {
    const published: Array<Readonly<Record<string, string>>> = [];
    setKillContextSink((tags) => {
      published.push(tags);
    });
    try {
      const signal = load(memoryStorage(), 'navigate');
      signal.takeDetectedKills();
      signal.breadcrumb('open');
      signal.setCounts({ liveProjectCount: 2, chatCount: 1 });
      signal.heartbeat();
      /* eslint-disable @typescript-eslint/naming-convention -- Sentry tag names. */
      expect(published.at(-1)).toStrictEqual({
        route: 'routes/w.$workspace.$project',
        last_activity: 'open',
        live_project_count: '2',
        chat_count: '1',
        device_class: 'constrained',
      });
      /* eslint-enable @typescript-eslint/naming-convention -- Sentry tag names. */
      const count = published.length;
      signal.heartbeat();
      expect(published).toHaveLength(count);

      const late: Array<Readonly<Record<string, string>>> = [];
      setKillContextSink((tags) => {
        late.push(tags);
      });
      expect(late).toStrictEqual([published.at(-1)]);
    } finally {
      setKillContextSink(undefined);
    }
  });

  describe('marker v3: the work block (crash capture blueprint)', () => {
    it('carries what the page was working on into the kill, in the order one render writes it', () => {
      const storage = memoryStorage();
      let clock = 1000;
      const page = load(storage, 'navigate', { now: () => clock });
      page.takeDetectedKills();
      const phases: unknown[] = [];
      const step = (patch: Readonly<Record<string, unknown>>): void => {
        clock += 100;
        page.work(patch);
        phases.push(page.currentWork().phase);
      };
      step({ kernel: 'replicad', builtin: 'replicad.worm-gear-system', shareProvider: 'builtin' });
      step({ phase: 'kernel-init' });
      step({ phase: 'evaluate' });
      step({ phase: 'mesh', renderCount: 1 });
      step({ phase: 'geometry-receive', geometryBytes: 50_000_000, triangles: 2_000_000 });
      step({ phase: 'gpu-upload', backend: 'webgl' });

      const [kill] = load(storage, 'reload').takeDetectedKills();

      expect(phases).toEqual(['boot', 'kernel-init', 'evaluate', 'mesh', 'geometry-receive', 'gpu-upload']);
      expect(kill?.work).toEqual({
        kernel: 'replicad',
        builtin: 'replicad.worm-gear-system',
        shareProvider: 'builtin',
        phase: 'gpu-upload',
        phaseStartedAt: 1600,
        renderCount: 1,
        geometryBytes: 50_000_000,
        triangles: 2_000_000,
        backend: 'webgl',
      });
    });

    it('accepts nothing but closed names and finite numbers', () => {
      const page = load(memoryStorage(), 'navigate');
      page.takeDetectedKills();
      page.work({
        kernel: 'Model by Alice <script>',
        builtin: 'gist secret',
        shareProvider: 'my-server',
        phase: 'rendering my file.ts',
        lastInteraction: 'typed hello',
        triangles: Number.NaN,
        geometryBytes: -1,
        source: 'const secret = 1;',
      });

      expect(page.currentWork()).toEqual({ phase: 'boot', phaseStartedAt: 1000 });
    });

    it('stays under the budget with a full work block and three pending kills', () => {
      const storage = memoryStorage();
      const full = {
        kernel: 'replicad',
        builtin: 'replicad.worm-gear-system',
        shareProvider: 'builtin',
        phase: 'gpu-upload',
        renderCount: 99,
        lastEvaluate: 123_456,
        lastRender: 123_456,
        triangles: 999_999_999,
        geometryBytes: 999_999_999,
        gpuGeometries: 9999,
        textures: 9999,
        peakWasmBytes: 4_000_000_000,
        backend: 'webgpu',
        contextLost: true,
        lastInteraction: 'parameter',
        interactionAt: 1_793_324_757_000,
        parameterChanges: 999,
      };
      for (let index = 0; index < pendingKillLimit + 2; index += 1) {
        const page = load(storage, 'reload');
        page.takeDetectedKills();
        page.work(full);
        for (let crumb = 0; crumb < killTrailLimit; crumb += 1) {
          page.breadcrumb('render');
        }
      }

      expect(new TextEncoder().encode(storage.getItem('tau:alive') ?? '').length).toBeLessThanOrEqual(markerByteLimit);
      expect(storedMarker(storage).pending?.length).toBeGreaterThan(0);
    });

    it('ignores a version 2 marker', () => {
      const storage = memoryStorage();
      storage.setItem(
        'tau:alive',
        JSON.stringify({ version: 2, finished: false, startedAt: 1, updatedAt: 2, trail: [], pending: [] }),
      );

      expect(load(storage, 'reload').takeDetectedKills()).toEqual([]);
    });

    it('keeps a builtin share reference and removes any other', () => {
      expect(scrubPath('/s/builtin~replicad.worm-gear-system')).toBe('/s/builtin~replicad.worm-gear-system');
      expect(scrubPath('/s/github-gist~aliceabc123?x=1#frag')).toBe('/s/github-gist~…');
      expect(scrubPath('/s/tau~pub_123/edit')).toBe('/s/tau~…/edit');
      expect(scrubPath('/s/direct')).toBe('/s/direct');
      expect(scrubPath('/w/a/b?q=1')).toBe('/w/a/b');
    });
  });
});
