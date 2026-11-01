import { describe, expect, it } from 'vitest';
import { toPrometheusName } from '#prometheus.js';
import { TauMetrics } from '#registry.js';
import {
  RuntimeEntryName,
  causeOf,
  conversionPairOf,
  fileFormatOf,
  ingestBodyBounds,
  ingestReceiptSchema,
  otherValue,
  parameterClassOf,
  parseRuntimeTelemetryMode,
  resolveRuntimeTelemetry,
  runtimeVocabulary,
  sizeClassOf,
  telemetryPolicyAnswerSchema,
  usageCoverage,
} from '#runtime-ingest.js';
import { parseRuntimeEntry, runtimeEntryEnvelopeSchema } from '#runtime-entry.js';
import { runtimeMetrics } from '#runtime-metrics.js';

const release = '0123abc';
const operation = (detail: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  name: RuntimeEntryName.OPERATION,
  duration: 120,
  detail: { operation: 'render', outcome: 'succeeded', route: 'browser', caller: 'editor', release, ...detail },
  ...extra,
});

describe('runtime vocabularies', () => {
  it('should close a value outside a vocabulary to _OTHER, never the client string', () => {
    expect(runtimeVocabulary.kernel.parse('replicad')).toBe('replicad');
    expect(runtimeVocabulary.kernel.parse('/home/user/model.ts')).toBe(otherValue);
    expect(runtimeVocabulary.format.parse('model.step')).toBe(otherValue);
    expect(runtimeVocabulary.errorType.parse('RESOURCE_LIMIT')).toBe('RESOURCE_LIMIT');
    expect(runtimeVocabulary.errorType.parse('E'.repeat(64))).toBe(otherValue);
  });
});

describe('causeOf', () => {
  it.each([
    ['succeeded', undefined, 'none'],
    ['unknown', undefined, 'none'],
    ['attention', undefined, 'none'],
    ['cancelled', undefined, 'cancelled'],
    ['superseded', undefined, 'cancelled'],
    ['abandoned', undefined, 'cancelled'],
    ['issue', 'RESOURCE_LIMIT', 'capacity'],
    ['issue', 'GEOMETRY_INVALID', 'input'],
    ['issue', otherValue, 'implementation'],
    ['issue', undefined, 'implementation'],
    ['refused', 'DOWNLOAD_FAILED', 'environment'],
    ['refused', 'ROUTE_DENIED', 'policy'],
    ['refused', undefined, 'policy'],
    ['timed-out', 'RUNTIME_OPERATION_TIMEOUT', 'environment'],
    ['terminated', 'HOST_LIMIT_EXCEEDED', 'capacity'],
    ['terminated', 'TRANSPORT_FAILED', 'environment'],
    ['discarded', 'UNKNOWN', 'implementation'],
    ['failed', 'UNKNOWN', 'implementation'],
    [otherValue, undefined, otherValue],
  ] as const)('should classify %s with %s as %s', (outcome, code, cause) => {
    expect(causeOf(outcome, code)).toBe(cause);
  });
});

describe('runtime.operation (T10)', () => {
  it('should admit a well-formed entry and clamp its duration to an hour', () => {
    const parsed = parseRuntimeEntry(operation({ kernel: 'replicad' }, { duration: 10 * 3_600_000 }));
    expect(parsed).toMatchObject({ duration: 3_600_000, detail: { kernel: 'replicad' } });
  });

  it('should close forged enum values, file names and free limit ids', () => {
    const parsed = parseRuntimeEntry(
      operation({
        operation: 'export',
        outcome: 'issue',
        code: 'NOT_A_CODE',
        kernel: 'evil',
        caller: 'scraper',
        format: 'secret-plan.step',
        limit: { id: 'customer.limit', maximum: 7 },
      }),
    );
    expect(parsed?.detail).toMatchObject({
      kernel: otherValue,
      caller: otherValue,
      code: otherValue,
      format: otherValue,
      limit: { id: otherValue },
    });
    expect(JSON.stringify(parsed)).not.toContain('secret-plan');
    expect(JSON.stringify(parsed)).not.toContain('customer.limit');
  });

  it('should keep an allowlisted limit with its numbers', () => {
    const limit = {
      id: 'occt.export.triangles',
      unit: '{triangle}',
      maximum: 5_000_000,
      demand: { kind: 'measured', value: 6_000_000 },
      origin: 'default',
    };
    expect(parseRuntimeEntry(operation({ outcome: 'issue', code: 'RESOURCE_LIMIT', limit }))?.detail).toMatchObject({
      limit,
    });
  });

  it.each([
    ['a forged population', { population: 'signed-in' }],
    [
      'parameter names',
      { operation: 'evaluate', worker: worker({ parameters: { declared: 1, modified: 0, names: ['x'] } }) },
    ],
    ['a facet above its clamp', { worker: worker({ triangles: 2e9 }) }],
    ['count on a success', { count: 50 }],
    ['a code on a success', { code: 'UNKNOWN' }],
    ['parameter facts off evaluate', { worker: worker({ parameters: { declared: 1, modified: 0 } }) }],
    ['facts both joined and missing', { worker: worker(), factsMissing: 'missing-timeout' }],
    ['verify facts off verify', { verify: { selected: 1, passed: 1, failed: 0 } }],
    ['attention off job', { outcome: 'attention' }],
    ['a plugin on render', { plugin: 'assimp' }],
    ['a source format on render', { sourceFormat: 'glb' }],
    ['an entry format off evaluate', { entryFormat: 'ts' }],
    ['a machine kind off machine', { machineKind: 'action' }],
    ['a machine without a kind', { operation: 'machine', route: 'desktop' }],
    [
      'an action on a non-action kind',
      { operation: 'machine', route: 'desktop', machineKind: 'stop', machineAction: 'run.pause' },
    ],
    ['a machine from a browser route', { operation: 'machine', machineKind: 'start' }],
    ['an unknown route', { route: 'satellite' }],
    ['an invalid release', { release: 'main; drop table' }],
  ])('should reject %s', (_label, detail) => {
    expect(parseRuntimeEntry(operation(detail))).toBeUndefined();
  });

  it('should honour count only on merged outcomes and clamp it to 500', () => {
    expect(parseRuntimeEntry(operation({ outcome: 'superseded', count: 10_000 }))?.detail).toMatchObject({
      count: 500,
    });
  });

  it('should admit machine entries from a Node machine host', () => {
    expect(
      parseRuntimeEntry(
        operation({
          operation: 'machine',
          route: 'daemon',
          machineKind: 'action',
          machineAction: 'run.pause',
          plugin: 'grbl',
        }),
      )?.detail,
    ).toMatchObject({ machineAction: 'run.pause', plugin: 'grbl' });
  });

  it('should admit the evaluate, verify and transcode facets where they ride', () => {
    expect(
      parseRuntimeEntry(
        operation({
          operation: 'evaluate',
          entryFormat: 'ts',
          worker: worker({ parameters: { declared: 4, modified: 1, features: ['units'] }, phases: { compute: 5 } }),
        }),
      ),
    ).toBeDefined();
    expect(
      parseRuntimeEntry(operation({ operation: 'verify', verify: { selected: 3, passed: 2, failed: 1 } })),
    ).toBeDefined();
    expect(
      parseRuntimeEntry(operation({ operation: 'transcode', plugin: 'assimp', sourceFormat: 'fbx', format: 'glb' })),
    ).toBeDefined();
    expect(
      parseRuntimeEntry(operation({ operation: 'job', outcome: 'attention', plugin: 'tau.calculix.container' })),
    ).toBeDefined();
  });
});

describe('runtime.late, runtime.viewer and telemetry.delivery', () => {
  it('should validate each by its name', () => {
    expect(
      parseRuntimeEntry({
        name: RuntimeEntryName.LATE,
        duration: 5,
        detail: { operation: 'render', settledAs: 'timed-out', route: 'browser', caller: 'editor' },
      }),
    ).toBeDefined();
    expect(
      parseRuntimeEntry({
        name: RuntimeEntryName.VIEWER,
        duration: 0,
        detail: { event: 'download', backend: 'webgl', route: 'browser', release, format: 'stl' },
      }),
    ).toBeDefined();
    expect(
      parseRuntimeEntry({
        name: RuntimeEntryName.VIEWER,
        duration: 0,
        detail: { event: 'first-frame', backend: 'webgl', route: 'browser', release, format: 'stl' },
      }),
    ).toBeUndefined();
    expect(
      parseRuntimeEntry({
        name: RuntimeEntryName.DELIVERY,
        duration: 0,
        detail: { route: 'cli', oldest: 1000, dropped: { 'queue-full': 2 }, spansDropped: 3 },
      }),
    ).toBeDefined();
  });

  it('should answer undefined for an unknown entry name', () => {
    expect(parseRuntimeEntry({ name: 'runtime.unknown' })).toBeUndefined();
    expect(runtimeEntryEnvelopeSchema.safeParse({ name: 'observability.createGeometry' }).success).toBe(false);
  });
});

describe('ingest helpers', () => {
  it('should bound the body and the batch id', () => {
    expect(ingestBodyBounds).toMatchObject({ maxEntries: 256, maxBytes: 65_536 });
    expect(ingestBodyBounds.batchId.test('0'.repeat(32))).toBe(true);
    expect(ingestBodyBounds.batchId.test('Z'.repeat(32))).toBe(false);
  });

  it.each([
    [0, 'xs'],
    [10_000, 's'],
    [100_000, 'm'],
    [1_000_000, 'l'],
    [5_000_000, 'xl'],
  ] as const)('should bucket %d triangles as %s', (triangles, size) => {
    expect(sizeClassOf(triangles)).toBe(size);
  });

  it.each([
    [0, 0, 'none'],
    [4, 0, 'default'],
    [4, 1, 'some'],
    [4, 3, 'most'],
    [4, 4, 'all'],
  ] as const)('should class %d declared, %d modified as %s', (declared, modified, parameterClass) => {
    expect(parameterClassOf({ declared, modified })).toBe(parameterClass);
  });

  it('should keep a registry conversion edge and close any other pair', () => {
    expect(conversionPairOf('glb', 'gltf')).toEqual({ source: 'glb', target: 'gltf' });
    expect(conversionPairOf('stl', 'webp')).toEqual({ source: otherValue, target: otherValue });
  });

  it('should read the longest registry suffix of a file name', () => {
    expect(fileFormatOf('Part.MESH.XML')).toBe('mesh.xml');
    expect(fileFormatOf('print.gcode.3mf')).toBe('gcode.3mf');
    expect(fileFormatOf('notes.docx')).toBe(otherValue);
  });
});

describe('TAU_RUNTIME_TELEMETRY', () => {
  const now = new Date('2026-10-24T12:00:00Z');

  it('should be off when unset or off, and on when on', () => {
    expect(parseRuntimeTelemetryMode(undefined)).toEqual({ mode: 'off' });
    expect(parseRuntimeTelemetryMode('off')).toEqual({ mode: 'off' });
    expect(resolveRuntimeTelemetry(parseRuntimeTelemetryMode('on'), now)).toBe(true);
    expect(resolveRuntimeTelemetry(parseRuntimeTelemetryMode(undefined), now)).toBe(false);
  });

  it('should end a pause at its time', () => {
    const paused = parseRuntimeTelemetryMode('paused-until:2026-10-24T13:00:00Z');
    expect(resolveRuntimeTelemetry(paused, now)).toBe(false);
    expect(resolveRuntimeTelemetry(paused, new Date('2026-10-24T13:00:00Z'))).toBe(true);
  });

  it.each(['yes', 'paused-until:tomorrow', ''])('should refuse %j', (value) => {
    expect(() => parseRuntimeTelemetryMode(value)).toThrow(TypeError);
  });

  it('should validate the policy answer and the receipt', () => {
    expect(telemetryPolicyAnswerSchema.safeParse({ policy: 'on', maxAge: 900 }).success).toBe(true);
    expect(
      ingestReceiptSchema.safeParse({ recorded: 1, rejected: 0, duplicate: 0, disabled: 0, policy: 'on' }).success,
    ).toBe(true);
  });
});

/** Prometheus label names a registry metric exports, by its Prometheus series name. */
const labelsBySeries = new Map(
  Object.values(TauMetrics).map((metric) => [
    toPrometheusName(metric.name, metric.type),
    new Set(Object.keys(metric.attributes.shape).map((key) => key.replaceAll('.', '_'))),
  ]),
);

describe('usage coverage (T36, contract part)', () => {
  it('should name a registry series and an existing label in every row', () => {
    const problems = usageCoverage.flatMap((row) => {
      const [, base = '', selector = ''] = /^(?<base>[\w:]+)(?:\{(?<selector>[^}]*)\})?$/u.exec(row.series) ?? [];
      const name = base.replace(/_(?:bucket|count|sum)$/u, '');
      const labels = labelsBySeries.get(labelsBySeries.has(base) ? base : name);
      if (labels === undefined) {
        return [`${row.series}: not a registry series`];
      }
      const named = [row.by, ...[...selector.matchAll(/(?<label>\w+)=/gu)].map((match) => match.groups!['label']!)];
      return named.filter((label) => !labels.has(label)).map((label) => `${row.series}: no label ${label}`);
    });
    expect(problems).toEqual([]);
  });

  it('should cover every non-kernel capability kind', () => {
    for (const capability of ['transcoder', 'job', 'middleware', 'bundler', 'machine']) {
      expect(usageCoverage.some((row) => row.series.includes(`tau_runtime_capability="${capability}"`))).toBe(true);
    }
  });
});

describe('runtime metrics (T13 registry part)', () => {
  it('should give every product instrument the population label', () => {
    const product = [
      runtimeMetrics.runtimeOperations,
      runtimeMetrics.runtimePluginOperations,
      runtimeMetrics.runtimeMachineOperations,
      runtimeMetrics.runtimeKernelUsage,
      runtimeMetrics.runtimeTranscodeFormats,
      runtimeMetrics.runtimeEntryFormats,
      runtimeMetrics.runtimeOperationsByHost,
      runtimeMetrics.runtimeParameterFeatures,
      runtimeMetrics.runtimeKernelHeap,
      runtimeMetrics.runtimeParametersDeclared,
      runtimeMetrics.runtimeParameterEvaluations,
      runtimeMetrics.runtimeRenderBySize,
      runtimeMetrics.runtimeExports,
    ];
    for (const metric of product) {
      expect(Object.keys(metric.attributes.shape), metric.name).toContain('tau.runtime.population');
    }
  });
});

/**
 * Worker facts with overrides.
 *
 * @param overrides - Fields to set.
 * @returns The facts.
 */
function worker(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { queue: 1, execution: 10, cold: false, reuse: 'computed', ...overrides };
}
