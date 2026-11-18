// @vitest-environment node

/**
 * Replicad — GeoSpec interface resolution against live faces.
 *
 * The per-entry face-query context memoizes each face's center and default
 * normal. A finder may own and delete the `Vector` that `face.center` or
 * `face.normalAt()` returns (the `@taulabs/replicad` fork's `inPlane` deletes
 * the center and its `shouldKeep` deletes the normal), so the memo must hand
 * every read a fresh `Vector` and keep only a coordinate tuple. The deleting
 * finder below reproduces that ownership over the pinned Replicad release.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type * as ReplicadModule from 'replicad';
import { esbuildBundler } from '@taucad/esbuild';
import { assertRenderingSuccess, createTestGeometry } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { axis, face, group } from '#annotations/index.js';
import type { InterfaceDeclarations } from '#annotations/index.js';
import { resolveEntryInterfaces } from '#interface-resolution.js';
import { replicadKernel } from '#replicad.kernel.js';

type ReplicadLibrary = typeof ReplicadModule;

const runtime = defineRuntime({ kernels: [replicadKernel()], bundlers: [esbuildBundler()] });

/**
 * A Replicad library whose `FaceFinder` deletes the vectors it reads, as the fork's does: `inPlane`
 * deletes each face center and `shouldKeep` deletes each face normal once the filters have run.
 *
 * @param replicad - Live Replicad module.
 * @returns The module with its `FaceFinder` replaced.
 */
const withForkOwnership = (replicad: ReplicadLibrary): ReplicadLibrary => {
  class DeletingFaceFinder extends replicad.FaceFinder {
    public override shouldKeep(element: ReplicadModule.Face): boolean {
      const normal = element.normalAt();
      try {
        return this.filters.every((filter) => filter({ normal, element }));
      } finally {
        normal.delete();
      }
    }

    public override inPlane(
      inputPlane: Parameters<ReplicadModule.FaceFinder['inPlane']>[0],
      origin?: Parameters<ReplicadModule.FaceFinder['inPlane']>[1],
    ): this {
      const plane =
        inputPlane instanceof replicad.Plane ? replicad.makePlane(inputPlane) : replicad.makePlane(inputPlane, origin);
      this.parallelTo(plane);
      this.filters.push(({ element }) => {
        const point = element.center;
        const projectedPoint = point.projectToPlane(plane);
        const inPlane = point.equals(projectedPoint);
        projectedPoint.delete();
        point.delete();
        return inPlane;
      });
      return this;
    }
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Replaces Replicad's exported `FaceFinder` class.
  return { ...replicad, FaceFinder: DeletingFaceFinder };
};

describe('resolveEntryInterfaces', () => {
  let replicad: ReplicadLibrary;

  // The `replicad` library binds its OpenCASCADE instance process-globally through `setOC`, so one render
  // installs the kernel's instance for the shapes built below.
  beforeAll(async () => {
    assertRenderingSuccess(
      await createTestGeometry({
        runtime,
        files: {
          'bootstrap.ts': `import { makeBox } from 'replicad'; export default () => makeBox([0, 0, 0], [1, 1, 1]);`,
        },
        open: { source: { path: 'bootstrap.ts' } },
      }),
    );
    replicad = await import('replicad');
  }, 60_000);

  /** A 50 x 30 x 10 plate with a through hole, so it has planar and cylindrical faces. */
  const makePlate = (): ReplicadModule.Shape3D =>
    replicad
      .drawRoundedRectangle(50, 30)
      .sketchOnPlane()
      .extrude(10)
      .cut(replicad.makeCylinder(4, 10, [0, 0, 0]));

  /**
   * The index of the one face a fresh, unmemoized `FaceFinder` keeps.
   *
   * @param shape - Shape to search.
   * @param select - Face selector.
   * @returns The face's index in `shape.faces`.
   */
  const unmemoizedIndex = (
    shape: ReplicadModule.Shape3D,
    select: (finder: ReplicadModule.FaceFinder) => ReplicadModule.FaceFinder,
  ): number => {
    const finder = select(new replicad.FaceFinder());
    const [match, ...rest] = shape.faces.filter((candidate) => finder.shouldKeep(candidate));
    expect(rest).toHaveLength(0);
    return shape.faces.findIndex((candidate) => candidate.isSame(match!));
  };

  /** Several `inPlane` queries over the same entry: two faces, a group of both and an axis after them. */
  const multiQueryInterfaces = (): InterfaceDeclarations => ({
    top: face((f) => f.inPlane('XY', 10)),
    bottom: face((f) => f.inPlane('XY', 0)),
    caps: group([face((f) => f.inPlane('XY', 0)), face((f) => f.inPlane('XY', 10))]),
    bore: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([4, 0, 5])),
  });

  const resolvedIndices = (library: ReplicadLibrary): Record<string, number | undefined> => {
    const shape = makePlate();
    const resolved = resolveEntryInterfaces({ shape, name: 'plate', interfaces: multiQueryInterfaces() }, library);
    return Object.fromEntries(
      (resolved.resolvedInterfaces ?? []).map((entry) => [
        entry.name,
        entry.kind === 'datum' ? undefined : entry.faceIndex,
      ]),
    );
  };

  it('should resolve several inPlane interfaces on one entry to the faces an unmemoized finder finds', () => {
    const shape = makePlate();
    const top = unmemoizedIndex(shape, (f) => f.inPlane('XY', 10));
    const bottom = unmemoizedIndex(shape, (f) => f.inPlane('XY', 0));
    const bore = unmemoizedIndex(shape, (f) => f.ofSurfaceType('CYLINDRE').containsPoint([4, 0, 5]));
    expect(new Set([top, bottom, bore]).size).toBe(3);

    expect(resolvedIndices(replicad)).toEqual({
      top,
      bottom,
      'caps[1]': bottom,
      'caps[2]': top,
      bore,
    });
  });

  it('should resolve several inPlane interfaces on one entry when the filter deletes the center it reads', () => {
    expect(resolvedIndices(withForkOwnership(replicad))).toEqual(resolvedIndices(replicad));
  });

  it('should resolve several queries on one entry when shouldKeep deletes the normal it reads', () => {
    const library = withForkOwnership(replicad);
    // A selector that returns its own finder bypasses the resolver's finder, so the fork's
    // `shouldKeep` reads, and deletes, the memoized normal of every listed face.
    const interfaces: InterfaceDeclarations = {
      top: face(() => new library.FaceFinder().inPlane('XY', 10)),
      bottom: face(() => new library.FaceFinder().inPlane('XY', 0)),
      caps: group([face((f) => f.parallelTo('XY').inPlane('XY', 0)), face((f) => f.inPlane('XY', 10))]),
      bore: axis(() => new library.FaceFinder().ofSurfaceType('CYLINDRE').containsPoint([4, 0, 5])),
    };
    const shape = makePlate();
    const resolved = resolveEntryInterfaces({ shape, name: 'plate', interfaces }, library);

    expect(
      Object.fromEntries(
        (resolved.resolvedInterfaces ?? []).map((entry) => [
          entry.name,
          entry.kind === 'datum' ? undefined : entry.faceIndex,
        ]),
      ),
    ).toEqual(resolvedIndices(replicad));
  });

  it('should describe candidate centers after inPlane filters deleted the centers they read', () => {
    const shape = makePlate();
    const interfaces: InterfaceDeclarations = {
      top: face((f) => f.inPlane('XY', 10)),
      bottom: face((f) => f.inPlane('XY', 0)),
      plane: face((f) => f.parallelTo('XY')),
    };

    expect(() => resolveEntryInterfaces({ shape, name: 'plate', interfaces }, withForkOwnership(replicad))).toThrow(
      "GeoSpec interface 'plane' on entry 'plate': face finder matched 2 faces, expected exactly 1; " +
        'candidates: PLANE @ [0, 0, 0]; PLANE @ [0, 0, 10]',
    );
  });

  it('should describe the resolved face center when an axis resolves to a non-axial face', () => {
    const shape = makePlate();
    const interfaces: InterfaceDeclarations = {
      top: face((f) => f.inPlane('XY', 10)),
      topAxis: axis((f) => f.inPlane('XY', 10)),
    };

    expect(() => resolveEntryInterfaces({ shape, name: 'plate', interfaces }, withForkOwnership(replicad))).toThrow(
      "GeoSpec interface 'topAxis' on entry 'plate': axis() requires a cylindrical or conical face, " +
        'but the resolved face is PLANE @ [0, 0, 10]',
    );
  });
});
