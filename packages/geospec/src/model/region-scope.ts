/** Which claims a region-cropped subject can stand for. @module */

import type { GeometryDiagnostic } from '#mesh/types.js';
import type { GeoSpecLoadRegion } from '#model/types.js';
import type { GeoSpecAssertion } from '#runner/types.js';

/**
 * The claims a region-cropped subject answers: measurements of the cropped geometry itself. Each
 * verdict holds for the region only, and the assertion records the region it stands for.
 *
 * Every other kind quantifies over the whole model (component counts, all-components
 * interference, occurrences, watertightness, integrity, topology, diagnostics) or relates parts the
 * crop may have cut, so a crop can neither prove nor disprove it.
 *
 * @public
 */
export const geoSpecRegionScopedKinds: ReadonlySet<GeoSpecAssertion['kind']> = new Set<GeoSpecAssertion['kind']>([
  'boundingBox',
  'volume',
  'surfaceArea',
  'mass',
  'centerOfMass',
]);

/**
 * Diagnostic code of a whole-model claim made on a region-cropped subject.
 *
 * @public
 */
export const geoSpecRegionWholeModelClaimCode = 'GEOSPEC_REGION_WHOLE_MODEL_CLAIM';

/**
 * The refusal for a whole-model claim on a region-cropped subject, or `undefined` when the subject
 * is the whole model or the claim measures the region itself.
 *
 * @param region - The crop the subject's load applied, when it was cropped.
 * @param kind - The claim's assertion kind.
 * @returns The typed refusal, never a verdict.
 * @internal
 */
export const regionScopeRefusal = (
  region: GeoSpecLoadRegion | undefined,
  kind: GeoSpecAssertion['kind'],
): GeometryDiagnostic | undefined =>
  region === undefined || geoSpecRegionScopedKinds.has(kind)
    ? undefined
    : {
        code: geoSpecRegionWholeModelClaimCode,
        severity: 'error',
        message: `A '${kind}' claim is about the whole model, and this subject is cropped to the region min [${region.min.join(', ')}] max [${region.max.join(', ')}] mm, so the claim cannot be decided on it.`,
        suggestion:
          'Keep the claim and make it on a whole-model load (loadModel without region). If the whole model exceeds a host limit, provision more resources (host admission limits or workUnitLimit) and report the claim as not decided at this capacity. A region load answers only bounding box, volume, surface area, mass and center of mass of that region.',
        details: {
          kind,
          region: { min: [...region.min], max: [...region.max] },
          regionScopedKinds: [...geoSpecRegionScopedKinds],
        },
      };
