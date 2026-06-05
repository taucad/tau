import { describe, expect, it } from 'vitest';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import type { GeoSpecNativeMeshAnalyzer } from '#mesh/native.js';
import type { GeometrySubject, MeshTriangle } from '#mesh/types.js';

const triangle = (options: { primitive: string; index: number; x: number; color?: string }): MeshTriangle => ({
  primitive: options.primitive,
  triangleIndex: options.index,
  a: [options.x, 0, 0],
  b: [options.x + 1, 0, 0],
  c: [options.x, 1, 0],
  center: [options.x + 1 / 3, 1 / 3, 0],
  area: 0.5,
});

const subjectFromTriangles = (triangles: MeshTriangle[]): GeometrySubject => ({
  kind: 'geometry-subject',
  mesh: {
    format: 'mesh-buffer',
    stats: {
      vertexCount: triangles.length * 3,
      meshCount: 1,
      triangleCount: triangles.length,
      connectedComponents: () => 1,
      analyseConnectedComponents: () => ({ count: 1, clusters: [], gaps: [] }),
      watertight: true,
      analyseWatertight: () => ({
        watertight: true,
        irregularEdges: 0,
        openBoundaryEdges: 0,
        totalEdges: 0,
        irregularEdgeFraction: 0,
        perPrimitive: [],
      }),
      boundingBox: {
        size: [2, 1, 0],
        center: [1, 0.5, 0],
        primitives: [...new Set(triangles.map((entry) => entry.primitive))].map((name) => ({
          name,
          color: name === 'sun#0' ? '#ffcc00' : '#224466',
          vertices: 3,
          aabb: { min: [0, 0, 0], max: [1, 1, 0] },
        })),
      },
      meshQuality: {
        triangleCount: triangles.length,
        nonFiniteVertices: [],
        degenerateTriangles: [],
        duplicateFaces: [],
        triangles,
        surfaceArea: triangles.length * 0.5,
        signedVolume: 1,
        centerOfMass: [0, 0, 0],
      },
    },
  },
  provenance: {
    source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'assembly' },
    unit: 'mm',
    loader: 'in-memory',
    parameters: { stage: 'test' },
  },
  capabilities: [{ kind: 'mesh', feature: 'component-overlap' }],
  diagnostics: [],
});

const namedSubject = (): GeometrySubject =>
  subjectFromTriangles([
    triangle({ primitive: 'sun#0', index: 0, x: 0 }),
    triangle({ primitive: 'ring#0', index: 1, x: 4 }),
  ]);

const connectedSubject = (): GeometrySubject =>
  subjectFromTriangles([
    triangle({ primitive: 'Shape_0#0', index: 0, x: 0 }),
    triangle({ primitive: 'Shape_0#0', index: 1, x: 4 }),
  ]);

describe('analyzeMeshOverlap', () => {
  it('should report no overlaps from native named-component evidence', async () => {
    const seen: Array<{ componentIds: number[]; componentLabels: string[] }> = [];
    const nativeAnalyzer: GeoSpecNativeMeshAnalyzer = {
      analyzeMeshOverlap(options) {
        seen.push({
          componentIds: [...options.componentIds],
          componentLabels: options.components.map((component) => component.label),
        });
        return {
          success: true,
          componentCount: 2,
          checkedPairs: 1,
          overlaps: [],
        };
      },
    };

    const result = await analyzeMeshOverlap({ subject: namedSubject(), tolerance: 0.25, nativeAnalyzer });

    expect(result).toMatchObject({
      success: true,
      evidence: {
        componentSource: 'named',
        componentCount: 2,
        checkedPairs: 1,
        tolerance: 0.25,
        overlaps: [],
      },
    });
    expect(seen).toEqual([{ componentIds: [0, 1], componentLabels: ['sun#0', 'ring#0'] }]);
  });

  it('should enrich native overlap pairs with labels and color evidence', async () => {
    const nativeAnalyzer: GeoSpecNativeMeshAnalyzer = {
      analyzeMeshOverlap() {
        return {
          success: true,
          componentCount: 2,
          checkedPairs: 1,
          overlaps: [
            {
              leftComponentId: 0,
              rightComponentId: 1,
              intersectionVolume: 12.5,
              witnessPoint: [1, 2, 3],
            },
          ],
        };
      },
    };

    const result = await analyzeMeshOverlap({ subject: namedSubject(), nativeAnalyzer });

    expect(result).toMatchObject({
      success: true,
      evidence: {
        overlaps: [
          {
            leftLabel: 'sun#0',
            rightLabel: 'ring#0',
            leftColor: '#ffcc00',
            rightColor: '#224466',
            intersectionVolume: 12.5,
            witnessPoint: [1, 2, 3],
            penetration: 'positive-volume',
          },
        ],
      },
    });
  });

  it('should use connected component ids only when named partitioning is unavailable', async () => {
    const nativeAnalyzer: GeoSpecNativeMeshAnalyzer = {
      analyzeMeshOverlap(options) {
        return {
          success: true,
          componentCount: options.components.length,
          checkedPairs: 1,
          overlaps: [],
        };
      },
    };

    const result = await analyzeMeshOverlap({ subject: connectedSubject(), nativeAnalyzer });

    expect(result).toMatchObject({
      success: true,
      evidence: {
        componentSource: 'connected',
        componentCount: 2,
      },
    });
  });

  it('should report inconclusive diagnostics when component identity is unavailable', async () => {
    const result = await analyzeMeshOverlap({
      subject: subjectFromTriangles([triangle({ primitive: 'single#0', index: 0, x: 0 })]),
      nativeAnalyzer: {
        analyzeMeshOverlap() {
          throw new Error('native analyzer should not run when partitioning is inconclusive');
        },
      },
    });

    expect(result).toMatchObject({
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_COMPONENT_PARTITION_INCONCLUSIVE',
          severity: 'error',
          details: {
            primitiveCount: 1,
            source: { kind: 'mesh-buffer', format: 'mesh-buffer', name: 'assembly' },
            parameters: { stage: 'test' },
          },
        },
      ],
    });
  });

  it('should fail explicitly instead of using a JavaScript overlap fallback when native analysis is unavailable', async () => {
    const result = await analyzeMeshOverlap({ subject: namedSubject(), nativeAnalyzer: {} });

    expect(result).toEqual({
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_NATIVE_OVERLAP_UNAVAILABLE',
          severity: 'error',
          message: 'Component-overlap analysis requires the native GeoSpec OpenCascade mesh analyzer.',
          suggestion:
            'Use the bundled geospec/native/opencascade/single build or pass a GeoSpec native analyzer that implements analyzeMeshOverlap.',
        },
      ],
    });
  });

  it('should surface native analyzer failures without producing a pass verdict', async () => {
    const result = await analyzeMeshOverlap({
      subject: namedSubject(),
      nativeAnalyzer: {
        analyzeMeshOverlap() {
          return {
            success: false,
            componentCount: 2,
            checkedPairs: 1,
            overlaps: [],
            diagnostics: [{ code: 'NATIVE_SOLID_INVALID', message: 'component 1 is not closed' }],
          };
        },
      },
    });

    expect(result).toMatchObject({
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_COMPONENT_OVERLAP_ANALYSIS_FAILED',
          details: {
            nativeDiagnostics: [{ code: 'NATIVE_SOLID_INVALID', message: 'component 1 is not closed' }],
          },
        },
      ],
    });
  });
});
