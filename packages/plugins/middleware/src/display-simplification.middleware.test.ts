import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Accessor, Document, NodeIO, Primitive } from '@gltf-transform/core';
import { EXTManifold } from 'manifold-3d/manifold-gltf';
import type { KernelIssue, RenderResult, TessellationReport } from '@taucad/runtime/types';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';
import { createErrorResult, createMockRuntime } from '@taucad/runtime-testing';

import {
  displaySimplification,
  displaySimplificationMaxTriangles,
  displaySimplificationVoxelErrorRatio,
} from '#display-simplification.middleware.js';

type Options = { maxTriangles: number };
type Vec3 = readonly [number, number, number];

/** A welded UV sphere, positions in metres. */
const uvSphere = (radius: number, segments: number, rings: number) => {
  const positions: number[] = [];
  const normals: number[] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const polar = (ring / rings) * Math.PI;
    for (let segment = 0; segment < segments; segment++) {
      const azimuth = (segment / segments) * 2 * Math.PI;
      const normal = [Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)];
      normals.push(...normal);
      positions.push(...normal.map((value) => value * radius));
    }
  }
  const indices: number[] = [];
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + segment;
      const d = (ring + 1) * segments + next;
      if (ring > 0) {
        indices.push(a, b, c);
      }
      if (ring < rings - 1) {
        indices.push(b, d, c);
      }
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
};

/** 20 mm sphere, 48 × 24: 2,208 triangles with at most 0.0428 mm of chordal sag. */
const sphereRadius = 0.01;
const sphere = uvSphere(sphereRadius, 48, 24);
const sphereTriangles = sphere.indices.length / 3;
const sphereVertices = sphere.positions.length / 3;

/** A welded cube of side `size` metres with `steps` × `steps` quads per face, outward winding. */
const gridCube = (size: number, steps: number) => {
  const positions: number[] = [];
  const indices: number[] = [];
  const ids = new Map<string, number>();
  const id = (point: readonly number[]) => {
    const key = point.join(',');
    let index = ids.get(key);
    if (index === undefined) {
      index = positions.length / 3;
      ids.set(key, index);
      positions.push(...point.map((value) => (value / steps - 0.5) * size));
    }
    return index;
  };
  for (const axis of [0, 1, 2]) {
    for (const side of [0, steps]) {
      const [u, v] = [(axis + 1) % 3, (axis + 2) % 3];
      const at = (i: number, j: number) => {
        const point = [0, 0, 0];
        point[axis] = side;
        point[u] = i;
        point[v] = j;
        return id(point);
      };
      for (let i = 0; i < steps; i++) {
        for (let j = 0; j < steps; j++) {
          const quad = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
          const [a, b, c, d] = side === 0 ? [...quad].reverse() : quad;
          indices.push(a!, b!, c!, a!, c!, d!);
        }
      }
    }
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
};

type MeshGeometry = { readonly positions: Float32Array<ArrayBuffer>; readonly indices: Uint32Array<ArrayBuffer> };

/** A GLB with one mesh per entry, each drawn by `occurrences` unscaled nodes. */
const createMeshesGlb = async (
  meshes: ReadonlyArray<{ readonly geometry: MeshGeometry; readonly occurrences: number }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();
  for (const [index, { geometry, occurrences }] of meshes.entries()) {
    const primitive = document
      .createPrimitive()
      .setAttribute(
        'POSITION',
        document.createAccessor().setBuffer(buffer).setType('VEC3').setArray(geometry.positions),
      )
      .setIndices(document.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(geometry.indices));
    const mesh = document.createMesh(`mesh ${String(index)}`).addPrimitive(primitive);
    for (let occurrence = 0; occurrence < occurrences; occurrence++) {
      scene.addChild(document.createNode().setMesh(mesh));
    }
  }
  return new NodeIO().writeBinary(document);
};

type SphereGlbOptions = {
  /** Nodes drawing the sphere mesh, by uniform scale. */
  readonly nodeScales?: readonly number[];
  /** Annotate the sphere mesh with EXT_mesh_manifold. */
  readonly manifold?: boolean;
  /** Add LINES, non-indexed, integer-position and position-less primitives beside the sphere. */
  readonly ineligible?: boolean;
  /** Add a second sphere mesh that no node draws. */
  readonly unreferenced?: boolean;
};

const createSphereGlb = async ({
  nodeScales = [1],
  manifold = false,
  ineligible = false,
  unreferenced = false,
}: SphereGlbOptions = {}): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const accessor = (array: Float32Array<ArrayBuffer> | Uint32Array<ArrayBuffer>, type: 'VEC3' | 'SCALAR') =>
    document.createAccessor().setBuffer(buffer).setType(Accessor.Type[type]!).setArray(array);
  const spherePrimitive = () =>
    document
      .createPrimitive()
      .setMode(Primitive.Mode['TRIANGLES']!)
      .setAttribute('POSITION', accessor(sphere.positions, 'VEC3'))
      .setAttribute('NORMAL', accessor(sphere.normals, 'VEC3'))
      .setIndices(accessor(sphere.indices, 'SCALAR'));

  const primitive = spherePrimitive();
  const mesh = document.createMesh('sphere').addPrimitive(primitive);
  if (manifold) {
    mesh.setExtension(
      EXTManifold.EXTENSION_NAME,
      document
        .createExtension(EXTManifold)
        .createManifoldPrimitive()
        .setIndices(primitive.getIndices()!)
        .setRunIndex([0, sphere.indices.length]),
    );
  }
  if (ineligible) {
    mesh.addPrimitive(
      document
        .createPrimitive()
        .setMode(Primitive.Mode['LINES']!)
        .setAttribute('POSITION', accessor(new Float32Array([0, 0, 0, 1, 0, 0]), 'VEC3')),
    );
    mesh.addPrimitive(
      document
        .createPrimitive()
        .setMode(Primitive.Mode['TRIANGLES']!)
        .setAttribute('POSITION', accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 'VEC3')),
    );
    mesh.addPrimitive(
      document
        .createPrimitive()
        .setAttribute(
          'POSITION',
          document
            .createAccessor()
            .setBuffer(buffer)
            .setType('VEC3')
            .setArray(new Uint16Array([0, 0, 0, 1, 0, 0, 0, 1, 0])),
        )
        .setIndices(accessor(new Uint32Array([0, 1, 2]), 'SCALAR')),
    );
    mesh.addPrimitive(document.createPrimitive().setIndices(accessor(new Uint32Array([0, 1, 2]), 'SCALAR')));
  }
  const scene = document.createScene();
  for (const [index, scale] of nodeScales.entries()) {
    scene.addChild(
      document
        .createNode(`sphere ${String(index)}`)
        .setMesh(mesh)
        .setScale([scale, scale, scale])
        .setExtras({ tauComponentId: `component-${String(index)}` }),
    );
  }
  if (unreferenced) {
    // Shares the drawn sphere's accessors, so replacing the drawn indices must keep them alive.
    document
      .createMesh('unreferenced')
      .addPrimitive(
        document
          .createPrimitive()
          .setAttribute('POSITION', primitive.getAttribute('POSITION'))
          .setIndices(primitive.getIndices()),
      );
  }
  const io = manifold ? new NodeIO().registerExtensions([EXTManifold]) : new NodeIO();
  return io.writeBinary(document);
};

type MeshSummary = {
  name: string;
  triangles: number;
  vertices: number;
  positions: Float32Array;
  indices: Uint32Array;
  hasNormals: boolean;
  manifold: boolean;
};

const readMeshes = async (bytes: Uint8Array<ArrayBuffer>): Promise<MeshSummary[]> => {
  const document = await new NodeIO().registerExtensions([EXTManifold]).readBinary(bytes);
  return document
    .getRoot()
    .listMeshes()
    .map((mesh) => {
      const primitive = mesh.listPrimitives()[0]!;
      const indices = Uint32Array.from(primitive.getIndices()!.getArray()!);
      const positions = primitive.getAttribute('POSITION')!.getArray() as Float32Array;
      return {
        name: mesh.getName(),
        triangles: indices.length / 3,
        vertices: positions.length / 3,
        positions,
        indices,
        hasNormals: primitive.getAttribute('NORMAL')?.getCount() === positions.length / 3,
        manifold: mesh.getExtension(EXTManifold.EXTENSION_NAME) !== null,
      };
    });
};

const vertex = (positions: Float32Array, index: number): Vec3 => [
  positions[index * 3]!,
  positions[index * 3 + 1]!,
  positions[index * 3 + 2]!,
];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (origin: Vec3, direction: Vec3, scale: number): Vec3 => [
  origin[0] + direction[0] * scale,
  origin[1] + direction[1] * scale,
  origin[2] + direction[2] * scale,
];

/** Closest point on a triangle to p (Ericson, Real-Time Collision Detection §5.1.5). */
const closestOnTriangle = (p: Vec3, [a, b, c]: readonly [Vec3, Vec3, Vec3]): Vec3 => {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const ap = subtract(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) {
    return a;
  }
  const bp = subtract(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) {
    return b;
  }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    return along(a, ab, d1 / (d1 - d3));
  }
  const cp = subtract(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) {
    return c;
  }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    return along(a, ac, d2 / (d2 - d6));
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    return along(b, subtract(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
  }
  const denominator = 1 / (va + vb + vc);
  return along(along(a, ab, vb * denominator), ac, vc * denominator);
};

/** Largest distance in millimetres from an original vertex to the simplified surface. */
const maxDeviationMm = (original: Float32Array, simplified: MeshSummary): number => {
  let worst = 0;
  for (let index = 0; index < original.length / 3; index++) {
    const point = vertex(original, index);
    let nearest = Infinity;
    for (let offset = 0; offset < simplified.indices.length; offset += 3) {
      const closest = closestOnTriangle(point, [
        vertex(simplified.positions, simplified.indices[offset]!),
        vertex(simplified.positions, simplified.indices[offset + 1]!),
        vertex(simplified.positions, simplified.indices[offset + 2]!),
      ]);
      const delta = subtract(point, closest);
      nearest = Math.min(nearest, Math.sqrt(dot(delta, delta)));
    }
    worst = Math.max(worst, nearest);
  }
  return worst * 1000;
};

const voxelReport = (triangles: number, vertices: number): TessellationReport => ({
  triangles,
  vertices,
  elapsed: 120,
  voxelSize: 0.5,
  activeVoxels: 1000,
  memoryBytes: 4096,
});

const renderSuccess = (
  content: Uint8Array<ArrayBuffer> | string,
  tessellation?: TessellationReport,
  mimeType = 'model/gltf-binary',
): RenderResult => ({
  success: true,
  data: { mimeType, content, ...(tessellation ? { tessellation } : {}) },
  issues: [],
});

const renderInput = { view: 'model', mimeType: 'model/gltf-binary', options: {} };

describe('displaySimplification', () => {
  const resolve = async (options?: Partial<Options>) =>
    resolveRuntimePluginDefinition('middleware', displaySimplification(options));
  let definition: Awaited<ReturnType<typeof resolve>>;

  beforeAll(async () => {
    definition = await resolve();
  });

  const run = async (result: RenderResult, maxTriangles = 2000) => {
    const runtime = createMockRuntime<Record<string, never>, Options>({ options: { maxTriangles } });
    const handler = vi.fn(async () => result);
    const output = await definition.wrapRender!(renderInput, handler, runtime);
    expect(handler).toHaveBeenCalledWith(renderInput);
    return { output, runtime };
  };

  const issueOf = (result: RenderResult): KernelIssue => {
    expect(result.issues).toHaveLength(1);
    return result.issues[0]!;
  };

  const dataOf = (result: RenderResult) => {
    if (!result.success) {
      throw new Error('Expected a successful render.');
    }
    return result.data;
  };

  it('should default to the 2,000,000-triangle preview budget and a half-voxel bound', async () => {
    expect(displaySimplificationMaxTriangles).toBe(2_000_000);
    expect(displaySimplificationVoxelErrorRatio).toBe(0.5);
    expect(definition.optionsSchema!.parse({})).toEqual({ maxTriangles: 2_000_000 });
    expect(definition.version).toBe('1.1.0');
  });

  it('should leave exports to the kernel, so export and GeoSpec bytes never pass through it', () => {
    expect(definition.wrapExport).toBeUndefined();
    expect(definition.content).toBeUndefined();
  });

  it('should pass a voxel mesh within the budget through byte for byte', async () => {
    const content = await createSphereGlb();
    const result = renderSuccess(content, voxelReport(sphereTriangles, sphereVertices));

    const { output } = await run(result, sphereTriangles);

    expect(output).toBe(result);
    expect(dataOf(output).content).toBe(content);
  });

  it('should simplify an over-budget voxel mesh within half a voxel and report it', async () => {
    const content = await createSphereGlb();
    const report = voxelReport(sphereTriangles, sphereVertices);

    const { output } = await run(renderSuccess(content, report));

    const data = dataOf(output);
    const [simplified] = await readMeshes(data.content as Uint8Array<ArrayBuffer>);
    // The 2,000-triangle budget binds before the error cap, so it stops at the budget.
    expect(simplified!.triangles).toBeLessThanOrEqual(2000);
    expect(simplified!.triangles).toBeGreaterThan(1980);
    expect(simplified!.hasNormals).toBe(true);
    expect(maxDeviationMm(sphere.positions, simplified!)).toBeLessThanOrEqual(0.25);
    expect(data.tessellation).toEqual({
      ...report,
      triangles: simplified!.triangles,
      vertices: simplified!.vertices,
    });
    const issue = issueOf(output);
    expect(issue).toEqual({
      message: expect.stringContaining(
        `The display mesh had ${String(sphereTriangles)} triangles, over the 2000-triangle preview budget`,
      ) as string,
      code: 'DISPLAY_SIMPLIFIED',
      type: 'kernel',
      severity: 'warning',
      details: {
        producer: 'displaySimplification',
        from: sphereTriangles,
        to: simplified!.triangles,
        maxErrorMm: 0.25,
        voxelSize: 0.5,
        budget: 2000,
        elapsed: expect.any(Number) as number,
      },
    });
    expect(issue.message).toContain('within 0.25 mm (half the 0.5 mm voxel size)');
    expect(issue.message).not.toContain('still over');
  });

  it('should keep every vertex it delivers from the original mesh', async () => {
    const { output } = await run(renderSuccess(await createSphereGlb(), voxelReport(sphereTriangles, sphereVertices)));

    const [simplified] = await readMeshes(dataOf(output).content as Uint8Array<ArrayBuffer>);
    const original = new Set<string>();
    for (let index = 0; index < sphereVertices; index++) {
      original.add(vertex(sphere.positions, index).join(','));
    }
    for (let index = 0; index < simplified!.vertices; index++) {
      expect(original.has(vertex(simplified!.positions, index).join(','))).toBe(true);
    }
  });

  it('should keep every crease vertex of a creased mesh exact', async () => {
    const cube = gridCube(0.02, 12);
    const content = await createMeshesGlb([{ geometry: cube, occurrences: 1 }]);
    const triangles = cube.indices.length / 3;

    const { output } = await run(renderSuccess(content, voxelReport(triangles, cube.positions.length / 3)), 10);

    const [simplified] = await readMeshes(dataOf(output).content as Uint8Array<ArrayBuffer>);
    expect(simplified!.triangles).toBeLessThan(triangles / 4);
    const kept = new Set<string>();
    for (let index = 0; index < simplified!.vertices; index++) {
      kept.add(vertex(simplified!.positions, index).join(','));
    }
    const edge = 0.01;
    for (let index = 0; index < cube.positions.length / 3; index++) {
      const point = vertex(cube.positions, index);
      if (point.filter((value) => Math.abs(Math.abs(value) - edge) < 1e-9).length >= 2) {
        expect(kept.has(point.join(','))).toBe(true);
      }
    }
    expect(maxDeviationMm(cube.positions, simplified!)).toBeLessThan(1e-6);
  });

  it('should stop at the budget rather than simplifying down to the error cap', async () => {
    // Flat faces collapse at no error, so only the budget and the locked creases stop the collapse.
    const cube = gridCube(0.02, 24);
    const triangles = cube.indices.length / 3;
    const content = await createMeshesGlb([{ geometry: cube, occurrences: 1 }]);
    const render = async (budget: number) => {
      const { output } = await run(renderSuccess(content, voxelReport(triangles, cube.positions.length / 3)), budget);
      const [mesh] = await readMeshes(dataOf(output).content as Uint8Array<ArrayBuffer>);
      return { output, mesh: mesh! };
    };

    const atBudget = await render(1000);
    const atFloor = await render(4);

    expect(triangles).toBe(6912);
    expect(atBudget.mesh.triangles).toBeLessThanOrEqual(1000);
    expect(atBudget.mesh.triangles).toBeGreaterThan(990);
    expect(atFloor.mesh.triangles).toBeLessThan(700);
    expect(issueOf(atBudget.output).details).toMatchObject({ from: triangles, to: atBudget.mesh.triangles });
    expect(issueOf(atBudget.output).message).not.toContain('still over');
  });

  it('should stop at the error cap when it binds before the budget, and say it is still over', async () => {
    const { output } = await run(
      renderSuccess(await createSphereGlb(), voxelReport(sphereTriangles, sphereVertices)),
      1500,
    );

    const [simplified] = await readMeshes(dataOf(output).content as Uint8Array<ArrayBuffer>);
    // The budget alone would allow 1,500 triangles; the half-voxel cap stops the sphere above it.
    expect(simplified!.triangles).toBeGreaterThan(1500);
    expect(simplified!.triangles).toBeLessThan(sphereTriangles);
    expect(maxDeviationMm(sphere.positions, simplified!)).toBeLessThanOrEqual(0.25);
    expect(issueOf(output).details).toMatchObject({ to: simplified!.triangles, maxErrorMm: 0.25, budget: 1500 });
    expect(issueOf(output).message).toContain('It is still over the budget');
  });

  it('should share the budget among meshes in proportion to the triangles each draws', async () => {
    const fine = gridCube(0.02, 24);
    const coarse = gridCube(0.02, 12);
    const fineTriangles = fine.indices.length / 3;
    const coarseTriangles = coarse.indices.length / 3;
    const drawn = fineTriangles + 2 * coarseTriangles;
    const content = await createMeshesGlb([
      { geometry: fine, occurrences: 1 },
      { geometry: coarse, occurrences: 2 },
    ]);
    const budget = drawn / 4;

    const { output } = await run(
      renderSuccess(content, voxelReport(drawn, fine.positions.length / 3 + (2 * coarse.positions.length) / 3)),
      budget,
    );

    const [fineMesh, coarseMesh] = await readMeshes(dataOf(output).content as Uint8Array<ArrayBuffer>);
    expect([fineTriangles, coarseTriangles, budget]).toEqual([6912, 1728, 2592]);
    // Each mesh keeps a quarter of its triangles, the coarse one per occurrence.
    expect(fineMesh!.triangles).toBeLessThanOrEqual(1728);
    expect(fineMesh!.triangles).toBeGreaterThan(1700);
    expect(coarseMesh!.triangles).toBeLessThanOrEqual(432);
    expect(coarseMesh!.triangles).toBeGreaterThan(420);
    const to = fineMesh!.triangles + 2 * coarseMesh!.triangles;
    expect(dataOf(output).tessellation).toMatchObject({ triangles: to });
    expect(issueOf(output).details).toMatchObject({ from: drawn, to, budget });
    expect(issueOf(output).message).not.toContain('still over');
  });

  it('should leave room in the budget for the triangles it cannot simplify', async () => {
    const content = await createSphereGlb();

    // The report counts 1,000 triangles beyond the sphere, so the sphere's share is 2,800 less those.
    const { output } = await run(renderSuccess(content, voxelReport(sphereTriangles + 1000, sphereVertices)), 2800);

    const [simplified] = await readMeshes(dataOf(output).content as Uint8Array<ArrayBuffer>);
    expect(simplified!.triangles).toBeLessThanOrEqual(1800);
    expect(simplified!.triangles).toBeGreaterThan(1780);
    expect(issueOf(output).details).toMatchObject({ from: sphereTriangles + 1000, to: simplified!.triangles + 1000 });
    expect(issueOf(output).message).not.toContain('still over');
  });

  it('should count every occurrence of an instanced mesh and keep the bound in world units', async () => {
    const content = await createSphereGlb({ nodeScales: [1, 2] });

    const { output } = await run(renderSuccess(content, voxelReport(2 * sphereTriangles, 2 * sphereVertices)));

    const data = dataOf(output);
    const [simplified] = await readMeshes(data.content as Uint8Array<ArrayBuffer>);
    // The doubled occurrence halves the local bound, so its deviation stays within half a voxel.
    expect(2 * maxDeviationMm(sphere.positions, simplified!)).toBeLessThanOrEqual(0.25);
    expect(data.tessellation).toMatchObject({
      triangles: 2 * simplified!.triangles,
      vertices: 2 * simplified!.vertices,
    });
    expect(issueOf(output).details).toMatchObject({ from: 2 * sphereTriangles, to: 2 * simplified!.triangles });
  });

  it('should leave lines, non-indexed triangles, manifold-annotated and undrawn meshes exact', async () => {
    const content = await createSphereGlb({ ineligible: true, unreferenced: true });

    const { output } = await run(renderSuccess(content, voxelReport(sphereTriangles + 1, sphereVertices + 5)));

    const document = await new NodeIO().readBinary(dataOf(output).content as Uint8Array<ArrayBuffer>);
    const [drawn, undrawn] = document.getRoot().listMeshes();
    const [surface, lines, loose, integer, empty] = drawn!.listPrimitives();
    expect(surface!.getIndices()!.getCount()).toBeLessThan(sphere.indices.length);
    expect(lines!.getAttribute('POSITION')!.getCount()).toBe(2);
    expect(loose!.getAttribute('POSITION')!.getCount()).toBe(3);
    expect(integer!.getIndices()!.getCount()).toBe(3);
    expect(empty!.getIndices()!.getCount()).toBe(3);
    expect(undrawn!.listPrimitives()[0]!.getIndices()!.getArray()).toEqual(sphere.indices);

    const manifold = await createSphereGlb({ manifold: true });
    const manifoldResult = await run(renderSuccess(manifold, voxelReport(sphereTriangles, sphereVertices)));
    const manifoldData = dataOf(manifoldResult.output);
    expect(manifoldData.content).toBe(manifold);
    expect(manifoldData.tessellation).toMatchObject({ triangles: sphereTriangles, vertices: sphereVertices });
    expect(issueOf(manifoldResult.output).details).toMatchObject({ from: sphereTriangles, to: sphereTriangles });
  });

  it('should not simplify an over-budget voxel mesh whose voxel size is unknown, and say so', async () => {
    const content = await createSphereGlb();
    const { voxelSize: _unknown, ...report } = voxelReport(sphereTriangles, sphereVertices);
    const result = renderSuccess(content, report);

    const { output, runtime } = await run(result);

    const data = dataOf(output);
    expect(data.content).toBe(content);
    expect(data.tessellation).toBe(report);
    expect(issueOf(output)).toEqual({
      message: expect.stringContaining('was not simplified because the render did not report its voxel size') as string,
      code: 'RESOURCE_LIMIT',
      type: 'kernel',
      severity: 'warning',
      details: {
        producer: 'displaySimplification',
        triangles: sphereTriangles,
        budget: 2000,
        reason: 'voxelSize-unknown',
      },
    });
    expect(runtime.logger.warn).toHaveBeenCalledOnce();
  });

  it.each([
    ['a non-voxel kernel', renderSuccess(new Uint8Array(4), { triangles: 5000, vertices: 2500, elapsed: 3 })],
    ['a render without a tessellation report', renderSuccess(new Uint8Array(4))],
    ['a non-GLB artifact', renderSuccess('<svg/>', voxelReport(5000, 2500), 'image/svg+xml')],
    ['GLB text content', renderSuccess('glTF', voxelReport(5000, 2500))],
    ['a failed render', createErrorResult()],
  ])('should pass %s through untouched', async (_name, result) => {
    const { output, runtime } = await run(result);

    expect(output).toBe(result);
    expect(runtime.logger.warn).not.toHaveBeenCalled();
  });
});
