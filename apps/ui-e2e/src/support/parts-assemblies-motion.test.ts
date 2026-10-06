import { contentDigest } from '@taucad/cache-core';
import type { TelemetrySpanRecord } from '@taucad/runtime/types';
import { expect, it, vi } from 'vitest';
import type { BrowserCommandContext } from 'vitest/node';
import { mock, mockDeep } from 'vitest-mock-extended';
import type { JSHandle } from 'playwright';
import type { HostEngine, HostSubjectLifecycle } from '@taucad/geospec-engine-native/node';
import { testBaseURL } from '#support/base-url.js';
import { uiCloseTarget, uiMotionNativeOracle, uiOpenTarget } from '#support/browser-command.js';
import type { Mechanism } from '@taucad/kinematics';
import {
  expectedMotionLinkDisplacements,
  expectedMotionSourceCorners,
  expectedMotionBodyCentroid,
  expectedMotionBoxMinimum,
  invertMotionMatrix,
  multiplyMotionMatrices,
  transformMotionPoint,
  verifyDrainedMotionActivity,
  verifyNoMotionThumbnailJobs,
  getMotionBodyCandidate,
  queryObservedMotionNativeOracle,
  isMotionPosedExportQualified,
} from '#support/parts-assemblies-motion.js';
import type { MotionNativeOracleInput, MotionPosedExport } from '#support/parts-assemblies-motion.js';

const mechanism: Mechanism = {
  schemaVersion: 1,
  units: { length: 'm', angle: 'rad' },
  root: 'base',
  links: { base: { components: [] }, first: { components: ['first'] }, second: { components: ['second'] } },
  joints: {
    parent: {
      type: 'revolute',
      parent: 'base',
      child: 'first',
      origin: [0, 0, 0],
      axis: [0, 0, 1],
      limits: { lower: -Math.PI, upper: Math.PI },
    },
    child: {
      type: 'revolute',
      parent: 'first',
      child: 'second',
      origin: [10, 0, 0],
      axis: [0, 0, 1],
      limits: { lower: -Math.PI / 2, upper: Math.PI / 2 },
    },
  },
  couplings: [{ driver: 'parent', follower: 'child', ratio: -0.5 }],
};

it('should independently compose differently linked children, coupling and an observed render frame', () => {
  const displacement = expectedMotionLinkDisplacements(mechanism, { parent: Math.PI / 2 }).get('second');
  if (!displacement) {
    throw new Error('Missing expected second link.');
  }
  // Source intrinsic S has already placed the source body centroid at (11,0). Child -45 then parent90.
  const sourcePoint = transformMotionPoint(displacement, [11, 0, 0]);
  expect(sourcePoint[0]).toBeCloseTo(Math.SQRT1_2, 12);
  expect(sourcePoint[1]).toBeCloseTo(10 + Math.SQRT1_2, 12);
  const canonicalToRender = [1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, 100, 200, 300, 1];
  const asBuiltDraw = [1000, 0, 0, 0, 0, 1000, 0, 0, 0, 0, 1000, 0, 10_100, 200, 300, 1];
  const placed = multiplyMotionMatrices(
    multiplyMotionMatrices(
      multiplyMotionMatrices(canonicalToRender, displacement),
      invertMotionMatrix(canonicalToRender),
    ),
    asBuiltDraw,
  );
  const renderPoint = transformMotionPoint(placed, [1, 0, 0]);
  expect(renderPoint[0]).toBeCloseTo(100 + 1000 * Math.SQRT1_2, 8);
  expect(renderPoint[1]).toBeCloseTo(200 + 1000 * (10 + Math.SQRT1_2), 8);
  expect(renderPoint[2]).toBe(300);
});

it('should deny missing drivers, violated constraints and a singular observed frame', () => {
  expect(() => expectedMotionLinkDisplacements(mechanism, {})).toThrow('Missing actual driver coordinate');
  expect(() => expectedMotionLinkDisplacements(mechanism, { parent: Math.PI * 2 })).toThrow('authored limits');
  expect(() => invertMotionMatrix([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toThrow('singular');
});

const completedSpan = (id: number, name: string, startTime: number): TelemetrySpanRecord => ({
  name,
  startTime,
  duration: 1,
  detail: { spanId: String(id) },
  workerTimeOrigin: 1_000_000,
  epoch: 1_000_000,
  origin: { label: 'worker', instance: 'real-captured-producer' },
});
const beforeActivity = {
  telemetryEntries: [completedSpan(11, 'export.writeStep', 9), completedSpan(10, 'export.exportSTEP', 8)],
  lastRequestedRenderId: 3,
  lastSettledRenderId: 3,
};
const afterActivity = {
  ...beforeActivity,
  telemetryEntries: [
    ...beforeActivity.telemetryEntries,
    completedSpan(12, 'fs.read', 35),
    { ...completedSpan(14, 'step.writer.perform', 40), detail: { spanId: '14', parentSpanId: '13' } },
    completedSpan(13, 'export.exportSTEP', 40),
  ],
};
const animationInterval = {
  before: beforeActivity,
  during: beforeActivity,
  after: afterActivity,
  intervalStart: 1_000_020,
  intervalEnd: 1_000_030,
};

it('should qualify a complete same-producer native drain interval without substituting request IDs for spans', () => {
  const evidence = verifyDrainedMotionActivity(animationInterval);
  expect(evidence).toMatchObject({
    origin: 'real-captured-producer',
    beforeSpanId: 11,
    afterSpanId: 14,
    observedSpans: 3,
  });
  expect(Object.values(evidence.counts).every((count) => count === 0)).toBe(true);
});
it('should reject work started during animation that completes only after the interval checkpoint', () => {
  expect(() =>
    verifyDrainedMotionActivity({
      ...animationInterval,
      after: {
        ...afterActivity,
        telemetryEntries: afterActivity.telemetryEntries.map((entry) =>
          entry.detail?.['spanId'] === '12' ? { ...entry, startTime: 25, duration: 10 } : entry,
        ),
      },
    }),
  ).toThrow('overlapped the actual animation interval');
});
it('should deny missing drain markers, span gaps, truncation, new source work and producer replacement', () => {
  expect(() =>
    verifyDrainedMotionActivity({ ...animationInterval, before: { ...beforeActivity, telemetryEntries: [] } }),
  ).toThrow('before animation');
  expect(() =>
    verifyDrainedMotionActivity({
      ...animationInterval,
      after: {
        ...afterActivity,
        telemetryEntries: afterActivity.telemetryEntries.filter(({ detail }) => detail?.['spanId'] !== '12'),
      },
    }),
  ).toThrow('Incomplete runtime span');
  expect(() =>
    verifyDrainedMotionActivity({
      ...animationInterval,
      after: { ...afterActivity, telemetryEntries: afterActivity.telemetryEntries.slice(1) },
    }),
  ).toThrow('lost, truncated');
  for (const name of ['kernel.compute', 'kernel.execute', 'kernel.render', 'create.serializeNativeHandle']) {
    expect(() =>
      verifyDrainedMotionActivity({
        ...animationInterval,
        after: {
          ...afterActivity,
          telemetryEntries: afterActivity.telemetryEntries.map((entry) =>
            entry.detail?.['spanId'] === '12' ? { ...entry, name } : entry,
          ),
        },
      }),
    ).toThrow('performed observed');
  }
  expect(() =>
    verifyDrainedMotionActivity({
      ...animationInterval,
      after: {
        ...afterActivity,
        telemetryEntries: afterActivity.telemetryEntries.map((entry) =>
          entry.detail?.['spanId'] === '13' ? { ...entry, origin: { label: 'worker', instance: 'replaced' } } : entry,
        ),
      },
    }),
  ).toThrow('Runtime producer changed');
  expect(() => verifyDrainedMotionActivity({ ...animationInterval, intervalEnd: 1_000_041 })).toThrow('bracket');
  expect(() =>
    verifyDrainedMotionActivity({ ...animationInterval, after: { ...afterActivity, lastRequestedRenderId: 4 } }),
  ).toThrow('CAD request');
});

const clippedBefore = {
  ...beforeActivity,
  telemetryEntries: [
    ...Array.from({ length: 12 }, (_, index) => completedSpan(173 + index, 'fs.read', 1)),
    ...['step.product.prepare', 'step.document.build', 'step.writer.perform', 'step.file.transfer'].map(
      (name, index) => ({
        ...completedSpan(186 + index, name, 8),
        detail: { spanId: String(186 + index), parentSpanId: '185' },
      }),
    ),
    completedSpan(185, 'export.exportSTEP', 8),
    ...Array.from({ length: 6 }, (_, index) => completedSpan(190 + index, 'fs.read', 10)),
    { ...completedSpan(197, 'image.render', 12), detail: { spanId: '197', parentSpanId: '196' } },
    completedSpan(196, 'kernel.transcode', 12),
  ],
};
const clippedAfter = {
  ...beforeActivity,
  telemetryEntries: [
    ...Array.from({ length: 18 }, (_, index) => completedSpan(198 + index, 'fs.read', index < 6 ? 15 : 35)),
    ...['step.product.prepare', 'step.document.build', 'step.writer.perform', 'step.file.transfer'].map(
      (name, index) => ({
        ...completedSpan(217 + index, name, 40),
        detail: { spanId: String(217 + index), parentSpanId: '216' },
      }),
    ),
    completedSpan(216, 'export.exportSTEP', 40),
  ],
};
const clippedDuring = {
  ...beforeActivity,
  telemetryEntries: [
    ...clippedBefore.telemetryEntries.slice(-2),
    ...Array.from({ length: 6 }, (_, index) => completedSpan(198 + index, 'fs.read', 15)),
  ],
};
const clippedInterval = { ...animationInterval, before: clippedBefore, during: clippedDuring, after: clippedAfter };

it('should qualify the complete motion interval after exact twenty-root historical eviction', () => {
  expect(clippedBefore.telemetryEntries.filter((entry) => entry.detail?.parentSpanId === undefined)).toHaveLength(20);
  expect(clippedAfter.telemetryEntries.some((entry) => entry.detail?.spanId === '196')).toBe(false);
  expect(verifyDrainedMotionActivity(clippedInterval)).toMatchObject({
    beforeSpanId: 197,
    afterSpanId: 220,
    observedSpans: 23,
  });
  expect(Object.values(verifyDrainedMotionActivity(clippedInterval).counts).every((count) => count === 0)).toBe(true);
});
it('should retain one complete post-animation batch when the actor trims more than twenty new roots', () => {
  const ingress = [
    ...clippedAfter.telemetryEntries,
    ...Array.from({ length: 4 }, (_, index) => completedSpan(221 + index, 'fs.read', 45)),
  ];
  const after = { ...clippedAfter, telemetryEntries: ingress.slice(3) };
  const observed = { ...clippedInterval, during: clippedBefore, after };
  expect(ingress.filter((entry) => entry.detail?.parentSpanId === undefined)).toHaveLength(23);
  expect(after.telemetryEntries.filter((entry) => entry.detail?.parentSpanId === undefined)).toHaveLength(20);
  expect(after.telemetryEntries.some((entry) => entry.detail?.spanId === '198')).toBe(false);
  expect(() => verifyDrainedMotionActivity(observed)).toThrow('lost, truncated');
  expect(verifyDrainedMotionActivity({ ...observed, ingress: { during: [], after: ingress } })).toMatchObject({
    beforeSpanId: 197,
    afterSpanId: 224,
    observedSpans: 27,
  });
  const reanchored = ingress.map((entry) =>
    entry.detail?.spanId === '224' ? { ...entry, epoch: entry.epoch + 1 } : entry,
  );
  expect(
    verifyDrainedMotionActivity({
      ...observed,
      after: { ...after, telemetryEntries: reanchored.slice(3) },
      ingress: { during: [], after: reanchored },
    }),
  ).toMatchObject({ beforeSpanId: 197, afterSpanId: 224 });
  expect(() => verifyDrainedMotionActivity({ ...observed, ingress: { during: [], after: ingress.slice(1) } })).toThrow(
    'Incomplete runtime span',
  );
  const delayed = ingress.map((entry) =>
    entry.detail?.spanId === '210' ? { ...entry, startTime: 25, duration: 10 } : entry,
  );
  expect(() =>
    verifyDrainedMotionActivity({
      ...observed,
      after: { ...after, telemetryEntries: delayed.slice(3) },
      ingress: { during: [], after: delayed },
    }),
  ).toThrow('overlapped the actual animation interval');
  expect(() =>
    verifyDrainedMotionActivity({
      ...observed,
      ingress: {
        during: [],
        after: ingress.map((entry) =>
          entry.detail?.spanId === '210' ? { ...entry, origin: { label: 'worker', instance: 'unknown' } } : entry,
        ),
      },
    }),
  ).toThrow('Runtime producer changed');
  expect(() =>
    verifyDrainedMotionActivity({
      ...observed,
      ingress: {
        during: [],
        after: Array.from({ length: 2001 }, (_, index) => completedSpan(index + 198, 'fs.read', 45)),
      },
    }),
  ).toThrow('capacity');
});
it('should deny missing frontier or interval records after historical eviction', () => {
  for (const id of ['196', '197']) {
    expect(() =>
      verifyDrainedMotionActivity({
        ...clippedInterval,
        during: {
          ...clippedDuring,
          telemetryEntries: clippedDuring.telemetryEntries.filter((entry) => entry.detail?.spanId !== id),
        },
      }),
    ).toThrow('lost, truncated or replaced');
  }
  for (const id of ['198', '217']) {
    expect(() =>
      verifyDrainedMotionActivity({
        ...clippedInterval,
        during:
          id === '198'
            ? {
                ...clippedDuring,
                telemetryEntries: clippedDuring.telemetryEntries.filter((entry) => entry.detail?.spanId !== id),
              }
            : clippedDuring,
        after: {
          ...clippedAfter,
          telemetryEntries: clippedAfter.telemetryEntries.filter((entry) => entry.detail?.spanId !== id),
        },
      }),
    ).toThrow('Incomplete runtime span');
  }
  expect(() =>
    verifyDrainedMotionActivity({
      ...clippedInterval,
      after: {
        ...clippedAfter,
        telemetryEntries: clippedAfter.telemetryEntries.filter((entry) => entry.detail?.spanId !== '203'),
      },
    }),
  ).toThrow('lost, truncated or replaced');
  expect(() =>
    verifyDrainedMotionActivity({
      ...clippedInterval,
      during: {
        ...clippedDuring,
        telemetryEntries: [
          ...clippedDuring.telemetryEntries,
          {
            ...completedSpan(204, 'fs.read', 35),
            origin: { label: 'worker', instance: 'intermediate-producer' },
          },
        ],
      },
    }),
  ).toThrow('Runtime producer changed');
});
it('should deny changed clocks and unclassified or unfinished work after historical eviction', () => {
  const controls = [
    {
      replacement: { ...completedSpan(204, 'fs.read', 35), workerTimeOrigin: 1_000_001 },
      message: 'clock or label changed',
    },
    { replacement: completedSpan(204, 'unknown.work', 35), message: 'Unclassified runtime work' },
    {
      replacement: {
        ...completedSpan(217, 'step.product.prepare', 40),
        epoch: 1_000_001,
        detail: { spanId: '217', parentSpanId: '216' },
      },
      message: 'compound runtime trace',
    },
    {
      replacement: {
        ...completedSpan(217, 'step.product.prepare', 40),
        detail: { spanId: '217', parentSpanId: '215' },
      },
      message: 'Unclassified runtime work',
    },
    { replacement: completedSpan(204, 'kernel.compute', 35), message: 'performed observed' },
    {
      replacement: { ...completedSpan(204, 'fs.read', 35), origin: { label: 'worker', instance: 'unknown-producer' } },
      message: 'Runtime producer changed',
    },
  ];
  for (const { replacement, message } of controls) {
    const { spanId } = replacement.detail ?? {};
    expect(() =>
      verifyDrainedMotionActivity({
        ...clippedInterval,
        after: {
          ...clippedAfter,
          telemetryEntries: clippedAfter.telemetryEntries.map((entry) =>
            entry.detail?.spanId === spanId ? replacement : entry,
          ),
        },
      }),
    ).toThrow(message);
  }
  expect(() =>
    verifyDrainedMotionActivity({
      ...clippedInterval,
      during: {
        ...clippedDuring,
        telemetryEntries: clippedDuring.telemetryEntries.map((entry) =>
          entry.detail?.spanId === '196' ? completedSpan(196, 'rewritten.frontier', 12) : entry,
        ),
      },
    }),
  ).toThrow('lost, truncated or replaced');
  expect(() =>
    verifyDrainedMotionActivity({
      ...clippedInterval,
      after: {
        ...clippedAfter,
        telemetryEntries: [...clippedAfter.telemetryEntries, completedSpan(172, 'fs.read', 35)],
      },
    }),
  ).toThrow('Work active before animation');
  expect(() =>
    verifyDrainedMotionActivity({
      ...clippedInterval,
      after: {
        ...clippedAfter,
        telemetryEntries: Array.from({ length: 2000 }, (_, index) => completedSpan(index, 'fs.read', 35)),
      },
    }),
  ).toThrow('retained evidence capacity');
});

const warmMotionHeadless = [
  { name: 'queue.admit', startTime: 1, duration: 0, detail: { kind: 'capture', identity: 'actual-warm-capture' } },
  { name: 'queue.wait', startTime: 1, duration: 1, detail: { kind: 'capture', identity: 'actual-warm-capture' } },
  {
    name: 'job.complete',
    startTime: 2,
    duration: 1,
    detail: { kind: 'capture', identity: 'actual-warm-capture', success: true },
  },
];

it('should deny a queued but unexecuted canonical thumbnail admission during motion', () => {
  const after = [
    ...warmMotionHeadless,
    {
      name: 'queue.admit',
      startTime: 4,
      duration: 0,
      detail: { kind: 'automatic-thumbnail', identity: 'held-not-executed' },
    },
  ];
  expect(() => verifyNoMotionThumbnailJobs(warmMotionHeadless, after)).toThrow('canonical thumbnail work');
});

it('should require real warm admission completion and deny unresolved baseline work or lost capacity', () => {
  expect(verifyNoMotionThumbnailJobs(warmMotionHeadless, warmMotionHeadless)).toEqual({
    admitted: 0,
    completed: 0,
    transcodes: 0,
  });
  expect(() => verifyNoMotionThumbnailJobs([], [])).toThrow('actual completed');
  expect(() => verifyNoMotionThumbnailJobs(warmMotionHeadless, [])).toThrow('lost, truncated');
  const completionOnly = [warmMotionHeadless[2]!];
  expect(() => verifyNoMotionThumbnailJobs(completionOnly, completionOnly)).toThrow('no retained admission');
  const wrongIdentity = [
    ...warmMotionHeadless.slice(0, 2),
    {
      ...warmMotionHeadless[2]!,
      detail: { kind: 'capture', identity: 'other-capture', success: true },
    },
  ];
  expect(() => verifyNoMotionThumbnailJobs(wrongIdentity, wrongIdentity)).toThrow('no retained admission');
  const failedWarm = warmMotionHeadless.map((entry) =>
    entry.name === 'job.complete' ? { ...entry, detail: { ...entry.detail, success: false } } : entry,
  );
  expect(() => verifyNoMotionThumbnailJobs(failedWarm, failedWarm)).toThrow('actual completed');
  const pending = [
    ...warmMotionHeadless,
    {
      name: 'queue.admit',
      startTime: 4,
      duration: 0,
      detail: { kind: 'automatic-thumbnail', identity: 'unresolved-canceled-or-superseded' },
    },
  ];
  expect(() => verifyNoMotionThumbnailJobs(pending, pending)).toThrow('already pending');
  const unattributed = [...warmMotionHeadless, { name: 'queue.admit', startTime: 4, duration: 0, detail: {} }];
  expect(() => verifyNoMotionThumbnailJobs(warmMotionHeadless, unattributed)).toThrow('actual job kind or identity');
  const capped = Array.from({ length: 512 }, () => warmMotionHeadless[0]!);
  expect(() => verifyNoMotionThumbnailJobs(capped, capped)).toThrow('retained capacity');
  expect(() => verifyNoMotionThumbnailJobs(warmMotionHeadless, capped)).toThrow('retained capacity');
});

it.each(['queue.wait', 'runtime.transcode', 'job.complete'])(
  'should preserve executed thumbnail zero denial for %s during motion',
  (name) => {
    const after = [
      ...warmMotionHeadless,
      {
        name,
        startTime: 4,
        duration: 1,
        detail: { kind: 'automatic-thumbnail', identity: 'actual-canonical-preview' },
      },
    ];
    expect(() => verifyNoMotionThumbnailJobs(warmMotionHeadless, after)).toThrow('canonical thumbnail work');
  },
);

it('should resolve repeated-name body targets through actual draw UUID and deny a retired catalog owner', () => {
  const catalog = [
    { id: 'left-draw:left-draw:revision:body', label: 'Repeated: Body 1' },
    { id: 'right-draw:right-draw:revision:body', label: 'Repeated: Body 1' },
    { id: 'right-draw:right-draw@instance:0:revision:body', label: 'Repeated: Body 1' },
    { id: 'right-draw:right-draw@instance:1:revision:body', label: 'Repeated: Body 1' },
    { id: 'right-draw:right-draw@instance:10:revision:body', label: 'Repeated: Body 1' },
  ];
  expect(getMotionBodyCandidate({ objectUuid: 'right-draw', instanceId: 0 }, catalog)).toBe(
    'right-draw:right-draw@instance:0:revision:body',
  );
  expect(getMotionBodyCandidate({ objectUuid: 'right-draw' }, catalog)).toBe('right-draw:right-draw:revision:body');
  expect(() => getMotionBodyCandidate({ objectUuid: 'right-draw', instanceId: 2 }, catalog)).toThrow(
    'actual whole-body',
  );
  expect(() => getMotionBodyCandidate({ objectUuid: 'replaced-draw' }, catalog)).toThrow('actual whole-body');
  expect(() =>
    getMotionBodyCandidate({ objectUuid: 'left-draw' }, [
      ...catalog,
      { id: 'left-draw:left-draw:revision:second-body', label: 'Repeated: Body 2' },
    ]),
  ).toThrow('actual whole-body');
});

it('should keep finite source corners S-once and independently posed centroids in the same unit/frame', () => {
  const source = expectedMotionSourceCorners('Link c2 b3', (Math.PI / 180) * 7);
  const centroid: [number, number, number] = [0, 0, 0];
  for (const point of source) {
    centroid[0] += point[0] / 8;
    centroid[1] += point[1] / 8;
    centroid[2] += point[2] / 8;
  }
  const expected = expectedMotionBodyCentroid(2, 3, (Math.PI / 180) * 7);
  expect(centroid[0]).toBeCloseTo(expected[0], 12);
  expect(centroid[1]).toBeCloseTo(expected[1], 12);
  expect(centroid[2]).toBeCloseTo(expected[2], 12);
  const asBuilt = expectedMotionSourceCorners('Link c0 b0', 0);
  expect(asBuilt[0]).toEqual([0.01, 0, -0]);
  expect(asBuilt[7]).toEqual([0.026, 0.006, -0.008]);
  expect(() => expectedMotionSourceCorners('Unknown', 0)).toThrow('outside the exact frozen');
  expect(() => expectedMotionSourceCorners('Link c0 b0', Math.PI / 4)).toThrow('violates');
});

it('should independently measure separated source boxes including coupled motion and rigid occurrence rotation', () => {
  const a = expectedMotionSourceCorners('Link c0 b0', 0),
    b = expectedMotionSourceCorners('Link c4 b0', 0);
  expect(expectedMotionBoxMinimum(a, b)).toBeCloseTo(0.152, 12);
  const angle = Math.PI / 12;
  const occurrence = [
    Math.cos(angle),
    0,
    -Math.sin(angle),
    0,
    0,
    1,
    0,
    0,
    Math.sin(angle),
    0,
    Math.cos(angle),
    0,
    0.25,
    0,
    -0.25,
    1,
  ];
  const movingA = expectedMotionSourceCorners('Link c0 b0', (Math.PI / 180) * 7);
  const movingB = expectedMotionSourceCorners('Link c4 b0', (-Math.PI / 180) * 7);
  const distance = expectedMotionBoxMinimum(movingA, movingB);
  expect(distance).toBeGreaterThan(0.14);
  expect(
    expectedMotionBoxMinimum(
      movingA.map((point) => transformMotionPoint(occurrence, point)),
      movingB.map((point) => transformMotionPoint(occurrence, point)),
    ),
  ).toBeCloseTo(distance, 12);
  expect(() => expectedMotionBoxMinimum(a, [])).toThrow('eight finite');
  expect(() => expectedMotionBoxMinimum(a, a)).toThrow('known separated');
});

const { acquireNativeModule, nativeEngineConstructor } = vi.hoisted(() => ({
  acquireNativeModule: vi.fn(),
  nativeEngineConstructor: vi.fn(function unacquiredNativeEngine(): HostEngine & HostSubjectLifecycle {
    throw new Error('Native construction must not occur in this transport preflight control.');
  }),
}));
vi.mock('@taucad/geospec-engine-native/node', () => {
  acquireNativeModule();
  return {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Engine is the public /node module export replaced only at this native acquisition boundary.
    Engine: nativeEngineConstructor,
  };
});

it('should deny malformed copied bytes before any native or page acquisition', async () => {
  const context = mock<BrowserCommandContext>();
  const contextFailure = new Error('The valid copied-byte control reached the actual session boundary.');
  const readContext = vi.fn((): never => {
    throw contextFailure;
  });
  Object.defineProperty(context, 'sessionId', { get: readContext });
  acquireNativeModule.mockClear();
  nativeEngineConstructor.mockClear();
  const expected = ['first', 'second', 'third', 'fourth'].map((id, x): MotionNativeOracleInput['expected'][number] => ({
    id,
    min: [x, 0, 0],
    max: [x + 1, 1, 1],
    corners: [
      [x, 0, 0],
      [x + 1, 0, 0],
      [x, 1, 0],
      [x + 1, 1, 0],
      [x, 0, 1],
      [x + 1, 0, 1],
      [x, 1, 1],
      [x + 1, 1, 1],
    ],
  }));
  const input: MotionNativeOracleInput = {
    observation: {
      id: 1,
      workerUrl: 'http://localhost:3011/assets/unacquired-worker.js',
      binding: {
        key: 'unadmitted-control',
        unitId: 'unacquired-unit',
        poseRevision: 0,
        candidateSceneId: 'unacquired-candidate',
        names: ['first', 'second'],
      },
      bytes: [256],
      response: {
        id: 1,
        status: 'cad-geometry',
        source: 'ap242',
        distanceMeters: 1,
        firstPointMeters: [0, 0, 0],
        secondPointMeters: [1, 0, 0],
      },
      failure: undefined,
    },
    expected,
    expectedBodyCount: 4,
  };
  const [invalid] = await Promise.allSettled([uiMotionNativeOracle(context, input)]);
  if (invalid.status !== 'rejected') {
    throw new Error('Malformed copied bytes were accepted.');
  }
  expect(invalid.reason).toBeInstanceOf(TypeError);
  expect(invalid.reason).toMatchObject({ message: 'The actual finite Node oracle request is unqualified.' });
  expect(readContext).not.toHaveBeenCalled();
  expect(acquireNativeModule).not.toHaveBeenCalled();
  expect(nativeEngineConstructor).not.toHaveBeenCalled();

  // This is only a byte-range control, not admitted STEP evidence. The genuine command reaches its session boundary.
  const [validRange] = await Promise.allSettled([
    uiMotionNativeOracle(context, { ...input, observation: { ...input.observation, bytes: [0] } }),
  ]);
  if (validRange.status !== 'rejected') {
    throw new Error('The unacquired page control unexpectedly completed.');
  }
  expect(validRange.reason).toBe(contextFailure);
  expect(readContext).toHaveBeenCalledOnce();
  expect(acquireNativeModule).not.toHaveBeenCalled();
  expect(nativeEngineConstructor).not.toHaveBeenCalled();
});

// These are mocked ownership controls, not native geometry or actual browser/pixel evidence.
const lifecycleInput = (): MotionNativeOracleInput => ({
  observation: {
    id: 1,
    workerUrl: `${testBaseURL}/assets/unacquired-worker.js`,
    binding: {
      key: 'mocked-lifecycle-root',
      unitId: 'mocked-lifecycle-unit',
      poseRevision: 1,
      candidateSceneId: 'mocked-lifecycle-candidate',
      names: ['first', 'second'],
    },
    bytes: [0],
    response: {
      id: 1,
      status: 'cad-geometry',
      source: 'ap242',
      distanceMeters: 1,
      firstPointMeters: [0, 0, 0],
      secondPointMeters: [1, 0, 0],
    },
    failure: undefined,
  },
  expectedBodyCount: 4,
  expected: ['first', 'second', 'third', 'fourth'].map((id, x): MotionNativeOracleInput['expected'][number] => ({
    id,
    min: [x, 0, 0],
    max: [x + 1, 1, 1],
    corners: [
      [x, 0, 0],
      [x + 1, 0, 0],
      [x, 1, 0],
      [x + 1, 1, 0],
      [x, 0, 1],
      [x + 1, 0, 1],
      [x, 1, 1],
      [x + 1, 1, 1],
    ],
  })),
});

type LifecyclePage = Awaited<ReturnType<BrowserCommandContext['context']['newPage']>>;

it('should deny a captured page retiring during an awaited current read and release its handle', async () => {
  const context = mockDeep<BrowserCommandContext>({
    sessionId: 'mocked-native-retirement-control',
    testPath: 'apps/ui-e2e/src/support/parts-assemblies-motion.test.ts',
  });
  Object.defineProperty(context.provider, 'name', { value: 'playwright' });
  const browser = mock<NonNullable<ReturnType<BrowserCommandContext['context']['browser']>>>();
  const page = mock<LifecyclePage>({ evaluateHandle: vi.fn<LifecyclePage['evaluateHandle']>() });
  const held = mock<JSHandle<unknown>>();
  context.context.browser.mockReturnValue(browser);
  browser.newContext.mockResolvedValue(context.context);
  context.context.newPage.mockResolvedValue(page);
  page.url.mockReturnValue(`${testBaseURL}/mocked-lifecycle`);
  page.isClosed.mockReturnValue(false);
  vi.spyOn(page, 'evaluateHandle').mockResolvedValue(held);
  page.evaluate.mockResolvedValue(true);
  nativeEngineConstructor.mockClear();
  const entered = Promise.withResolvers<void>();
  const currentRead = Promise.withResolvers<boolean>();
  page.evaluate.mockImplementationOnce(async () => {
    entered.resolve();
    return currentRead.promise;
  });
  await uiOpenTarget(context);
  const observed = Promise.allSettled([uiMotionNativeOracle(context, lifecycleInput())]);
  try {
    await entered.promise;
    expect(page.isClosed()).toBe(false);
    // The real command owns the captured page; closure happens while its actual isCurrent awaits the page boundary.
    page.isClosed.mockReturnValue(true);
    currentRead.resolve(true);
    const [outcome] = await observed;
    if (outcome.status !== 'rejected') {
      throw new Error('A retired captured page delivered native evidence.');
    }
    expect(outcome.reason).toBeInstanceOf(Error);
    expect(outcome.reason).toMatchObject({
      message: 'The held product subject retired during Node module acquisition.',
    });
    expect(nativeEngineConstructor).not.toHaveBeenCalled();
    expect(held.dispose).toHaveBeenCalledOnce();
  } finally {
    currentRead.resolve(false);
    await observed;
    page.isClosed.mockReturnValue(true);
    page.evaluate.mockResolvedValue([]);
    await uiCloseTarget(context);
  }
  expect(context.context.close).toHaveBeenCalledOnce();
});

it.each([
  { label: 'Error identity', reason: new Error('The native claim failed before cleanup.') },
  { label: 'thrown undefined', reason: undefined },
])(
  'should preserve $label across synchronous native subject, engine and handle cleanup failures',
  async ({ reason }) => {
    const context = mockDeep<BrowserCommandContext>({
      sessionId: 'mocked-native-primary-control',
      testPath: 'apps/ui-e2e/src/support/parts-assemblies-motion.test.ts',
    });
    Object.defineProperty(context.provider, 'name', { value: 'playwright' });
    const browser = mock<NonNullable<ReturnType<BrowserCommandContext['context']['browser']>>>();
    const page = mock<LifecyclePage>({ evaluateHandle: vi.fn<LifecyclePage['evaluateHandle']>() });
    const held = mock<JSHandle<unknown>>();
    context.context.browser.mockReturnValue(browser);
    browser.newContext.mockResolvedValue(context.context);
    context.context.newPage.mockResolvedValue(page);
    page.url.mockReturnValue(`${testBaseURL}/mocked-lifecycle`);
    page.isClosed.mockReturnValue(false);
    vi.spyOn(page, 'evaluateHandle').mockResolvedValue(held);
    page.evaluate.mockResolvedValue(true);
    const engine = mock<HostEngine & HostSubjectLifecycle>();
    const cleanupOrder: string[] = [];
    const releaseError = new Error('Synchronous native subject release failed.');
    const closeError = new Error('Synchronous native engine close failed.');
    const handleError = new Error('Synchronous captured handle disposal failed.');
    const input = lifecycleInput();
    // Only the native byte-owner is stubbed. Real shared decoding, finite-set checks and assertion-client invocation run.
    engine.ingestSubject.mockReturnValue(
      new TextEncoder().encode(
        JSON.stringify({
          requestId: 'c6-second-admit',
          result: {
            subject: {
              subjectHash: 'a'.repeat(64),
              descriptor: { frame: { coordinateSystem: 'z-up', outputUnit: 'mm', uniformScale: 1 } },
            },
          },
        }),
      ),
    );
    engine.subjectHandle.mockReturnValue(
      new TextEncoder().encode(
        JSON.stringify({
          result: { subjectHandle: { id: 'mocked-native-subject' } },
        }),
      ),
    );
    // The real assertion client acquires the engine-owned default budget before evaluating the claim.
    engine.processRequest.mockImplementation((request) => {
      expect(new TextDecoder().decode(request)).toBe(
        '{"canonicalProfile":"geospec-jcs-v1","method":"initialize","protocolVersion":3,"registryVersion":5,"requestId":"configuration"}',
      );
      return new TextEncoder().encode(
        JSON.stringify({
          requestId: 'configuration',
          result: {
            canonicalProfile: 'geospec-jcs-v1',
            protocolVersion: 3,
            registryVersion: 5,
            configuration: {
              configurationProfile: 'geospec-entry-config-v1',
              defaultWorkUnitBudget: 8_000_000,
            },
          },
        }),
      );
    });
    engine.evaluateClaim.mockImplementation(() => {
      cleanupOrder.push('primary');
      const error: unknown = reason;
      throw error;
    });
    engine.releaseSubject.mockImplementation(() => {
      cleanupOrder.push('release');
      throw releaseError;
    });
    engine.close.mockImplementation(() => {
      cleanupOrder.push('close');
      throw closeError;
    });
    held.dispose.mockImplementation(() => {
      cleanupOrder.push('handle');
      throw handleError;
    });
    await uiOpenTarget(context);
    try {
      await nativeEngineConstructor.withImplementation(
        function ownedNativeEngine(): HostEngine & HostSubjectLifecycle {
          return engine;
        },
        async () => {
          const [outcome] = await Promise.allSettled([uiMotionNativeOracle(context, input)]);
          if (outcome.status !== 'rejected') {
            throw new Error('The native primary rejection was replaced by success.');
          }
          expect(outcome.reason).toBe(reason);
          expect(engine.ingestSubject).toHaveBeenCalledOnce();
          expect(engine.subjectHandle).toHaveBeenCalledOnce();
          expect(engine.processRequest).toHaveBeenCalledOnce();
          expect(engine.evaluateClaim).toHaveBeenCalledOnce();
          expect(engine.releaseSubject).toHaveBeenCalledOnce();
          expect(engine.close).toHaveBeenCalledOnce();
          expect(held.dispose).toHaveBeenCalledOnce();
          expect(cleanupOrder).toEqual(['primary', 'release', 'close', 'handle']);
        },
      );
    } finally {
      // Installed withImplementation restores only fulfillment; reset also covers failed assertions in its callback.
      nativeEngineConstructor.mockReset();
      page.isClosed.mockReturnValue(true);
      page.evaluate.mockResolvedValue([]);
      await uiCloseTarget(context);
    }
    expect(context.context.close).toHaveBeenCalledOnce();
  },
);

// This byte-owner double qualifies the real helper/client protocol and lifetime guards, not native geometry.
const oracleEncode = (value: unknown): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(value));
const oracleIsRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const oracleRecord = (value: unknown): Record<string, unknown> => {
  if (!oracleIsRecord(value)) {
    throw new TypeError('The owning oracle fixture expected a record.');
  }
  return value;
};
const oracleDecode = (bytes: Uint8Array<ArrayBuffer>): Record<string, unknown> => {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return oracleRecord(value);
};
const oracleInventoryFixture = (condition = 'complete') => {
  const input = lifecycleInput();
  const { response } = input.observation;
  if (!response) {
    throw new Error('The owning fixture requires its actual successful response.');
  }
  const expected: MotionNativeOracleInput['expected'] = ['first', 'second', 'third', 'fourth'].map(
    (id, index): MotionNativeOracleInput['expected'][number] => {
      const x = index * 2;
      return {
        id,
        min: [x, 0, 0],
        max: [x + 1, 1, 1],
        corners: [
          [x, 0, 0],
          [x + 1, 0, 0],
          [x, 1, 0],
          [x + 1, 1, 0],
          [x, 0, 1],
          [x + 1, 0, 1],
          [x, 1, 1],
          [x + 1, 1, 1],
        ],
      };
    },
  );
  const observed: MotionNativeOracleInput = {
    ...input,
    expected,
    observation: {
      ...input.observation,
      response: {
        ...response,
        distanceMeters: 0.001,
        firstPointMeters: [0.001, 0, 0],
        secondPointMeters: [0.002, 0, 0],
      },
    },
  };
  const engine = mock<HostEngine & HostSubjectLifecycle>();
  const rawHash = 'a'.repeat(64);
  const minimumHash = 'b'.repeat(64);
  const rows: Array<Record<string, unknown>> = [
    { path: 'anonymous-wrapper' },
    { instanceName: 'first', path: 'first' },
    { instanceName: 'second', path: 'second' },
    { instanceName: 'third', path: 'third' },
    { instanceName: 'fourth', path: 'fourth' },
  ];
  let current = true;
  const calls: string[] = [];
  engine.ingestSubject.mockImplementation((request) => {
    const decoded = oracleDecode(request);
    const frame = oracleRecord(decoded['frame']);
    const raw = frame['coordinateSystem'] === 'z-up';
    calls.push(raw ? 'raw-admit' : 'minimum-admit');
    return oracleEncode({
      requestId: decoded['requestId'],
      result: {
        subject: {
          subjectHash: raw ? rawHash : minimumHash,
          descriptor: {
            frame: {
              coordinateSystem: raw ? 'z-up' : 'y-up',
              outputUnit: 'mm',
              uniformScale: 1,
              ...(raw ? {} : { outputCoordinateSystem: 'z-up' }),
            },
          },
          ...(raw
            ? {}
            : {
                occurrences: rows
                  .filter((row) => typeof row['instanceName'] === 'string')
                  .map((row) => ({
                    instanceName: row['instanceName'],
                    occurrencePath: row['path'],
                  })),
              }),
        },
      },
    });
  });
  engine.subjectHandle.mockImplementation((request) => {
    const { subjectHash } = oracleDecode(request);
    calls.push('handle');
    return oracleEncode({ result: { subjectHandle: { subjectHash } } });
  });
  engine.releaseSubject.mockImplementation(() => {
    calls.push('release');
    return oracleEncode({ result: { released: true } });
  });
  engine.processRequest.mockImplementation(() =>
    oracleEncode({
      requestId: 'configuration',
      result: {
        canonicalProfile: 'geospec-jcs-v1',
        protocolVersion: 3,
        registryVersion: 5,
        configuration: { configurationProfile: 'geospec-entry-config-v1', defaultWorkUnitBudget: 8_000_000 },
        capabilities: [
          {
            name: 'minimumDistance',
            profile: 'geospec-minimum-distance-v1',
            implementation: 'implemented',
            registryVersion: 5,
          },
        ],
      },
    }),
  );
  engine.evaluateClaim.mockImplementation((request) => {
    const envelope = oracleDecode(request);
    const plan = oracleRecord(envelope['plan']);
    const { claims, subjects } = plan;
    if (!Array.isArray(claims) || claims.length !== 1 || !Array.isArray(subjects) || subjects.length !== 1) {
      throw new Error('Owning fixture received a non-singleton native claim.');
    }
    const claim = oracleRecord(claims[0]);
    const binding = oracleRecord(subjects[0]);
    const { capability } = claim;
    calls.push(String(capability));
    let evidence: unknown;
    let status = 'passed';
    switch (capability) {
      case 'analyzeMesh': {
        expect(binding['subjectHash']).toBe(rawHash);
        expect(claim['payload']).toBeNull();
        switch (condition) {
          case 'refused': {
            status = 'refused';
            break;
          }
          case 'failed': {
            status = 'failed';
            break;
          }
          case 'duplicate-name': {
            rows.push({ instanceName: 'first', path: 'other' });
            break;
          }
          case 'duplicate-path': {
            rows.push({ instanceName: 'other', path: 'first' });
            break;
          }
          case 'missing': {
            rows.pop();
            break;
          }
          case 'extra': {
            rows.push({ instanceName: 'extra', path: 'extra' });
            break;
          }
          case 'malformed': {
            rows.push({ instanceName: 1, path: 'invalid' });
            break;
          }
          case 'foreign-subject': {
            binding['subjectHash'] = minimumHash;
            break;
          }
          case 'unknown-slot': {
            binding['slot'] = 'other';
            break;
          }
          case 'bounded': {
            plan['evidenceProfile'] = 'bounded';
            break;
          }
          case 'current-swap': {
            current = false;
            break;
          }
          default: {
            break;
          }
        }
        evidence = {
          success: true,
          subject: {
            kind: 'geometry-subject',
            step: {
              xde: {
                occurrences: condition === 'absent' ? undefined : rows,
              },
            },
          },
          ...(condition === 'oversized' ? { oversized: 'x'.repeat(1_048_576) } : {}),
        };
        break;
      }
      case 'toHaveAssemblyOccurrences': {
        expect(binding['subjectHash']).toBe(rawHash);
        evidence = { positiveSatisfied: true };
        break;
      }
      case 'inspectGeometry': {
        expect(binding['subjectHash']).toBe(rawHash);
        evidence = { selections: Array.from({ length: 32 }, () => ({ matches: [{}, {}, {}] })) };
        break;
      }
      case 'minimumDistance': {
        expect(binding['subjectHash']).toBe(minimumHash);
        evidence = {
          profile: 'geospec-minimum-distance-v1',
          fact: {
            source: 'ap242',
            assurance: 'exact-brep',
            unit: 'mm',
            coordinateSystem: 'z-up',
            subjectHash: minimumHash,
            algorithmProfile: 'geospec-minimum-distance-v1',
            occurrences: ['first', 'second'],
            distance: 1,
            points: [
              [1, 0, 0],
              [2, 0, 0],
            ],
          },
        };
        break;
      }
      default: {
        throw new Error('Unexpected owning fixture native capability.');
      }
    }
    return {
      canonicalClaim: oracleEncode(claim),
      canonicalPlan: oracleEncode(envelope),
      canonicalResult: oracleEncode({ results: [{ claimId: claim['claimId'], status, diagnostics: [], evidence }] }),
    };
  });
  return { engine, input: observed, isCurrent: async () => current, calls, rawHash, minimumHash };
};

it('should use the complete current native report when genuine Z-up admission omits its occurrence table', async () => {
  const fixture = oracleInventoryFixture();
  const result = await queryObservedMotionNativeOracle(
    { ...fixture.input, isCurrent: fixture.isCurrent },
    fixture.engine,
  );
  expect(result.canonicalIds).toEqual(['first', 'second', 'third', 'fourth']);
  expect(result.nativeCornerSupports).toMatchObject({ probes: 32, supportsPerCorner: 3 });
  expect(result.minimum).toMatchObject({ subjectHash: fixture.minimumHash, distance: 1 });
  expect(fixture.calls).toEqual([
    'raw-admit',
    'handle',
    'analyzeMesh',
    'toHaveAssemblyOccurrences',
    'inspectGeometry',
    'release',
    'minimum-admit',
    'handle',
    'minimumDistance',
    'release',
  ]);
  expect(fixture.engine.ingestSubject).toHaveBeenCalledTimes(2);
  expect(fixture.engine.releaseSubject).toHaveBeenCalledTimes(2);
  expect(fixture.engine.close).not.toHaveBeenCalled();
});

it.each([
  { condition: 'refused', message: 'Native occurrence inventory report is incomplete or exceeds its metadata bound.' },
  { condition: 'failed', message: 'Native occurrence inventory report is incomplete or exceeds its metadata bound.' },
  { condition: 'absent', message: 'Native occurrence inventory is absent.' },
  { condition: 'malformed', message: 'Native names/paths are not uniquely qualified.' },
  { condition: 'duplicate-name', message: 'Native names/paths are not uniquely qualified.' },
  { condition: 'duplicate-path', message: 'Native names/paths are not uniquely qualified.' },
  { condition: 'missing', message: 'Native positive canonical body set differs from the admitted finite IDs.' },
  { condition: 'extra', message: 'Native positive canonical body set differs from the admitted finite IDs.' },
  {
    condition: 'foreign-subject',
    message: 'Native occurrence inventory report is not bound to the actual admitted subject.',
  },
  {
    condition: 'unknown-slot',
    message: 'Native occurrence inventory report is not bound to the actual admitted subject.',
  },
  { condition: 'bounded', message: 'Native occurrence inventory report is not bound to the actual admitted subject.' },
  {
    condition: 'oversized',
    message: 'Native occurrence inventory report is incomplete or exceeds its metadata bound.',
  },
  {
    condition: 'current-swap',
    message: 'Presented root/unit/pose changed during native occurrence inventory acquisition.',
  },
])(
  'should deny a $condition native occurrence report and release the raw subject without downstream geometry',
  async ({ condition, message }) => {
    const fixture = oracleInventoryFixture(condition);
    await expect(
      queryObservedMotionNativeOracle({ ...fixture.input, isCurrent: fixture.isCurrent }, fixture.engine),
    ).rejects.toThrow(message);
    expect(fixture.calls).toEqual(['raw-admit', 'handle', 'analyzeMesh', 'release']);
    expect(fixture.engine.evaluateClaim).toHaveBeenCalledOnce();
    expect(fixture.engine.ingestSubject).toHaveBeenCalledOnce();
    expect(fixture.engine.releaseSubject).toHaveBeenCalledOnce();
    expect(fixture.engine.close).not.toHaveBeenCalled();
  },
);

// Full geometry and pair-distance subjects stay separate even when their current pose/root is identical.
const fullPosedInput = (
  input: MotionNativeOracleInput,
): MotionNativeOracleInput & { posedExport: MotionPosedExport } => {
  const key = contentDigest({ value: `sha256:${'c'.repeat(64)}` });
  return {
    ...input,
    observation: { ...input.observation, binding: { ...input.observation.binding, key } },
    posedExport: {
      root: { path: `.tau/artifacts/reusable-parts/${'c'.repeat(64)}/scene.json`, digest: key, byteLength: 12 },
      projectId: 'actual-held-page-control',
      sourceEntryPath: 'actual-managed-entry',
      key,
      unitId: input.observation.binding.unitId,
      poseRevision: input.observation.binding.poseRevision,
      presentationRevision: 4,
      candidateSceneId: input.observation.binding.candidateSceneId,
      coordinateSystem: 'y-up',
      canonicalIds: input.expected.map(({ id }) => id),
      exportId: 'actual-full-export',
      bytes: [1, 2, 3],
    },
  };
};

it('should admit copied full-pose bytes for all corners while admitting only the original pair bytes for minimum distance', async () => {
  const fixture = oracleInventoryFixture();
  const input = fullPosedInput(fixture.input);
  const result = await queryObservedMotionNativeOracle({ ...input, isCurrent: fixture.isCurrent }, fixture.engine);
  expect(result.canonicalIds).toEqual(input.posedExport.canonicalIds);
  expect(result.nativeCornerSupports).toMatchObject({ probes: 32, supportsPerCorner: 3 });
  expect(result.minimum).toMatchObject({ subjectHash: fixture.minimumHash, distance: 1 });
  expect(fixture.engine.ingestSubject.mock.calls.map(([, bytes]) => [...bytes])).toEqual([[1, 2, 3], [0]]);
  expect(input.observation.bytes).toEqual([0]);
  expect(fixture.calls).toEqual([
    'raw-admit',
    'handle',
    'analyzeMesh',
    'toHaveAssemblyOccurrences',
    'inspectGeometry',
    'release',
    'minimum-admit',
    'handle',
    'minimumDistance',
    'release',
  ]);
  expect(fixture.engine.releaseSubject).toHaveBeenCalledTimes(2);
  expect(fixture.engine.close).not.toHaveBeenCalled();
});

it.each(['root', 'unit', 'pose', 'candidate', 'duplicate', 'missing', 'frame', 'bytes'])(
  'should deny a %s full-export mismatch before any native subject admission',
  async (condition) => {
    const fixture = oracleInventoryFixture();
    const input = fullPosedInput(fixture.input);
    let full = input.posedExport;
    switch (condition) {
      case 'root': {
        full = { ...full, root: { ...full.root, digest: contentDigest({ value: `sha256:${'d'.repeat(64)}` }) } };
        break;
      }
      case 'unit': {
        full = { ...full, unitId: 'different-unit' };
        break;
      }
      case 'pose': {
        full = { ...full, poseRevision: full.poseRevision + 1 };
        break;
      }
      case 'candidate': {
        full = { ...full, candidateSceneId: 'different-candidate' };
        break;
      }
      case 'duplicate': {
        full = { ...full, canonicalIds: ['first', 'first', 'third', 'fourth'] };
        break;
      }
      case 'missing': {
        full = { ...full, canonicalIds: full.canonicalIds.slice(1) };
        break;
      }
      case 'frame': {
        Object.defineProperty(full, 'coordinateSystem', { value: 'z-up' });
        break;
      }
      case 'bytes': {
        full = { ...full, bytes: [256] };
        break;
      }
    }
    const mismatched = { ...input, posedExport: full };
    expect(isMotionPosedExportQualified(mismatched)).toBe(false);
    await expect(
      queryObservedMotionNativeOracle({ ...mismatched, isCurrent: fixture.isCurrent }, fixture.engine),
    ).rejects.toThrow('separately captured full posed export is unqualified');
    expect(fixture.engine.ingestSubject).not.toHaveBeenCalled();
    expect(fixture.engine.evaluateClaim).not.toHaveBeenCalled();
  },
);

it('should refuse a full copy rejected by the actual held-page join and dispose its handle before native acquisition', async () => {
  const context = mockDeep<BrowserCommandContext>({
    sessionId: 'mocked-full-pose-page-join-control',
    testPath: 'apps/ui-e2e/src/support/parts-assemblies-motion.test.ts',
  });
  Object.defineProperty(context.provider, 'name', { value: 'playwright' });
  const browser = mock<NonNullable<ReturnType<BrowserCommandContext['context']['browser']>>>();
  const page = mock<LifecyclePage>({ evaluateHandle: vi.fn<LifecyclePage['evaluateHandle']>() });
  const held = mock<JSHandle<unknown>>();
  context.context.browser.mockReturnValue(browser);
  browser.newContext.mockResolvedValue(context.context);
  context.context.newPage.mockResolvedValue(page);
  page.url.mockReturnValue(`${testBaseURL}/mocked-full-pose`);
  page.isClosed.mockReturnValue(false);
  vi.spyOn(page, 'evaluateHandle').mockResolvedValue(held);
  page.evaluate.mockResolvedValue(true);
  held.evaluate.mockResolvedValue(false);
  const input = fullPosedInput(lifecycleInput());
  nativeEngineConstructor.mockClear();
  await uiOpenTarget(context);
  try {
    await expect(uiMotionNativeOracle(context, input)).rejects.toThrow(
      'does not belong to the held current page source',
    );
    expect(held.evaluate).toHaveBeenCalledOnce();
    expect(held.dispose).toHaveBeenCalledOnce();
    expect(nativeEngineConstructor).not.toHaveBeenCalled();
  } finally {
    page.isClosed.mockReturnValue(true);
    page.evaluate.mockResolvedValue([]);
    await uiCloseTarget(context);
  }
  expect(context.context.close).toHaveBeenCalledOnce();
});
