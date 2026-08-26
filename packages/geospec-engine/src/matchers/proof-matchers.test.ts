/**
 * Relationship-endpoint diagnostic forwarding.
 *
 * An endpoint that fails to resolve already carries the diagnostic that says
 * why, with the code the author needs: `ambiguous` ("your selector matched
 * several things") is the opposite repair from `unmatched` ("your selector
 * matched nothing"). This suite pins that the matcher forwards the selection's
 * own diagnostic rather than re-coding every failure as unmatched, on both
 * endpoints.
 */

import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GeometrySubject as PublicGeometrySubject } from 'geospec/mesh';
import { exposeEngineSubject, releaseEngineSubject } from '#engine/subject-store.js';
import type { GeometrySubject } from '#mesh/types.js';
import { clearCollectorGlobals, createCollector, installCollector } from '#runner/collector.js';
import type { GeoSpecSpatialRelationshipExpectation } from '#runner/types.js';
import { loadStep } from '#step/index.js';

const fixturePath = join(import.meta.dirname, '../../fixtures/xde/two-cube-assembly.step');

describe('toHaveSpatialRelationships endpoint diagnostics', () => {
  let subject: GeometrySubject;
  let exposed: PublicGeometrySubject;

  beforeAll(async () => {
    subject = await loadStep({ source: fixturePath, name: 'two-cube-assembly.step' });
    exposed = exposeEngineSubject(subject);
  }, 120_000);

  afterAll(() => {
    releaseEngineSubject(exposed.subjectId);
  });

  const diagnose = async (relationship: GeoSpecSpatialRelationshipExpectation) => {
    const collector = createCollector();
    installCollector(collector);
    try {
      collector.it('should evaluate relationship matcher', () => {
        collector.expectGeo(exposed).toHaveSpatialRelationships({ relationships: [relationship] });
      });
      await collector.waitForCompletion(30_000);
      return collector.tests[0]?.assertions[0]?.diagnostics ?? [];
    } finally {
      clearCollectorGlobals();
    }
  };

  it('should report an over-matching subject selector as ambiguous, not unmatched', async () => {
    // `/cube/` matches cubeA and cubeB; the endpoint expects one.
    const diagnostics = await diagnose({ kind: 'contact', subject: /cube/u, target: 'cubeB' });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toStrictEqual(['GEOSPEC_SELECTOR_AMBIGUOUS']);
    expect(diagnostics[0]?.message).toContain('Spatial relationship 0 failed');
    expect(diagnostics[0]?.message).toContain('matched 2');
  });

  it('should report an unresolved target while the subject resolves', async () => {
    const diagnostics = await diagnose({ id: 'missing target', kind: 'contact', subject: 'cubeA', target: 'cubeZ' });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toStrictEqual(['GEOSPEC_SELECTOR_UNMATCHED']);
    expect(diagnostics[0]?.message).toContain('Spatial relationship 0 (missing target) failed');
  });

  it('should report both endpoints when neither resolves', async () => {
    const diagnostics = await diagnose({ kind: 'contact', subject: /cube/u, target: 'cubeZ' });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toStrictEqual([
      'GEOSPEC_SELECTOR_AMBIGUOUS',
      'GEOSPEC_SELECTOR_UNMATCHED',
    ]);
  });
});
