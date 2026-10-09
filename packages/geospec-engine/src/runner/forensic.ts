/** Structured, run-scoped forensic timing helpers. @module */

/** The stable forensic span inventory. */
export const geoSpecForensicSpans = Object.freeze([
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
