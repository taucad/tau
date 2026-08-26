import { describe, expect, it, vi } from 'vitest';
import type { AnalyzeMeshOverlapResult } from 'geospec/mesh';

const analyzeMeshOverlap = vi.hoisted(() => vi.fn());

vi.mock('#mesh/overlap.js', () => ({ analyzeMeshOverlap }));

const { toHaveNoComponentInterference } = await import('#matchers/mesh-matchers.js');

const subject: unknown = {
  kind: 'geometry-subject',
  mesh: { format: 'mesh-buffer', stats: {} },
  provenance: { source: { kind: 'mesh-buffer', format: 'mesh-buffer' }, unit: 'mm', loader: 'in-memory' },
  capabilities: [],
  diagnostics: [],
};

const invoke = async (): Promise<ReadonlyArray<{ code: string; spatial?: unknown }>> => {
  const diagnostics = await toHaveNoComponentInterference({
    protocolVersion: 1,
    matcher: 'toHaveNoComponentInterference',
    kind: 'componentInterference',
    subject,
    arguments: [{}],
    expected: {},
  });
  return diagnostics as ReadonlyArray<{ code: string; spatial?: unknown }>;
};

describe('toHaveNoComponentInterference against an analyzer that cannot answer', () => {
  it('should surface the analyzer diagnostics verbatim, never a substituted verdict', async () => {
    const refusal: AnalyzeMeshOverlapResult = {
      success: false,
      diagnostics: [{ code: 'GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE', severity: 'error', message: 'no partition' }],
    };
    analyzeMeshOverlap.mockResolvedValueOnce(refusal);
    const diagnostics = await invoke();
    expect(diagnostics[0]?.code).toBe('GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE');
  });

  it('should report an overlap that carries no witness point', async () => {
    const evidence: AnalyzeMeshOverlapResult = {
      success: true,
      diagnostics: [],
      evidence: {
        componentSource: 'named',
        componentCount: 2,
        checkedPairs: 1,
        tolerance: 1e-6,
        overlaps: [
          {
            leftComponentId: 0,
            rightComponentId: 1,
            leftLabel: 'a',
            rightLabel: 'b',
            intersectionVolume: 5,
            penetration: 'positive-volume',
          },
        ],
      },
    };
    analyzeMeshOverlap.mockResolvedValueOnce(evidence);
    const diagnostics = await invoke();
    expect(diagnostics[0]?.code).toBe('GEOSPEC_COMPONENT_INTERFERENCE_DETECTED');
    expect(diagnostics[0]?.spatial).toBeUndefined();
  });
});
