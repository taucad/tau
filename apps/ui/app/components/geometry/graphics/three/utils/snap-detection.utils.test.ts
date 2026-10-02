// @vitest-environment node
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { describe, expect, it, vi } from 'vitest';
import {
  detectSnapPoints,
  findClosestSnapPoint,
} from '#components/geometry/graphics/three/utils/snap-detection.utils.js';
import {
  getMeshMeasurementFeatures,
  getLineMeasurementFeatures,
  measureFeature,
  measureTargetPair,
  findMeasurementTargets,
  nearestProjectedSegment,
} from '#components/geometry/graphics/three/utils/measurement-features.js';
import type { SnapPoint } from '#components/geometry/graphics/three/utils/snap-detection.utils.js';
import type {
  MeasurementTarget,
  MeshFeatureGraph,
} from '#components/geometry/graphics/three/utils/measurement-features.js';

const intersection = (mesh: THREE.Mesh): THREE.Intersection<THREE.Mesh> => ({
  distance: 0,
  face: { a: 0, b: 1, c: 2, materialIndex: 0, normal: new THREE.Vector3(0, 0, 1) },
  faceIndex: 0,
  object: mesh,
  point: new THREE.Vector3(),
});

const camera = (): THREE.OrthographicCamera => {
  const result = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 10);
  result.position.z = 2;
  result.lookAt(0, 0, 0);
  result.updateMatrixWorld(true);
  result.updateProjectionMatrix();
  return result;
};
const canvasDetails = {
  width: 1000,
  height: 1000,
  clientWidth: 1000,
  clientHeight: 1000,
} satisfies Partial<HTMLCanvasElement>;
const canvas = canvasDetails as HTMLCanvasElement;

describe('mesh measurement features', () => {
  it('should reuse analysis until an attribute revision changes', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const first = getMeshMeasurementFeatures(mesh);
    const firstId = findMeasurementTargets(first, {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(0.1, 0),
      snapDistancePx: 10,
    })[0]?.id;
    expect(getMeshMeasurementFeatures(mesh)).toBe(first);
    mesh.geometry.getAttribute('position').needsUpdate = true;
    const updated = getMeshMeasurementFeatures(mesh);
    expect(updated).not.toBe(first);
    expect(
      findMeasurementTargets(updated, {
        mesh,
        camera: camera(),
        canvas,
        mousePos: new THREE.Vector2(0.1, 0),
        snapDistancePx: 10,
      })[0]?.id,
    ).not.toBe(firstId);
    expect(first.features.filter((feature) => feature.kind === 'edge')).toHaveLength(4);
    const sameSize = mesh.geometry.getAttribute('position').clone();
    mesh.geometry.setAttribute('position', sameSize);
    expect(getMeshMeasurementFeatures(mesh)).not.toBe(updated);
    expect(
      getMeshMeasurementFeatures(new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 16, 16))).features.filter(
        (feature) => feature.kind === 'edge',
      ),
    ).toHaveLength(4);
  });

  it('should fit each circular loop independently and preserve polygon boundary snaps', () => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 32));
    const initial = getMeshMeasurementFeatures(mesh).features.filter((feature) => feature.kind === 'circle');
    expect(initial).toHaveLength(1);
    expect(initial[0]?.kind).toBe('circle');
    if (initial[0]?.kind === 'circle') {
      expect(initial[0].radius).toBeCloseTo(1, 5);
      expect(initial[0].maxResidual).toBeLessThan(1e-5);
      expect(initial[0].rmsResidual).toBeLessThan(1e-5);
      expect(initial[0].angularCoverage).toBeCloseTo(2 * Math.PI, 4);
    }
    mesh.scale.setScalar(2);
    const center = findMeasurementTargets(getMeshMeasurementFeatures(mesh), {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(),
      snapDistancePx: 10,
      filter: 'circle',
    }).find((target) => target.kind === 'center')!;
    const radiusResult = measureFeature(center, mesh).find((result) => result.operation === 'radius');
    expect(radiusResult?.value).toBeCloseTo(2);
    if (initial[0]?.kind === 'circle') {
      expect(radiusResult?.fit?.maxResidual).toBeCloseTo(initial[0].maxResidual * 2);
    }
    mesh.scale.setScalar(1);
    const index = mesh.geometry.getIndex()!;
    const a = index.getX(0);
    const b = index.getX(1);
    const c = index.getX(2);
    index.setX(0, b);
    index.setX(1, c);
    index.setX(2, a);
    index.needsUpdate = true;
    const rotated = getMeshMeasurementFeatures(mesh).features.filter((feature) => feature.kind === 'circle');
    expect(rotated).toHaveLength(1);
    if (rotated[0]?.kind === 'circle') {
      expect(rotated[0].radius).toBeCloseTo(1, 5);
    }

    const polygon = new THREE.Mesh(new THREE.CircleGeometry(10, 12));
    const snaps = detectSnapPoints(polygon, intersection(polygon));
    const boundaries = snaps.filter((point) => point.type === 'edge-midpoint');
    expect(boundaries.length).toBeGreaterThan(4);
    const polygonVertices = Array.from({ length: 12 }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(polygon.geometry.getAttribute('position'), i + 1),
    );
    for (const point of boundaries) {
      const distance = Math.min(
        ...polygonVertices.map((a, i) =>
          new THREE.Line3(a, polygonVertices[(i + 1) % 12])
            .closestPointToPoint(point.position, true, new THREE.Vector3())
            .distanceTo(point.position),
        ),
      );
      expect(distance).toBeLessThan(1e-5);
    }
  });

  it('should compute an area centroid with an offset hole and identify a derived void centroid', () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(10, 0);
    shape.lineTo(10, 10);
    shape.lineTo(0, 10);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(1, 4);
    hole.lineTo(4, 4);
    hole.lineTo(4, 6);
    hole.lineTo(1, 6);
    hole.closePath();
    shape.holes.push(hole);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape));
    const graph = getMeshMeasurementFeatures(mesh);
    const face = graph.features.find((feature) => feature.kind === 'face');
    expect(face).toMatchObject({ kind: 'face', centroidOnSurface: true });
    if (face?.kind === 'face') {
      expect(face.centroid.x).toBeCloseTo((100 * 5 - 6 * 2.5) / 94);
    }
    expect(graph.features.filter((feature) => feature.kind === 'edge')).toHaveLength(8);

    const centered = new THREE.Shape();
    centered.moveTo(0, 0);
    centered.lineTo(10, 0);
    centered.lineTo(10, 10);
    centered.lineTo(0, 10);
    centered.closePath();
    const centeredHole = new THREE.Path();
    centeredHole.moveTo(4, 4);
    centeredHole.lineTo(6, 4);
    centeredHole.lineTo(6, 6);
    centeredHole.lineTo(4, 6);
    centeredHole.closePath();
    centered.holes.push(centeredHole);
    const voidFace = getMeshMeasurementFeatures(new THREE.Mesh(new THREE.ShapeGeometry(centered))).features.find(
      (feature) => feature.kind === 'face',
    );
    expect(voidFace).toMatchObject({ centroidOnSurface: false });
  });

  it('should keep disconnected parts as separate bodies', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0], 3),
    );
    const graph = getMeshMeasurementFeatures(new THREE.Mesh(geometry));
    expect(graph.features.filter((feature) => feature.kind === 'body')).toHaveLength(2);
  });

  it('should measure body extents in a selected orthonormal frame', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6));
    mesh.rotation.z = Math.PI / 2;
    mesh.updateMatrixWorld(true);
    const body = findMeasurementTargets(getMeshMeasurementFeatures(mesh), {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(),
      snapDistancePx: 10,
      filter: 'body',
      surfaceHit: new THREE.Vector3(0, 0, 3),
      faceIndex: 0,
    }).find((target) => target.kind === 'body')!;
    const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
      new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld, 0).normalize(),
      new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld, 1).normalize(),
      new THREE.Vector3().setFromMatrixColumn(mesh.matrixWorld, 2).normalize(),
    ];
    const extents = measureFeature(body, mesh, axes);
    expect(extents[0]?.value).toBeCloseTo(2);
    expect(extents[1]?.value).toBeCloseTo(4);
    expect(extents[2]?.value).toBeCloseTo(6);
    for (const result of extents) {
      expect(result.witnesses[0]!.distanceTo(result.witnesses[1]!)).toBeCloseTo(result.value);
    }
  });

  it('should retain two separately fitted annulus loops and a centroid outside material', () => {
    const graph = getMeshMeasurementFeatures(new THREE.Mesh(new THREE.RingGeometry(1, 2, 32)));
    const circles = graph.features.filter((feature) => feature.kind === 'circle');
    expect(circles).toHaveLength(2);
    const radii = circles.map((feature) => feature.radius).sort((a, b) => a - b);
    expect(radii[0]).toBeCloseTo(1, 3);
    expect(radii[1]).toBeCloseTo(2, 3);
    expect(circles.map((feature) => feature.loopRole).sort()).toEqual(['hole', 'outer']);
    expect(graph.features.find((feature) => feature.kind === 'face')).toMatchObject({ centroidOnSurface: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(1, 2, 32));
    const centerTargets = findMeasurementTargets(getMeshMeasurementFeatures(mesh), {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(),
      snapDistancePx: 10,
      filter: 'circle',
      isKept: (point) => point.length() > 0.5,
    });
    expect(centerTargets.some((target) => target.kind === 'center')).toBe(true);
  });

  it('should ignore degenerate triangles without creating an origin feature', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([2, 2, 2, 2, 2, 2, 2, 2, 2], 3));
    expect(getMeshMeasurementFeatures(new THREE.Mesh(geometry)).features).toEqual([]);
  });

  it('should suppress smooth tessellation patches without losing a surface point', () => {
    const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 500, 24));
    const graph = getMeshMeasurementFeatures(mesh);
    expect(graph.features.length).toBeLessThan(10);
    expect(graph.features.filter((feature) => feature.kind === 'body')).toHaveLength(1);
  });

  it('should preserve a CAD face group and its occurrence in a picked target', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    mesh.userData['measurementFeatures'] = {
      occurrenceId: 'part-a',
      componentId: 'part-a',
      kind: 'surface',
      faces: [{ id: 'face:7', start: 0, count: 6 }],
    };
    const graph = getMeshMeasurementFeatures(mesh);
    const targets = findMeasurementTargets(graph, {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(),
      snapDistancePx: 10,
      surfaceHit: new THREE.Vector3(),
      faceIndex: 0,
      filter: 'face',
    });
    expect(targets[0]).toMatchObject({ featureId: 'topology:part-a:face:7', occurrenceId: 'part-a', kind: 'face' });
  });

  it('should prefer a nearby feature over the zero-distance surface fallback', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const targets = findMeasurementTargets(getMeshMeasurementFeatures(mesh), {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(0.09, 0),
      snapDistancePx: 10,
      surfaceHit: new THREE.Vector3(0.9, 0, 0),
      faceIndex: 0,
    });
    expect(['edge', 'midpoint', 'endpoint']).toContain(targets[0]?.kind);
    expect(targets.some((target) => target.kind === 'surface')).toBe(false);
    const pointTargets = findMeasurementTargets(getMeshMeasurementFeatures(mesh), {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(0.09, 0),
      snapDistancePx: 10,
      surfaceHit: new THREE.Vector3(0.9, 0, 0),
      faceIndex: 0,
      filter: 'point',
    });
    expect(pointTargets[0]?.kind).not.toBe('surface');
  });

  it('should bound hover occlusion checks and keep a visible surface fallback', () => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const graph = getMeshMeasurementFeatures(mesh);
    const edge = graph.features.find((feature) => feature.kind === 'edge');
    if (!edge) {
      throw new Error('Expected a mesh edge');
    }
    const crowded = {
      ...graph,
      features: Array.from({ length: 64 }, (_, index) => ({ ...edge, id: `edge:${index}` })),
    };
    const hidden = vi.fn(() => false);
    expect(
      findMeasurementTargets(crowded, {
        mesh,
        camera: camera(),
        canvas,
        mousePos: new THREE.Vector2(),
        snapDistancePx: 1000,
        filter: 'edge',
        isVisible: hidden,
      }),
    ).toEqual([]);
    expect(hidden.mock.calls.length).toBe(32);

    const visibleSurface = vi.fn((_position: THREE.Vector3, _feature: unknown, kind: string) => kind === 'surface');
    const targets = findMeasurementTargets(graph, {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(0.09, 0),
      snapDistancePx: 10,
      surfaceHit: new THREE.Vector3(0.9, 0, 0),
      faceIndex: 0,
      isVisible: visibleSurface,
    });
    expect(targets[0]?.kind).toBe('surface');
    expect(visibleSurface.mock.calls.length).toBeLessThanOrEqual(32);
  });

  it('should read indexed source edges and invalidate changed index identity or version', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 2, 0], 3));
    geometry.setIndex([0, 2]);
    const line = new THREE.LineSegments(geometry);
    line.userData['measurementFeatures'] = { kind: 'line', edges: [{ id: 'edge', start: 0, count: 2 }] };
    const points = (graph: MeshFeatureGraph): number[][] => {
      const edge = graph.features[0];
      if (edge?.kind !== 'edge') {
        throw new Error('Expected indexed edge');
      }
      return edge.points.map((point) => point.toArray());
    };
    const first = getLineMeasurementFeatures(line);
    expect(points(first)).toEqual([
      [0, 0, 0],
      [0, 2, 0],
    ]);
    expect(getLineMeasurementFeatures(line)).toBe(first);
    geometry.index!.setX(1, 1);
    geometry.index!.needsUpdate = true;
    const changed = getLineMeasurementFeatures(line);
    expect(changed).not.toBe(first);
    expect(points(changed)).toEqual([
      [0, 0, 0],
      [1, 0, 0],
    ]);
    geometry.setIndex([2, 0]);
    expect(points(getLineMeasurementFeatures(line))).toEqual([
      [0, 2, 0],
      [0, 0, 0],
    ]);
    geometry.setIndex([0, 9]);
    expect(getLineMeasurementFeatures(line).features).toEqual([]);
    geometry.dispose();
    if (Array.isArray(line.material)) {
      for (const material of line.material) {
        material.dispose();
      }
    } else {
      line.material.dispose();
    }
  });

  it('should reconstruct a grouped CAD edge from fat-line source segments', () => {
    const geometry = new LineSegmentsGeometry().setPositions([0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0]);
    const line = new LineSegments2(geometry);
    line.userData['measurementFeatures'] = {
      occurrenceId: 'part-a',
      componentId: 'part-a',
      kind: 'line',
      edges: [{ id: 'edge:9', start: 0, count: 4 }],
    };
    const graph = getLineMeasurementFeatures(line);
    expect(graph.features).toMatchObject([{ id: 'topology:part-a:edge:9:0', length: 2 }]);
    expect(getLineMeasurementFeatures(line)).toBe(graph);
    const targets = findMeasurementTargets(graph, {
      mesh: line,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(),
      snapDistancePx: 100,
    });
    expect(
      targets.some((target) => target.occurrenceId === 'part-a' && target.featureId === 'topology:part-a:edge:9:0'),
    ).toBe(true);
  });

  it('accepts a face when visible and kept supports are different triangles', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 20, 0, 0, 21, 0, 0, 20, 1, 0], 3),
    );
    const mesh = new THREE.Mesh(geometry);
    const id = 'topology:face';
    const graph: MeshFeatureGraph = {
      geometry,
      revision: 'test',
      features: [
        {
          id,
          kind: 'face',
          evidence: 'mesh',
          normal: new THREE.Vector3(0, 0, 1),
          planar: true,
          centroid: new THREE.Vector3(),
          centroidOnSurface: false,
          area: 1,
          triangleIndices: [0, 1],
          loopIds: [],
        },
      ],
      triangleRegion: [0, 0],
      triangleBody: [0, 0],
      triangleFeatureId: [id, id],
    };
    const targets = findMeasurementTargets(graph, {
      mesh,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(),
      snapDistancePx: 100,
      filter: 'face',
      isKept: (point) => point.x > 10,
    });
    expect(targets.some((target) => target.featureId === id && target.kind === 'centroid')).toBe(true);
  });

  it('should measure a bounded edge distance and world-space angle', () => {
    const meshA = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const meshB = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    meshB.position.x = 4;
    meshB.rotation.z = Math.PI / 2;
    const pick = (mesh: THREE.Mesh, id?: string) =>
      findMeasurementTargets(getMeshMeasurementFeatures(mesh), {
        mesh,
        camera: camera(),
        canvas,
        mousePos: new THREE.Vector2(0, 0),
        snapDistancePx: 1000,
        filter: 'edge',
        maxResults: 100,
      }).find(
        (target) =>
          target.kind === 'edge' &&
          target.feature.kind === 'edge' &&
          (id ? target.featureId === id : target.feature.points[0]!.y === target.feature.points.at(-1)!.y),
      )!;
    const a = pick(meshA);
    const b = pick(meshB, a.featureId);
    expect(measureFeature(a, meshA)[0]?.value).toBeCloseTo(2);
    const pair = measureTargetPair(a, b);
    const minimum = pair.find((result) => result.operation === 'minimum-distance');
    expect(minimum?.value).toBeCloseTo(minimum!.witnesses[0]!.distanceTo(minimum!.witnesses[1]!));
    expect(pair.find((result) => result.operation === 'angle')?.value).toBeCloseTo(Math.PI / 2);
  });

  it('should distinguish finite face distance from supporting plane spacing and respect holes', () => {
    const first = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    const second = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    second.position.x = 5;
    const pick = (mesh: THREE.Mesh, hit: THREE.Vector3) =>
      findMeasurementTargets(getMeshMeasurementFeatures(mesh), {
        mesh,
        camera: camera(),
        canvas,
        mousePos: new THREE.Vector2(),
        snapDistancePx: 10,
        surfaceHit: hit,
        faceIndex: 0,
        filter: 'face',
      }).find((target) => target.kind === 'face')!;
    const pair = measureTargetPair(pick(first, new THREE.Vector3()), pick(second, new THREE.Vector3(5, 0, 0)));
    expect(pair.find((result) => result.operation === 'minimum-distance')?.value).toBeCloseTo(3);
    expect(pair.find((result) => result.operation === 'plane-spacing')?.value).toBeCloseTo(0);
    const body = findMeasurementTargets(getMeshMeasurementFeatures(second), {
      mesh: second,
      camera: camera(),
      canvas,
      mousePos: new THREE.Vector2(),
      snapDistancePx: 10,
      surfaceHit: new THREE.Vector3(5, 0, 0),
      faceIndex: 0,
      filter: 'body',
    }).find((target) => target.kind === 'body')!;
    expect(
      measureTargetPair(pick(first, new THREE.Vector3()), body).some(
        (result) => result.operation === 'minimum-distance',
      ),
    ).toBe(false);

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(10, 0);
    shape.lineTo(10, 10);
    shape.lineTo(0, 10);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(4, 4);
    hole.lineTo(6, 4);
    hole.lineTo(6, 6);
    hole.lineTo(4, 6);
    hole.closePath();
    shape.holes.push(hole);
    const washer = new THREE.Mesh(new THREE.ShapeGeometry(shape));
    const face = pick(washer, new THREE.Vector3(1, 1, 0));
    const point: MeasurementTarget = {
      ...face,
      kind: 'surface',
      position: new THREE.Vector3(5, 5, 0),
      feature: getMeshMeasurementFeatures(washer).features.find((feature) => feature.kind === 'body')!,
    };
    expect(measureTargetPair(face, point).find((result) => result.operation === 'minimum-distance')?.value).toBeCloseTo(
      1,
    );
  });
});

describe('screen aperture', () => {
  it('should reject points behind the camera and use CSS pixels', () => {
    const near: SnapPoint = { position: new THREE.Vector3(0.02, 0, 0), type: 'vertex' };
    const behind: SnapPoint = { position: new THREE.Vector3(0, 0, 3), type: 'vertex' };
    expect(
      findClosestSnapPoint([behind, near], {
        camera: camera(),
        canvas,
        mousePos: new THREE.Vector2(0, 0),
        snapDistancePx: 12,
      }),
    ).toBe(near);
  });

  it('should clip a perspective segment at the near plane and recover a world witness', () => {
    const perspective = new THREE.PerspectiveCamera(90, 1, 0.1, 10);
    perspective.updateMatrixWorld(true);
    perspective.updateProjectionMatrix();
    const a = new THREE.Vector3(-0.02, 0, -0.05);
    const b = new THREE.Vector3(0.2, 0, -2);
    const clip = nearestProjectedSegment(a, b, perspective.projectionMatrix, new THREE.Vector2(-0.14, 0), 1000, 1000);
    expect(clip).toBeDefined();
    expect(clip!.point.z).toBeLessThanOrEqual(-0.1);
    expect(clip!.distance).toBeLessThan(10);
  });
});
