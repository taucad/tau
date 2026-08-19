import { describe, it, expect } from 'vitest';
import { clientMetricEntrySchema, ingestPayloadSchema, IngestEntryName } from '#ingest.js';

describe('IngestEntryName', () => {
  it('should define canonical entry name constants', () => {
    expect(IngestEntryName.KERNEL_CREATE_GEOMETRY).toBe('observability.createGeometry');
    expect(IngestEntryName.KERNEL_EXPORT_GEOMETRY).toBe('observability.exportGeometry');
  });
});

describe('clientMetricEntrySchema', () => {
  it('should accept a valid createGeometry entry', () => {
    const entry = {
      name: 'observability.createGeometry',
      duration: 123.45,
      detail: { status: 'success' },
    };
    expect(clientMetricEntrySchema.parse(entry)).toEqual(entry);
  });

  it('should accept a valid exportGeometry entry', () => {
    const entry = {
      name: 'observability.exportGeometry',
      duration: 50,
      detail: { status: 'success', exportFormat: 'step' },
    };
    expect(clientMetricEntrySchema.parse(entry)).toEqual(entry);
  });

  it('should accept an entry without detail', () => {
    const entry = { name: 'observability.createGeometry', duration: 10 };
    expect(clientMetricEntrySchema.parse(entry)).toEqual(entry);
  });

  it('should accept a createGeometry entry with error detail', () => {
    const entry = {
      name: 'observability.createGeometry',
      duration: 5,
      detail: { status: 'error', error: 'Kernel crash' },
    };
    expect(clientMetricEntrySchema.parse(entry)).toEqual(entry);
  });

  it('should reject an entry with unknown name', () => {
    expect(() => clientMetricEntrySchema.parse({ name: 'unknown.metric', duration: 1 })).toThrow();
  });

  it('should reject an entry with negative duration', () => {
    expect(() => clientMetricEntrySchema.parse({ name: 'observability.createGeometry', duration: -1 })).toThrow();
  });

  it('should reject an entry missing duration', () => {
    expect(() => clientMetricEntrySchema.parse({ name: 'observability.createGeometry' })).toThrow();
  });

  it('should reject an entry missing name', () => {
    expect(() => clientMetricEntrySchema.parse({ duration: 10 })).toThrow();
  });
});

describe('ingestPayloadSchema', () => {
  it('should accept a valid payload with multiple entries', () => {
    const payload = {
      entries: [
        { name: 'observability.createGeometry', duration: 100, detail: { status: 'success' } },
        { name: 'observability.exportGeometry', duration: 50, detail: { status: 'success', exportFormat: 'stl' } },
      ],
    };
    expect(ingestPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('should reject an empty entries array', () => {
    expect(() => ingestPayloadSchema.parse({ entries: [] })).toThrow();
  });

  it('should reject a payload without entries field', () => {
    expect(() => ingestPayloadSchema.parse({})).toThrow();
  });

  it('should reject a payload with invalid entry in array', () => {
    expect(() =>
      ingestPayloadSchema.parse({
        entries: [{ name: 'bad.name', duration: 1 }],
      }),
    ).toThrow();
  });
});
