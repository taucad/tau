/** Structured, run-scoped forensic timing helpers. @module */

/** The stable forensic span inventory. */
export const geoSpecForensicSpans = Object.freeze([
  'load.step.bytes',
  'load.step.peek',
  'load.step.read',
  'load.step.tessellate',
  'load.step.parse',
  'load.step.persist',
  'load.step.header',
  'mesh.record',
  'subject-build',
  'brep.facet.summary',
  'brep.facet.massProperties',
  'brep.facet.validity',
  'brep.facet.faceFeatures',
  'brep.facet.wallThickness',
  'overlap.step.prefilter.build',
  'overlap.step.prefilter.prove',
  'overlap.step.build',
  'overlap.step.peek',
  'overlap.step.intersection',
  'overlap.step.volume',
  'overlap.step.witness',
  'overlap.step.delete',
  'overlap.step.persist',
  'proof.extrema',
  'proof.classify',
  'proof.commonVolume',
  'void.section',
  'void.topology.build',
  'void.census.build',
  'void.census.materials',
  'void.census.needsSolid',
  'void.census.interior',
  'void.census.aabbDisjoint',
  'runner.file',
  'runner.shard',
  'create.runOcMain',
  'create.resolveInterfaces',
  'create.serializeNativeHandle',
  'mesh.renderDisplayTessellation',
  'mesh.packGltf',
  'export.renderGlbTessellation',
  'export.packGltf',
  'export.exportSTEP',
  'step.product.prepare',
  'step.document.build',
  'step.writer.perform',
  'step.writer.finalize',
  'step.file.transfer',
] as const);

/** A span name from {@link geoSpecForensicSpans}. */
export type GeoSpecForensicSpan = (typeof geoSpecForensicSpans)[number];

/** One structured forensic measurement. */
export type ForensicMeasurement = {
  name: string;
  value: number;
  unit: 'milliseconds' | 'count';
};

/** A run-owned destination for forensic measurements. */
export type ForensicSink = (measurement: ForensicMeasurement) => void;

/** Forward one untrusted protocol payload only when it is a valid forensic measurement. */
export const forwardProtocolForensicMeasurement = (payload: unknown, sink: ForensicSink): void => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return;
  }
  const { name, value, unit } = payload as Record<string, unknown>;
  if (
    typeof name === 'string' &&
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (unit === 'milliseconds' || unit === 'count')
  ) {
    sink({ name, value, unit });
  }
};

/** Time one synchronous operation when a sink is active. */
export const forensicSpan = <Value>(name: GeoSpecForensicSpan, run: () => Value, sink?: ForensicSink): Value => {
  if (!sink) {
    return run();
  }
  const started = performance.now();
  try {
    return run();
  } finally {
    sink({ name, value: performance.now() - started, unit: 'milliseconds' });
  }
};

/** Time one asynchronous operation when a sink is active. */
export const forensicSpanAsync = async <Value>(
  name: GeoSpecForensicSpan,
  run: () => Promise<Value>,
  sink?: ForensicSink,
): Promise<Value> => {
  if (!sink) {
    return run();
  }
  const started = performance.now();
  try {
    return await run();
  } finally {
    sink({ name, value: performance.now() - started, unit: 'milliseconds' });
  }
};

/** Emit one count when a sink is active. */
export const forensicValue = (name: GeoSpecForensicSpan, value: number, sink?: ForensicSink): void => {
  sink?.({ name, value, unit: 'count' });
};

/** An aggregating bucket set for hot inner loops. */
export type ForensicBuckets = {
  time<Value>(name: GeoSpecForensicSpan, run: () => Value): Value;
  timeAsync<Value>(name: GeoSpecForensicSpan, run: () => Promise<Value>): Promise<Value>;
  flush(): void;
};

/** Build run-scoped timing buckets. */
export const createForensicBuckets = (sink?: ForensicSink): ForensicBuckets => {
  const totals = new Map<GeoSpecForensicSpan, number>();
  const add = (name: GeoSpecForensicSpan, started: number): void => {
    totals.set(name, (totals.get(name) ?? 0) + performance.now() - started);
  };
  return {
    time(name, run) {
      if (!sink) {
        return run();
      }
      const started = performance.now();
      try {
        return run();
      } finally {
        add(name, started);
      }
    },
    async timeAsync(name, run) {
      if (!sink) {
        return run();
      }
      const started = performance.now();
      try {
        return await run();
      } finally {
        add(name, started);
      }
    },
    flush() {
      for (const [name, value] of totals) {
        sink?.({ name, value, unit: 'milliseconds' });
      }
      totals.clear();
    },
  };
};
