import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentNode } from '@taucad/types';
import {
  appearanceLabel,
  statusOf,
  summaryLabel,
  volumeLabel,
  volumeState,
  weightLabel,
} from '#components/geometry/cad/part-quantities.js';

describe('part quantities', () => {
  it('should keep absent and invalid physical evidence unknown', () => {
    expect(volumeState({})).toBe('not-measured');
    expect(volumeLabel({})).toBe('Not measured');
    expect(weightLabel({})).toBe('Not measured');
    expect(statusOf({}).sentence).toBe('Volume not measured yet.');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing API field uses cm³ notation.
    expect(weightLabel({ volumeCm3: 12.48, densityGPerCm3: -1 })).toBe('Unknown');
    expect(volumeState({ volumeCm3: Number.NaN })).toBe('not-measured');
  });

  it('should derive weight from full-precision volume and valid density', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing API field uses cm³ notation.
    const quantity = { volumeCm3: 12.48, densityGPerCm3: 1.55 };
    expect(volumeLabel(quantity)).toBe('12.48 cm³');
    expect(weightLabel(quantity)).toBe('19.34 g');
    expect(statusOf(quantity).kind).toBe('ready');
  });

  it('should distinguish measuring, failed and open mesh evidence', () => {
    expect(statusOf({ measurement: 'measuring' })).toEqual({ kind: 'busy', sentence: 'Measuring volume…' });
    expect(statusOf({ measurement: 'failed' })).toEqual({ kind: 'failed', sentence: 'Measurement failed.' });
    expect(statusOf({ measurement: 'open-mesh' })).toEqual({
      kind: 'info',
      sentence: 'Open mesh: no enclosed volume.',
    });
  });

  it('should use the indexed surface material instead of deduplicated names', () => {
    const node = mock<GeometryComponentNode>({
      appearance: {
        materials: [
          { materialIndex: 1, name: 'Woven carbon' },
          { materialIndex: 3, name: 'Woven carbon' },
        ],
      },
    });
    expect(appearanceLabel(node)).toBe('2 surface materials');
    expect(summaryLabel(node, {})).toBe('2 surface materials');
    expect(appearanceLabel(mock<GeometryComponentNode>({ appearance: { materials: [{ materialIndex: 1 }] } }))).toBe(
      'Unnamed material',
    );
  });
});
