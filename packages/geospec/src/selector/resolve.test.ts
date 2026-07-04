import { describe, expect, it } from 'vitest';
import {
  buildFixtureIndex,
  createFixtureFaceFacts,
  createFixtureXde,
} from '#selector/__fixtures__/two-cube-fixture.js';
import { selectorDiagnosticCodes } from '#selector/diagnostics.js';
import { buildSelectorIndex } from '#selector/index-builder.js';
import { resolve } from '#selector/resolve.js';
import type { GeometrySelector } from '#selector/types.js';

const index = buildFixtureIndex();

describe('resolve', () => {
  describe('string shorthand', () => {
    it('should resolve an occurrence path to a single authored occurrence entity', () => {
      const selection = resolve('cubeA', index);

      expect(selection.status).toBe('resolved');
      expect(selection.stability).toBe('authored');
      expect(selection.source).toBe('step-xde');
      expect(selection.entities).toHaveLength(1);
      expect(selection.entities[0]).toMatchObject({ entityType: 'occurrence', occurrencePath: 'cubeA' });
    });

    it('should resolve an authored interface path to its face entity with index-time facts', () => {
      const selection = resolve('cubeA.face.top', index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.entityType).toBe('face');
      expect(selection.entities[0]?.facts.normal).toEqual([0, 0, 1]);
      expect(selection.entities[0]?.facts.offset).toBe(10);
    });

    it('should resolve name[k] paths produced from duplicated instance names', () => {
      const selection = resolve('bolt[2]', index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.occurrencePath).toBe('bolt[2]');
    });

    it('should resolve a bare group prefix and its [*] wildcard to the member set', () => {
      const byPrefix = resolve('cubeA.bore', index);
      const byWildcard = resolve('cubeA.bore[*]', index);

      expect(byPrefix.status).toBe('resolved');
      expect(byPrefix.expected).toBe('many');
      expect(byPrefix.entities.map((entity) => entity.facts.faceIndex)).toEqual([3, 4, 5]);
      expect(byWildcard.entities).toEqual(byPrefix.entities);
    });

    it('should resolve an indexed group member as a single interface', () => {
      const selection = resolve('cubeA.bore[2]', index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.facts.axisOrigin).toEqual([5, 2, 0]);
    });

    it('should resolve a datum path to its subject-frame frame facts', () => {
      const selection = resolve('cubeB.origin', index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]).toMatchObject({
        entityType: 'datum',
        facts: { origin: [20, 0, 0], xAxis: [0, 1, 0], zAxis: [0, 0, 1] },
      });
    });

    it('should report ambiguous when a product name matches multiple occurrences', () => {
      const selection = resolve('Cube', index);

      expect(selection.status).toBe('ambiguous');
      expect(selection.candidates?.map((candidate) => candidate.occurrencePath)).toEqual(['cubeA', 'cubeB']);
      expect(selection.diagnostics[0]?.code).toBe(selectorDiagnosticCodes.ambiguous);
    });

    it('should report unmatched with near-misses for an unknown authored name', () => {
      const selection = resolve('cubeA.face.side', index);

      expect(selection.status).toBe('unmatched');
      expect(selection.diagnostics[0]?.code).toBe(selectorDiagnosticCodes.unmatched);
      expect(selection.diagnostics[0]?.details).toMatchObject({
        availableInterfaces: expect.arrayContaining(['cubeA.face.top', 'cubeB.face.a']) as unknown,
      });
    });

    it('should reject non-conforming paths with a grammar suggestion', () => {
      const selection = resolve('9lives', index);

      expect(selection.status).toBe('unmatched');
      expect(selection.diagnostics[0]?.message).toContain('not a conforming selector path');
    });

    it('should reject a [*] wildcard on a non-final segment', () => {
      const selection = resolve('cubeA.bore[*].lip', index);

      expect(selection.status).toBe('unmatched');
      expect(selection.diagnostics[0]?.message).toContain('non-final segment');
    });
  });

  describe('snapshot topology refs', () => {
    it('should resolve #o<n>.f<k> positionally with derived-ordinal stability', () => {
      const selection = resolve('#o2.f0', index);

      expect(selection.status).toBe('resolved');
      expect(selection.stability).toBe('derived-ordinal');
      expect(selection.entities[0]?.occurrencePath).toBe('cubeB');
      expect(selection.entities[0]?.facts.centroid).toEqual([15, 5, 10]);
    });

    it('should resolve a bare #o<n> ref to the occurrence', () => {
      const selection = resolve('#o1', index);

      expect(selection.entities[0]).toMatchObject({ entityType: 'occurrence', occurrencePath: 'cubeA' });
    });

    it('should report unmatched for a positional ref that does not exist', () => {
      expect(resolve('#o9', index).status).toBe('unmatched');
      expect(resolve('#o1.f42', index).status).toBe('unmatched');
      expect(resolve('#oops', index).status).toBe('unmatched');
    });
  });

  describe('typed selectors and queries', () => {
    it('should resolve interface and query forms of the same face identically apart from stability', () => {
      const byName = resolve({ kind: 'interface', name: 'cubeA.face.top' }, index);
      const byQuery = resolve(
        { kind: 'face', of: 'cubeA', query: { surfaceType: 'plane', normal: { direction: [0, 0, 1] } } },
        index,
      );

      expect(byName.status).toBe('resolved');
      expect(byQuery.status).toBe('resolved');
      expect(byName.stability).toBe('authored');
      expect(byQuery.stability).toBe('derived-query');
      expect(byQuery.entities[0]?.facts).toMatchObject({ normal: [0, 0, 1], offset: 10 });
    });

    it('should resolve a part-relative interface name scoped with of', () => {
      const selection = resolve({ kind: 'interface', name: 'face.a', of: 'cubeB' }, index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.occurrencePath).toBe('cubeB');
    });

    it('should report ambiguous for symmetric faces without a disambiguating predicate', () => {
      const selection = resolve({ kind: 'plane', query: { normal: { direction: [0, 0, 1] } } }, index);

      expect(selection.status).toBe('ambiguous');
      expect(selection.entities).toHaveLength(0);
      expect(selection.candidates?.map((candidate) => candidate.occurrencePath)).toEqual(['cubeA', 'cubeB']);
      expect(selection.candidates?.[0]?.rank).toBe(1);
    });

    it('should name the excluding predicate on unmatched near-misses', () => {
      const selection = resolve(
        { kind: 'face', of: 'cubeA', query: { surfaceType: 'plane', normal: { direction: [1, 0, 0] } } },
        index,
      );

      expect(selection.status).toBe('unmatched');
      expect(selection.candidates?.[0]?.excludedBy).toBe('normal');
    });

    it('should resolve axis selectors from cylindrical face facts with radius bands', () => {
      const selection = resolve(
        { kind: 'axis', of: 'cubeA', query: { radius: { min: 0.5, max: 1.5 } }, expect: { exactly: 3 } },
        index,
      );

      expect(selection.status).toBe('resolved');
      expect(selection.entities.map((entity) => entity.entityType)).toEqual(['axis', 'axis', 'axis']);
      expect(selection.entities.map((entity) => entity.facts.axisOrigin)).toEqual([
        [2, 2, 0],
        [5, 2, 0],
        [8, 2, 0],
      ]);
    });

    it('should resolve a tilted-frame axis by full Vec3 direction, not principal axes', () => {
      const selection = resolve({ kind: 'axis', query: { axis: { direction: [0, 1, 0] } } }, index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.occurrencePath).toBe('cubeB');
      expect(selection.entities[0]?.facts.radius).toBe(3);
    });

    it('should apply orderBy and pick deterministically', () => {
      const selection = resolve(
        { kind: 'face', of: 'cubeA', query: { surfaceType: 'cylinder', orderBy: 'radius', pick: 'last' } },
        index,
      );

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.facts.radius).toBe(2);
    });

    it('should support allOf/anyOf/not set algebra', () => {
      const selection = resolve(
        {
          kind: 'face',
          of: 'cubeA',
          query: {
            surfaceType: 'plane',
            allOf: [{ area: { min: 50 } }],
            anyOf: [{ offset: 10 }, { offset: 99 }],
            not: { normal: { direction: [0, 0, -1] } },
          },
        },
        index,
      );

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.facts.offset).toBe(10);
    });

    it('should restrict candidates with a within scope selector', () => {
      const selection = resolve({ kind: 'plane', query: { normal: { direction: [0, 0, 1] }, within: 'cubeB' } }, index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.occurrencePath).toBe('cubeB');
    });

    it('should resolve body selectors per occurrence', () => {
      const selection = resolve({ kind: 'body', of: 'cubeB' }, index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]).toMatchObject({ entityType: 'body', facts: { area: 150 } });
    });

    it('should resolve typed occurrence selectors with counted cardinality', () => {
      const selection = resolve({ kind: 'occurrence', name: 'Bolt', expect: { exactly: 2 } }, index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities.map((entity) => entity.occurrencePath)).toEqual(['bolt[1]', 'bolt[2]']);
    });

    it('should report unmatched with found-vs-expected for counted cardinality misses', () => {
      const selection = resolve({ kind: 'axis', of: 'cubeA', query: { radius: 1 }, expect: { atLeast: 4 } }, index);

      expect(selection.status).toBe('unmatched');
      expect(selection.diagnostics[0]?.details).toMatchObject({ found: 3, expected: { atLeast: 4 } });
    });
  });

  describe('probes', () => {
    it('should resolve containsPoint against bounds plus analytic surface residual', () => {
      const onBore = resolve({ kind: 'face', of: 'cubeA', query: { containsPoint: [7, 5, 5] } }, index);

      expect(onBore.status).toBe('resolved');
      expect(onBore.stability).toBe('derived-probe');
      expect(onBore.entities[0]?.facts.faceIndex).toBe(2);
    });

    it('should reject containsPoint probes off the analytic surface', () => {
      const selection = resolve({ kind: 'face', of: 'cubeA', query: { containsPoint: [6.5, 5, 5] } }, index);

      expect(selection.status).toBe('unmatched');
      expect(selection.candidates?.some((candidate) => candidate.excludedBy === 'containsPoint')).toBe(true);
    });

    it('should resolve nearestTo by centroid distance', () => {
      const selection = resolve({ kind: 'axis', of: 'cubeA', query: { radius: 1, nearestTo: [7.5, 2, 5] } }, index);

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.facts.axisOrigin).toEqual([8, 2, 0]);
    });

    it('should report ambiguous with distances when nearestTo ties', () => {
      const selection = resolve({ kind: 'axis', of: 'cubeA', query: { radius: 1, nearestTo: [3.5, 2, 5] } }, index);

      expect(selection.status).toBe('ambiguous');
      expect(selection.candidates).toHaveLength(2);
      expect(selection.candidates?.[0]?.distance).toBeCloseTo(1.5, 9);
    });

    it('should resolve hitByRay to the first analytic hit along the ray', () => {
      const selection = resolve(
        {
          kind: 'face',
          of: 'cubeA',
          query: { surfaceType: 'plane', hitByRay: { origin: [5, 5, 20], direction: [0, 0, -1] } },
        },
        index,
      );

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.facts.offset).toBe(10);
    });

    it('should hit cylindrical faces analytically', () => {
      const selection = resolve(
        {
          kind: 'face',
          of: 'cubeA',
          query: { surfaceType: 'cylinder', radius: 2, hitByRay: { origin: [-5, 5, 5], direction: [1, 0, 0] } },
        },
        index,
      );

      expect(selection.status).toBe('resolved');
      expect(selection.entities[0]?.facts.faceIndex).toBe(2);
    });

    it('should report unsupported instead of approximating rays over non-analytic faces', () => {
      const selection = resolve(
        { kind: 'face', of: 'cubeA', query: { hitByRay: { origin: [5, 5, 20], direction: [0, 0, -1] } } },
        index,
      );

      expect(selection.status).toBe('unsupported');
      expect(selection.diagnostics[0]?.code).toBe(selectorDiagnosticCodes.unsupportedEvidence);
      expect(selection.diagnostics[0]?.suggestion).toContain('deferred');
    });
  });

  describe('groups and drift', () => {
    it('should resolve a typed group selector to ordered members', () => {
      const selection = resolve({ kind: 'group', name: 'cubeA.bore' }, index);

      expect(selection.status).toBe('resolved');
      expect(selection.expected).toBe('many');
      expect(selection.entities).toHaveLength(3);
    });

    it('should report 2-of-3 group drift as unmatched with missing-member near-facts', () => {
      const xde = createFixtureXde();
      xde.subshapeNames = xde.subshapeNames.filter((subshape) => subshape.name !== 'bore[3]');
      const driftedIndex = buildSelectorIndex({ xde, faceFactsByOccurrence: createFixtureFaceFacts() });

      const selection = resolve({ kind: 'group', name: 'cubeA.bore', expect: { exactly: 3 } }, driftedIndex);

      expect(selection.status).toBe('unmatched');
      expect(selection.diagnostics[0]?.code).toBe(selectorDiagnosticCodes.unmatched);
      expect(selection.diagnostics[0]?.details).toMatchObject({
        found: 2,
        expected: { exactly: 3 },
        missingMembers: [
          {
            name: 'cubeA.bore[3]',
            nearestMemberFacts: expect.objectContaining({ radius: 1 }) as unknown,
          },
        ],
      });
    });

    it('should report unmatched for an unknown group name', () => {
      const selection = resolve({ kind: 'group', name: 'cubeA.stud' }, index);

      expect(selection.status).toBe('unmatched');
      expect(selection.diagnostics[0]?.details).toMatchObject({ availableGroups: ['cubeA.bore'] });
    });
  });

  describe('unsupported evidence', () => {
    it('should report unsupported for interface selectors when the artifact has no authored names', () => {
      const xde = createFixtureXde();
      xde.subshapeNames = [];
      const unnamedIndex = buildSelectorIndex({ xde, faceFactsByOccurrence: createFixtureFaceFacts() });

      const selection = resolve({ kind: 'interface', name: 'cubeA.face.top' }, unnamedIndex);

      expect(selection.status).toBe('unsupported');
      expect(selection.diagnostics[0]?.code).toBe(selectorDiagnosticCodes.unsupportedEvidence);
      expect(selection.diagnostics[0]?.suggestion).toContain('derived query/probe');
    });
  });

  describe('determinism (master acceptance case 1)', () => {
    it.each([
      'cubeA.face.top',
      'cubeA.bore[*]',
      '#o1.f2',
      JSON.stringify({ kind: 'plane', query: { normal: { direction: [0, 0, 1] } } }),
    ])('should resolve %s to deeply equal selections on repeated runs', (encoded) => {
      const selector: GeometrySelector = encoded.startsWith('{') ? (JSON.parse(encoded) as GeometrySelector) : encoded;

      expect(resolve(selector, index)).toEqual(resolve(selector, index));
    });
  });

  describe('diagnostics payload contract', () => {
    it('should carry the serialized selector and stability class in failure payloads', () => {
      const selection = resolve({ kind: 'face', of: /nowhere/u, query: { surfaceType: 'plane' } }, index);

      expect(selection.status).toBe('unmatched');
      expect(selection.diagnostics[0]?.details).toMatchObject({
        selector: { kind: 'face', of: { pattern: 'nowhere', flags: 'u' }, query: { surfaceType: 'plane' } },
        stability: 'derived-query',
      });
      expect(selection.diagnostics[0]?.suggestion).toBeTruthy();
    });
  });
});
