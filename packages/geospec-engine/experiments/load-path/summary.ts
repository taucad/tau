export const loadPathBuckets = [
  'runtimeExport',
  'glbParse',
  'recordBuild',
  'statsFacade',
  'partition',
  'richDiagnostics',
  'overlap',
  'geospecRun',
  'nodeCli',
] as const;

/**
 *
 */
export type LoadPathBucket = (typeof loadPathBuckets)[number];

/**
 *
 */
export type LoadPathTimingSample = {
  bucket: LoadPathBucket;
  ms: number;
};

/**
 *
 */
export type LoadPathBucketSummary = {
  count: number;
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  totalMs: number;
};

/**
 *
 */
export type LoadPathSummary = {
  buckets: Partial<Record<LoadPathBucket, LoadPathBucketSummary>>;
  totalMs: LoadPathBucketSummary;
};

const percentile = (sorted: readonly number[], percentileValue: number): number => {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index]!;
};

const summarizeValues = (values: readonly number[]): LoadPathBucketSummary => {
  if (values.length === 0) {
    return { count: 0, minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, totalMs: 0 };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const totalMs = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    minMs: sorted[0]!,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted.at(-1)!,
    totalMs,
  };
};

export const summarizeLoadPathSamples = (samples: readonly LoadPathTimingSample[]): LoadPathSummary => {
  const valuesByBucket = new Map<LoadPathBucket, number[]>();
  for (const sample of samples) {
    const bucket = valuesByBucket.get(sample.bucket) ?? [];
    bucket.push(sample.ms);
    valuesByBucket.set(sample.bucket, bucket);
  }

  const buckets: Partial<Record<LoadPathBucket, LoadPathBucketSummary>> = {};
  for (const bucket of loadPathBuckets) {
    const values = valuesByBucket.get(bucket);
    if (values) {
      buckets[bucket] = summarizeValues(values);
    }
  }

  return {
    buckets,
    totalMs: summarizeValues(samples.map((sample) => sample.ms)),
  };
};
