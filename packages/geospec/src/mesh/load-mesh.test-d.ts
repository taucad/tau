import { expectTypeOf, it } from 'vitest';
import type { createGeoSpec } from '#index.js';
import type {
  analyzeMesh,
  AnalyzeMeshOptions,
  AnalyzeMeshResult,
  GeometryStats,
  GeometrySubject,
  LoadMeshOptions,
} from '#mesh/index.js';

it('accepts source or retained subject exclusively on every public facade', () => {
  expectTypeOf<LoadMeshOptions>().toExtend<AnalyzeMeshOptions>();
  expectTypeOf<{ subject: GeometrySubject }>().toExtend<AnalyzeMeshOptions>();
  expectTypeOf<Parameters<typeof analyzeMesh>[0]>().toEqualTypeOf<AnalyzeMeshOptions>();
  expectTypeOf<ReturnType<typeof analyzeMesh>>().toEqualTypeOf<Promise<AnalyzeMeshResult>>();
  expectTypeOf<ReturnType<typeof createGeoSpec>['analyzeMesh']>().toEqualTypeOf<typeof analyzeMesh>();
  expectTypeOf<{ subject: GeometrySubject; source: string }>().not.toExtend<AnalyzeMeshOptions>();
  expectTypeOf<{ subject: GeometrySubject; unit: 'mm' }>().not.toExtend<AnalyzeMeshOptions>();
  expectTypeOf<{ subject: GeometrySubject; format: 'glb' }>().not.toExtend<AnalyzeMeshOptions>();
  expectTypeOf<Record<string, never>>().not.toExtend<AnalyzeMeshOptions>();
  expectTypeOf<GeometrySubject['mesh']['stats']>().toEqualTypeOf<
    Pick<GeometryStats, 'meshCount' | 'vertexCount' | 'triangleCount'>
  >();
  expectTypeOf<GeometrySubject['mesh']['stats']>().not.toHaveProperty('meshQuality');
  expectTypeOf<GeometryStats>().not.toHaveProperty('analyseWatertight');
  expectTypeOf<GeometryStats>().not.toHaveProperty('analyseConnectedComponents');
});
