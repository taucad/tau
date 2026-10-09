import { describe, it, expect } from 'vitest';
import {
  agentToolKinds,
  clientMetricEntrySchema,
  ingestPayloadSchema,
  IngestEntryName,
  tauToolNames,
} from '#ingest.js';

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

  it.each([IngestEntryName.KERNEL_CREATE_GEOMETRY, IngestEntryName.KERNEL_EXPORT_GEOMETRY])(
    'should reject free-text error detail on %s',
    (name) => {
      expect(
        clientMetricEntrySchema.safeParse({ name, duration: 5, detail: { status: 'error', error: 'Kernel crash' } })
          .success,
      ).toBe(false);
    },
  );

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

describe('agent usage entries', () => {
  it('should accept a Codex turn with tools and tokens', () => {
    const entry = {
      name: IngestEntryName.AGENT_TURN,
      duration: 4000,
      detail: {
        agentId: 'codex',
        placement: 'daemon',
        outcome: 'completed',
        timeToFirstUpdate: 800,
        toolCalls: [{ kind: 'read', status: 'completed', count: 1 }],
        tokens: { input: 1, output: 2, cacheRead: 3, cacheWrite: 0 },
      },
    };
    expect(clientMetricEntrySchema.parse(entry)).toEqual(entry);
  });

  it('should reject a tool kind outside ACP ToolKind', () => {
    expect(() =>
      clientMetricEntrySchema.parse({
        name: IngestEntryName.AGENT_TURN,
        duration: 1,
        detail: {
          agentId: 'tau',
          placement: 'browser',
          outcome: 'completed',
          toolCalls: [{ kind: 'shell', status: 'completed', count: 1 }],
        },
      }),
    ).toThrow();
  });

  it('should clamp a turn longer than a day instead of dropping it', () => {
    const parsed = clientMetricEntrySchema.parse({
      name: IngestEntryName.AGENT_TURN,
      duration: 90_000_000,
      detail: { agentId: 'tau', placement: 'browser', outcome: 'completed' },
    });
    expect(parsed.duration).toBe(86_400_000);
  });
});

describe('agent turn context', () => {
  const context = {
    kernelId: 'replicad',
    skillsActivated: ['cad-replicad', 'custom'],
    callsBeforeFirstModelWrite: 6,
    timeToFirstModelWrite: 42_000,
    referenceLookups: [
      { outcome: 'ok', count: 3 },
      { outcome: 'zero_match', count: 1 },
    ],
    referenceBytesRead: 20_480,
    evaluations: [
      { class: 'api_misuse', count: 1 },
      { class: 'ok', count: 1 },
    ],
    correctionsAfterError: 1,
    geospec: { runs: 1, passed: 4, failed: 1, runStatuses: [{ status: 'failed', count: 1 }] },
  };

  const turn = (detail: Record<string, unknown>) => ({
    name: IngestEntryName.AGENT_TURN,
    duration: 60_000,
    detail: { agentId: 'tau', placement: 'browser', outcome: 'completed', ...detail },
  });

  it('should accept a turn with context and Tau tool names unchanged', () => {
    const entry = turn({
      toolCalls: [{ kind: 'search', tool: 'grep', status: 'completed', count: 2 }],
      context,
    });

    expect(clientMetricEntrySchema.parse(entry)).toEqual(entry);
  });

  it('should leave context absent when the turn omits it', () => {
    const parsed = clientMetricEntrySchema.parse(turn({}));

    expect(parsed.detail).not.toHaveProperty('context');
  });

  it('should clamp every context count to its ceiling instead of dropping the turn', () => {
    const parsed = clientMetricEntrySchema.parse(
      turn({
        context: {
          ...context,
          callsBeforeFirstModelWrite: 5000,
          timeToFirstModelWrite: 1e12,
          referenceLookups: [{ outcome: 'ok', count: 1e6 }],
          referenceBytesRead: 1e12,
          evaluations: [{ class: 'compile', count: 1000 }],
          correctionsAfterError: 1000,
          geospec: { runs: 1000, passed: 1e9, failed: 1e9, runStatuses: [{ status: 'passed', count: 1000 }] },
        },
      }),
    );

    expect(parsed.detail).toMatchObject({
      context: {
        callsBeforeFirstModelWrite: 1000,
        timeToFirstModelWrite: 86_400_000,
        referenceLookups: [{ outcome: 'ok', count: 1000 }],
        referenceBytesRead: 10_000_000,
        evaluations: [{ class: 'compile', count: 100 }],
        correctionsAfterError: 100,
        geospec: { runs: 100, passed: 10_000, failed: 10_000, runStatuses: [{ status: 'passed', count: 100 }] },
      },
    });
  });

  it.each([
    ['an unknown kernel', { ...context, kernelId: 'freecad' }],
    ['an unknown skill', { ...context, skillsActivated: ['my-private-skill'] }],
    ['an unknown lookup outcome', { ...context, referenceLookups: [{ outcome: 'timeout', count: 1 }] }],
    ['an unknown evaluation class', { ...context, evaluations: [{ class: 'syntax', count: 1 }] }],
    [
      'an unknown GeoSpec run status',
      { ...context, geospec: { ...context.geospec, runStatuses: [{ status: 'skipped', count: 1 }] } },
    ],
    ['a fractional count', { ...context, correctionsAfterError: 1.5 }],
    ['a negative count', { ...context, referenceLookups: [{ outcome: 'ok', count: -1 }] }],
    ['more than eight skills', { ...context, skillsActivated: Array.from({ length: 9 }, () => 'custom') }],
    [
      'more lookup rows than outcomes',
      { ...context, referenceLookups: Array.from({ length: 5 }, () => ({ outcome: 'ok', count: 1 })) },
    ],
    [
      'more evaluation rows than classes',
      { ...context, evaluations: Array.from({ length: 8 }, () => ({ class: 'ok', count: 1 })) },
    ],
  ])('should reject a context with %s', (_label, value) => {
    expect(clientMetricEntrySchema.safeParse(turn({ context: value })).success).toBe(false);
  });

  it('should reject a tool name outside Tau tools', () => {
    expect(
      clientMetricEntrySchema.safeParse(
        turn({ toolCalls: [{ kind: 'execute', tool: 'Bash', status: 'completed', count: 1 }] }),
      ).success,
    ).toBe(false);
  });

  it('should cap tool-call rows at two statuses per ACP kind and Tau tool', () => {
    const cap = (agentToolKinds.length + tauToolNames.length) * 2;
    const rows = (length: number) =>
      Array.from({ length }, () => ({ kind: 'read', tool: 'read_file', status: 'completed', count: 1 }));

    expect(clientMetricEntrySchema.safeParse(turn({ toolCalls: rows(cap) })).success).toBe(true);
    expect(clientMetricEntrySchema.safeParse(turn({ toolCalls: rows(cap + 1) })).success).toBe(false);
  });
});
