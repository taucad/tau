/**
 * Route fidelity is framework-derived. Transcoder edges declare only `from` and `to`; a transcoded route is
 * `'brep'` only when both formats are exact B-rep formats, otherwise `'mesh'`.
 *
 * The snapshot table records every distinct direct and transcoded route the UI, CLI and converter runtimes
 * advertised at tau `65c29d13`, before edges lost `fidelity`, with the value each route carried then.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { FileExtension } from '@taucad/types';
import type { TranscoderDefinition, TranscoderEdge } from '#types/runtime-transcoder.types.js';
import { attachRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';
/* oxlint-disable no-restricted-imports, import/extensions -- Runtime-private white-box fixture stays outside the package build graph. */
import { MockKernelWorker, createMockFileSystem } from '../../test/support/kernel-worker.fixture.js';
/* oxlint-enable no-restricted-imports, import/extensions */

type RouteRow = readonly [
  transcoderId: string | undefined,
  sourceFormat: string,
  targetFormat: string,
  'brep' | 'mesh',
];

/** Distinct (transcoder, source, target, fidelity) routes of the UI, CLI and converter runtimes at `65c29d13`. */
const productionRoutes: readonly RouteRow[] = [
  [undefined, '3mf', '3mf', 'mesh'],
  [undefined, 'csv', 'csv', 'mesh'],
  [undefined, 'glb', 'glb', 'mesh'],
  [undefined, 'gltf', 'gltf', 'mesh'],
  [undefined, 'json', 'json', 'mesh'],
  [undefined, 'step', 'step', 'brep'],
  [undefined, 'stl', 'stl', 'mesh'],
  [undefined, 'txt', 'txt', 'mesh'],
  [undefined, 'vdb', 'vdb', 'mesh'],
  ['assimp', 'glb', '3mf', 'mesh'],
  ['assimp', 'glb', 'dae', 'mesh'],
  ['assimp', 'glb', 'fbx', 'mesh'],
  ['assimp', 'glb', 'obj', 'mesh'],
  ['assimp', 'glb', 'ply', 'mesh'],
  ['assimp', 'glb', 'step', 'mesh'],
  ['assimp', 'glb', 'stl', 'mesh'],
  ['assimp', 'glb', 'usda', 'mesh'],
  ['assimp', 'glb', 'usdc', 'mesh'],
  ['assimp', 'glb', 'usdz', 'mesh'],
  ['assimp', 'gltf', '3mf', 'mesh'],
  ['assimp', 'gltf', 'dae', 'mesh'],
  ['assimp', 'gltf', 'fbx', 'mesh'],
  ['assimp', 'gltf', 'obj', 'mesh'],
  ['assimp', 'gltf', 'ply', 'mesh'],
  ['assimp', 'gltf', 'step', 'mesh'],
  ['assimp', 'gltf', 'stl', 'mesh'],
  ['assimp', 'gltf', 'usda', 'mesh'],
  ['assimp', 'gltf', 'usdc', 'mesh'],
  ['assimp', 'gltf', 'usdz', 'mesh'],
  ['gltf', 'glb', 'glb', 'mesh'],
  ['gltf', 'glb', 'gltf', 'mesh'],
  ['gltf', 'gltf', 'glb', 'mesh'],
  ['gltf', 'gltf', 'gltf', 'mesh'],
  ['image', 'glb', 'jpeg', 'mesh'],
  ['image', 'glb', 'png', 'mesh'],
  ['image', 'glb', 'webp', 'mesh'],
  ['slicer', 'glb', 'gcode.3mf', 'mesh'],
];

const createTranscoderPlugin = (id: string, edges: TranscoderEdge[]) =>
  attachRuntimePluginDefinition(
    { id },
    () =>
      ({
        name: id,
        version: '1.0.0',
        edges,
        initialize: vi.fn().mockResolvedValue({}),
        transcode: vi.fn<TranscoderDefinition['transcode']>(),
      }) satisfies TranscoderDefinition,
  );

/** Build the manifest of a worker whose kernel exports `formats` and whose transcoders declare `edges`. */
const buildRoutes = async (formats: readonly string[], edges: ReadonlyArray<readonly [string, TranscoderEdge]>) => {
  const transcoderIds = [...new Set(edges.map(([id]) => id))];
  const worker = new MockKernelWorker({
    middleware: [],
    onLog: vi.fn(),
    filesystem: createMockFileSystem(),
    exportZodSchemas: Object.fromEntries(formats.map((format) => [format, z.object({})])) as Partial<
      Record<FileExtension, z.ZodType>
    >,
    transcoders: transcoderIds.map((id) =>
      createTranscoderPlugin(
        id,
        edges.filter(([owner]) => owner === id).map(([, edge]) => edge),
      ),
    ),
  });
  await worker.initialize({ callbacks: { onLog: vi.fn() }, transferables: {}, options: {} });
  return worker.capabilitiesManifest.routes;
};

describe('transcoded route fidelity', () => {
  it.each([
    { from: 'step', to: 'iges', fidelity: 'brep' },
    { from: 'glb', to: 'step', fidelity: 'mesh' },
    { from: 'step', to: 'stl', fidelity: 'mesh' },
  ] as const)('derives $fidelity for a $from → $to edge', async ({ from, to, fidelity }) => {
    const routes = await buildRoutes([from], [['converter', { from, to }]]);

    expect(routes.find((route) => route.transcoderId === 'converter')).toMatchObject({
      sourceFormat: from,
      targetFormat: to,
      fidelity,
    });
  });

  it('keeps the fidelity of every production route recorded before edges lost fidelity', async () => {
    const formats = [...new Set(productionRoutes.map(([, sourceFormat]) => sourceFormat))];
    const edges = productionRoutes.flatMap(([transcoderId, from, to]) =>
      transcoderId === undefined ? [] : [[transcoderId, { from, to }] as const],
    );

    const routes = await buildRoutes(formats, edges);

    const observed = routes.map(
      (route): RouteRow => [route.transcoderId, route.sourceFormat, route.targetFormat, route.fidelity],
    );
    expect(observed).toEqual(expect.arrayContaining([...productionRoutes]));
    expect(observed).toHaveLength(productionRoutes.length);
  });
});
