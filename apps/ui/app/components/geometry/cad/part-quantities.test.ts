import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { GeometryComponentNode } from '@taucad/types';
import type { TauCadPhysical, TauCadTopologyComponent } from '@taucad/geometry-core';
import {
  appearanceLabel,
  estimatedMassG,
  densityLabel,
  knownMassLabel,
  projectPartInspection,
  quantityFromPhysical,
  statusOf,
  summarizePartQuantities,
  summaryLabel,
  volumeLabel,
  volumeState,
  weightLabel,
} from '#components/geometry/cad/part-quantities.js';

describe('part quantities', () => {
  const geometryDigest = `sha256:${'a'.repeat(64)}`;
  const physical = (valueMm3: number, density?: number): TauCadPhysical => ({
    volume: {
      state: 'measured',
      valueMm3,
      geometryDigest,
      method: 'occt-solid-volume',
      validity: 'closed-solid',
    },
    ...(density === undefined
      ? {}
      : {
          density: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing physical field uses cm³ notation.
            valueGPerCm3: density,
            provenance: 'authored-shape-config',
          },
        }),
  });

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
    expect(estimatedMassG(quantity)).toBe(19.344);
    expect(estimatedMassG(quantityFromPhysical(physical(12_480, 1.55), geometryDigest))).toBe(19.344);
    expect(quantityFromPhysical(physical(12_480, 1.55), 'older')).toEqual({});
    expect(densityLabel(quantity)).toBe('1.55 g/cm³');
    expect(knownMassLabel(19.344)).toBe('19.34 g');
  });

  it('retains only matching committed physical facts during transient previews', () => {
    const current = mock<GeometryComponentNode>({ id: 'housing', kind: 'part', physical: physical(999_000, 9) });
    const committed = mock<GeometryComponentNode>({ id: 'housing', kind: 'part', physical: physical(12_480, 1.55) });
    expect(projectPartInspection({ node: current, committedNode: committed, transientPreview: true })).toMatchObject({
      basis: 'last-committed',
      quantity: {
        volumeCm3: 12.48,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing API field uses cm³ notation.
        densityGPerCm3: 1.55,
      },
    });
    expect(projectPartInspection({ node: current }).quantity.volumeCm3).toBe(999);
    expect(projectPartInspection({ node: current, transientPreview: true })).toEqual({
      basis: 'unavailable',
      quantity: {},
    });
    expect(
      projectPartInspection({
        node: current,
        committedNode: mock<GeometryComponentNode>({ id: 'housing', kind: 'body', physical: physical(12_480, 1.55) }),
        transientPreview: true,
      }),
    ).toEqual({ basis: 'unavailable', quantity: {} });
  });

  it('should count selected leaf occurrences once and retain partial coverage', () => {
    const components: Array<Pick<TauCadTopologyComponent, 'id' | 'kind' | 'parentId' | 'childIds' | 'physical'>> = [
      { id: 'assembly', kind: 'assembly', childIds: ['known', 'missing', 'empty-group'] },
      { id: 'known', kind: 'part', parentId: 'assembly', childIds: ['body'], physical: physical(12_480, 1.55) },
      { id: 'body', kind: 'body', parentId: 'known' },
      { id: 'missing', kind: 'part', parentId: 'assembly', physical: physical(28_600) },
      { id: 'empty-group', kind: 'assembly', parentId: 'assembly' },
    ];
    expect(summarizePartQuantities(components, ['assembly', 'known'])).toEqual({
      knownMassG: 19.344,
      knownCount: 1,
      totalCount: 2,
      unknownIds: ['missing'],
    });
    expect(summarizePartQuantities(components, ['missing'])).toEqual({
      knownMassG: 0,
      knownCount: 0,
      totalCount: 1,
      unknownIds: ['missing'],
    });
  });

  it('should reject invalid native evidence and not infer density from a surface finish', () => {
    expect(estimatedMassG(quantityFromPhysical(physical(12_480)))).toBeUndefined();
    expect(estimatedMassG(quantityFromPhysical(physical(12_480, -1)))).toBeUndefined();
    expect(quantityFromPhysical(physical(Number.NaN, 1.55))).toEqual({ measurement: 'failed' });
    expect(quantityFromPhysical({ volume: { state: 'unavailable', reason: 'not-solid' } })).toEqual({
      measurement: 'open-mesh',
    });
    expect(
      quantityFromPhysical({
        volume: { state: 'unavailable', reason: 'not-solid' },
        density: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing physical field uses cm³ notation.
          valueGPerCm3: 1.55,
          provenance: 'authored-shape-config',
        },
      }),
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Unit-bearing projected field uses cm³ notation.
    ).toEqual({ measurement: 'open-mesh', densityGPerCm3: 1.55 });
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
