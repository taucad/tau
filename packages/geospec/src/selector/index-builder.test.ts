import { describe, expect, it } from 'vitest';
import {
  buildFixtureIndex,
  createFixtureFaceFacts,
  createFixtureXde,
} from '#selector/__fixtures__/two-cube-fixture.js';
import { selectorDiagnosticCodes } from '#selector/diagnostics.js';
import { buildSelectorIndex } from '#selector/index-builder.js';

describe('buildSelectorIndex', () => {
  it('should build occurrence rows with ordinal paths and face-derived bounds', () => {
    const index = buildFixtureIndex();

    expect(index.occurrences.map((row) => row.path)).toEqual(['cubeA', 'cubeB', 'bolt[1]', 'bolt[2]']);
    expect(index.occurrences[0]?.ordinalPath).toEqual([1]);
    expect(index.occurrences[1]?.ordinalPath).toEqual([2]);
    expect(index.occurrences[0]?.bounds).toEqual({ min: [0, 0, 0], max: [10, 10, 10] });
    expect(index.occurrences[2]?.bounds).toBeUndefined();
  });

  it('should build face rows sorted by faceIndex with snapshot topology refs', () => {
    const index = buildFixtureIndex();

    const facesOfCubeA = index.faces.filter((row) => row.occurrencePath === 'cubeA');
    expect(facesOfCubeA.map((row) => row.faceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(facesOfCubeA[0]?.topologyRef).toBe('#o1.f0');
    expect(index.faces.find((row) => row.occurrencePath === 'cubeB')?.topologyRef).toBe('#o2.f0');
  });

  it('should aggregate per-occurrence body rows with total area', () => {
    const index = buildFixtureIndex();

    const bodyOfCubeB = index.bodies.find((row) => row.occurrencePath === 'cubeB');
    expect(bodyOfCubeB?.area).toBeCloseTo(150, 6);
    expect(bodyOfCubeB?.bounds).toEqual({ min: [10, 0, 2], max: [20, 10, 10] });
  });

  it('should join authored interfaces to face rows and compose full names', () => {
    const index = buildFixtureIndex();

    const topInterface = index.interfaces.find((row) => row.fullName === 'cubeA.face.top');
    expect(topInterface).toMatchObject({
      occurrencePath: 'cubeA',
      name: 'face.top',
      faceIndex: 0,
      dangling: false,
      entityKinds: ['face', 'plane'],
    });
    expect(topInterface?.face?.facts.normal).toEqual([0, 0, 1]);
  });

  it('should derive entity kinds from geometry, not from authoring metadata', () => {
    const index = buildFixtureIndex();

    expect(index.interfaces.find((row) => row.fullName === 'cubeB.sideBore')?.entityKinds).toEqual(['face', 'axis']);
    expect(index.interfaces.find((row) => row.fullName === 'cubeA.bore[1]')?.entityKinds).toEqual(['face', 'axis']);
  });

  it('should flag an authored interface whose faceIndex no longer exists as dangling', () => {
    const index = buildFixtureIndex();

    expect(index.interfaces.find((row) => row.fullName === 'cubeA.ghost')).toMatchObject({
      dangling: true,
      entityKinds: ['face'],
    });
    expect(
      index.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === selectorDiagnosticCodes.unsupportedEvidence && diagnostic.message.includes('cubeA.ghost'),
      ),
    ).toBe(true);
  });

  it('should skip non-face subshape names with an informational diagnostic (V1 face scope)', () => {
    const index = buildFixtureIndex();

    expect(index.interfaces.some((row) => row.name === 'seam')).toBe(false);
    expect(
      index.diagnostics.some((diagnostic) => diagnostic.severity === 'info' && diagnostic.message.includes("'seam'")),
    ).toBe(true);
  });

  it('should materialize native datum placements in the subject frame', () => {
    const index = buildFixtureIndex();

    const datumOfCubeA = index.datums.find((row) => row.fullName === 'cubeA.origin');
    expect(datumOfCubeA).toMatchObject({ origin: [0, 0, 0], xAxis: [1, 0, 0], zAxis: [0, 0, 1] });

    const datumOfCubeB = index.datums.find((row) => row.fullName === 'cubeB.origin');
    expect(datumOfCubeB).toMatchObject({ origin: [20, 0, 0], xAxis: [0, 1, 0], zAxis: [0, 0, 1] });
  });

  it('should reconstruct groups from contiguous prefix[i] member names per occurrence', () => {
    const index = buildFixtureIndex();

    const bore = index.groups.find((row) => row.fullName === 'cubeA.bore');
    expect(bore?.memberIndices).toEqual([1, 2, 3]);
    expect(bore?.members.map((member) => member.fullName)).toEqual(['cubeA.bore[1]', 'cubeA.bore[2]', 'cubeA.bore[3]']);
  });

  it('should keep duplicated instance names addressable through name[k] occurrence paths', () => {
    const index = buildFixtureIndex();

    expect(index.occurrences.filter((row) => row.productName === 'Bolt').map((row) => row.path)).toEqual([
      'bolt[1]',
      'bolt[2]',
    ]);
  });

  it('should skip datum placements attached to unknown occurrences with an info diagnostic', () => {
    const xde = createFixtureXde();
    xde.datumPlacements.push({
      occurrencePath: 'missing',
      name: 'origin',
      origin: [0, 0, 0],
      xAxis: [1, 0, 0],
      zAxis: [0, 0, 1],
    });

    const index = buildSelectorIndex({ xde, faceFactsByOccurrence: createFixtureFaceFacts() });

    expect(index.datums.some((row) => row.occurrencePath === 'missing')).toBe(false);
    expect(index.diagnostics.some((diagnostic) => diagnostic.message.includes("unknown occurrence 'missing'"))).toBe(
      true,
    );
  });
});
