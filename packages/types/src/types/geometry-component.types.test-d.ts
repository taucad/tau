import { describe, expectTypeOf, it } from 'vitest';
import type {
  GeometryComponentAppearance,
  GeometryComponentManifest,
  GeometryComponentNode,
  GeometryComponentReference,
  ScreenshotOptions,
} from '@taucad/types';

const duplicateDurableIdField = `persistent${'Id'}` as const;
const duplicateDurableKeyField = `persistent${'Key'}` as const;

describe('geometry component shared contracts', () => {
  it('should type geometry component references as stable tau-cad selectors', () => {
    const reference = {
      scheme: 'tau-cad',
      filePath: 'src/main.ts',
      componentId: 'component:gearbox_housing',
      selector: 'node/0',
      geometryHash: 'abc123',
      label: 'gearbox_housing',
      kind: 'part',
    } satisfies GeometryComponentReference;

    expectTypeOf(reference.scheme).toEqualTypeOf<'tau-cad'>();
    expectTypeOf(reference.kind).toEqualTypeOf<'part'>();
    expectTypeOf<GeometryComponentReference>().not.toHaveProperty(duplicateDurableIdField);
    expectTypeOf<GeometryComponentReference>().not.toHaveProperty(duplicateDurableKeyField);
  });

  it('should type manifests as serializable component records', () => {
    const manifest = {
      schemaVersion: 1,
      sourceFile: 'src/main.ts',
      geometryHash: 'hash',
      rootId: 'root',
      nodeOrder: ['root'],
      extensionUsed: 'TAU_cad_topology',
      capabilities: {
        canHide: true,
        canIsolate: true,
        canFocus: true,
        canAdjustOpacity: true,
        hasDrawings: false,
        hasPreciseTopology: false,
        exports: [{ fidelity: 'mesh', formats: ['glb', 'stl'], available: true }],
      },
      nodesById: {
        root: {
          id: 'root',
          name: 'Model',
          kind: 'model',
          selector: 'root',
          childIds: [],
          depth: 0,
          path: ['Model'],
          meshNodeIndices: [],
          primitiveIndices: [],
          materialIndices: [],
          appearance: {
            color: '#ff0000',
            colors: ['#ff0000', '#0000ff'],
            materialNames: ['red paint', 'blue paint'],
          },
          capabilities: {
            canHide: true,
            canIsolate: true,
            canFocus: true,
            canAdjustOpacity: true,
            hasDrawings: false,
            hasPreciseTopology: false,
            exports: [{ fidelity: 'mesh', formats: ['glb'], available: true }],
          },
        },
      },
    } satisfies GeometryComponentManifest;

    expectTypeOf(manifest.nodesById.root.kind).toEqualTypeOf<'model'>();
    expectTypeOf<GeometryComponentManifest['nodesById'][string]['appearance']>().toEqualTypeOf<
      GeometryComponentAppearance | undefined
    >();
    expectTypeOf(manifest.capabilities.exports[0]!.fidelity).toEqualTypeOf<'mesh'>();
    expectTypeOf<GeometryComponentNode>().not.toHaveProperty(duplicateDurableIdField);
    expectTypeOf<GeometryComponentNode>().not.toHaveProperty(duplicateDurableKeyField);
  });

  it('should type screenshot options for scene-wide capture settings', () => {
    const options = {
      aspectRatio: 1,
      maxResolution: 800,
      zoomLevel: 1.2,
      cameraAngles: [{ label: 'front', phi: 90, theta: 270 }],
      output: {
        format: 'image/webp',
        quality: 0.9,
        isPreview: true,
      },
    } satisfies ScreenshotOptions;

    expectTypeOf(options.cameraAngles[0]!.label).toEqualTypeOf<string>();
    expectTypeOf(options.output.format).toEqualTypeOf<'image/webp'>();
    expectTypeOf<ScreenshotOptions>().not.toHaveProperty('target');
    expectTypeOf<ScreenshotOptions>().not.toHaveProperty('camera');
    expectTypeOf<ScreenshotOptions>().not.toHaveProperty('display');
  });
});
