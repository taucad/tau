import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inspectGeometry, inspectionEntity } from '#inspection/inspect.js';
import { loadMesh } from '#mesh/load-mesh.js';
import type { GeometrySubject } from '#mesh/types.js';
import { loadStep } from '#step/index.js';
import type { ResolvedEntity } from '#selector/types.js';

const fixture = join(import.meta.dirname, '../../fixtures/containment/valve-stem-guide-positive/model.step');

describe('inspectionEntity', () => {
  const entity = (facts: ResolvedEntity['facts'], overrides?: Partial<ResolvedEntity>): ResolvedEntity => ({
    id: 'entity',
    entityType: 'face',
    facts,
    ...overrides,
  });

  it('should report an analytic axis', () => {
    const inspected = inspectionEntity(
      entity({
        axisDirection: [0, 0, 1],
        axisOrigin: [0, 0, 0],
        radius: 4,
        bounds: { min: [-4, -4, 0], max: [4, 4, 9] },
      }),
    );
    expect(inspected).toMatchObject({ kind: 'axis', direction: [0, 0, 1], radius: 4, source: 'selector' });
  });

  it('should report an axis with no radius, centroid or bounds', () => {
    expect(inspectionEntity(entity({ axisDirection: [1, 0, 0] }))).toMatchObject({ kind: 'axis' });
  });

  it('should report a plane', () => {
    expect(
      inspectionEntity(entity({ normal: [0, 0, 1], offset: 5, bounds: { min: [0, 0, 5], max: [1, 1, 5] } })),
    ).toMatchObject({ kind: 'plane', normal: [0, 0, 1], offset: 5 });
    expect(inspectionEntity(entity({ normal: [0, 0, 1] }))).toMatchObject({ kind: 'plane' });
  });

  it('should place an occurrence with no centroid at its bounds centre', () => {
    expect(inspectionEntity(entity({ bounds: { min: [0, 0, 0], max: [0, 0, 0] } }))).toMatchObject({
      center: [0, 0, 0],
    });
  });

  it('should report an occurrence from its bounds, and refuse an entity with no frame', () => {
    expect(
      inspectionEntity(
        entity({ bounds: { min: [0, 0, 0], max: [2, 2, 2] } }, { entityType: 'occurrence', occurrencePath: 'guide' }),
      ),
    ).toMatchObject({ kind: 'occurrence', name: 'guide', center: [1, 1, 1] });
    expect(inspectionEntity(entity({ bounds: { min: [0, 0, 0], max: [2, 2, 2] }, centroid: [9, 9, 9] }))).toMatchObject(
      {
        kind: 'occurrence',
        name: 'entity',
        center: [9, 9, 9],
      },
    );
    expect(inspectionEntity(entity({}))).toBeUndefined();
  });
});

describe('inspectGeometry', () => {
  let subject: GeometrySubject;

  beforeAll(async () => {
    subject = await loadStep({ source: fixture, name: 'valve-stem-guide' });
  }, 120_000);

  afterAll(() => {
    subject.nativeXde?.delete?.();
  });

  it('should report what each selector matched', () => {
    const result = inspectGeometry({ subject, selectors: ['guide.bore', { kind: 'occurrence', name: 'valve' }] });
    expect(result.selections).toHaveLength(2);
    expect(result.selections[0]?.matches[0]).toMatchObject({ kind: 'axis' });
    expect(result.selections[1]?.matches.length).toBeGreaterThan(0);
  });

  it('should carry a selector resolution failure through as a diagnostic', () => {
    const result = inspectGeometry({ subject, selectors: ['guide.nothing'] });
    expect(result.selections[0]?.matches).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('should drop a matched entity that carries no frame at all', () => {
    // An explicit axis fixture resolves, but the entity it fabricates has no
    // bounds and no analytic surface: inspection reports nothing rather than
    // inventing one.
    const result = inspectGeometry({
      subject,
      selectors: [{ kind: 'axis', direction: [0, 0, 1], center: [0, 0, 0] }],
    });
    expect(result.selections[0]?.matches).toEqual([]);
  });

  it('should refuse a subject with no selector index', async () => {
    const mesh = await loadMesh({
      source: { format: 'mesh-buffer', name: 'triangle', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
    });
    if (!mesh.success) {
      throw new Error('mesh-only subject failed to load');
    }
    const result = inspectGeometry({ subject: mesh.subject, selectors: ['anything'] });
    expect(result.selections).toEqual([{ selector: 'anything', matches: [] }]);
    expect(result.diagnostics[0]?.code).toBe('GEOSPEC_EVIDENCE_UNSUPPORTED');
  });
});
