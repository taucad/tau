import { describe, expect, it } from 'vitest';
import { geoSpecRegionScopedKinds, geoSpecRegionWholeModelClaimCode, regionScopeRefusal } from '#model/region-scope.js';
import type { GeoSpecAssertion } from '#runner/types.js';

const region = { min: [0, 0, 0], max: [5, 5, 5] } as const;

describe('regionScopeRefusal', () => {
  it('should let every claim through on a whole-model subject', () => {
    expect(regionScopeRefusal(undefined, 'connectedComponents')).toBeUndefined();
  });

  it('should let a region measure its own geometry', () => {
    for (const kind of geoSpecRegionScopedKinds) {
      expect(regionScopeRefusal(region, kind)).toBeUndefined();
    }
  });

  it('should refuse whole-model and all-components claims on a crop, without suggesting a smaller model or a budget', () => {
    const wholeModel: Array<GeoSpecAssertion['kind']> = [
      'connectedComponents',
      'componentInterference',
      'assemblyOccurrences',
      'productStructure',
      'watertight',
      'meshIntegrity',
      'topologyCounts',
      'noDiagnostics',
      'spatialRelationships',
    ];
    for (const kind of wholeModel) {
      const refusal = regionScopeRefusal(region, kind);
      expect(refusal).toMatchObject({
        code: geoSpecRegionWholeModelClaimCode,
        severity: 'error',
        details: { kind, region: { min: [0, 0, 0], max: [5, 5, 5] } },
      });
      expect(refusal?.suggestion).not.toMatch(/\b(?:coarsen|coarser|shrink|crop|simplify|workUnitLimit)\b/iu);
    }
  });
});
