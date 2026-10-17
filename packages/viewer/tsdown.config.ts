import { bundlePattern, workspace } from '@taucad/nx';
import { assembleBundledDeclarations } from '@taucad/nx/bundled-declarations';
import { defineConfig } from 'tsdown';
import type { UserConfig } from 'tsdown';

/**
 * Worker modules that `new Worker(new URL(…, import.meta.url))` sites load. They are build entries but not exports:
 * consumers reach them only through the client modules that construct them.
 */
const workerEntries = [
  'src/graphics/three/utils/measurement-features.worker.ts',
  'src/graphics/three/utils/section-surface-topology.worker.ts',
  'src/graphics/three/workers/bvh.worker.ts',
];

/** Matches a worker URL literal that names a `.worker.ts` source module. */
const workerSourceUrlPattern = /(new URL\(\s*(["'])[^"']+\.worker)\.ts\2/g;

/**
 * Rewrites worker URL literals from the `.ts` source name, which Vite resolves when `apps/ui` consumes `src`, to the
 * `.mjs` file this build emits beside the client module, so the published `dist` constructs workers that exist.
 */
const workerUrlPlugin = {
  name: 'viewer-worker-urls',
  transform: {
    filter: { code: /\.worker\.ts["']/ },
    handler: (code: string) => ({ code: code.replaceAll(workerSourceUrlPattern, '$1.mjs$2') }),
  },
};

const baseConfig: UserConfig = {
  entry: [
    'src/cad/cad-viewer.tsx',
    'src/cad/fit-view-control.tsx',
    'src/cad/fullscreen-view-control.tsx',
    'src/cad/grid-control.tsx',
    'src/cad/kernel-settings.tsx',
    'src/cad/material-swatch.tsx',
    'src/cad/measure-control.tsx',
    'src/cad/measure-tool-row.tsx',
    'src/cad/part-preview-image.tsx',
    'src/cad/part-properties-panel.tsx',
    'src/cad/part-quantities.ts',
    'src/cad/part-thumbnail-state.ts',
    'src/cad/section-tool-row.tsx',
    'src/cad/section-view-control.tsx',
    'src/cad/viewer-controls.tsx',
    'src/cad/viewer-settings.tsx',
    'src/constants/length-units.ts',
    'src/environment/viewer-environment.tsx',
    'src/graphics/graphics-backend.ts',
    'src/graphics/graphics-settings.ts',
    'src/graphics/metadata/geometry-component-reference.ts',
    'src/graphics/metadata/gltf-component-manifest.ts',
    'src/graphics/metadata/gltf-component-visibility.ts',
    'src/graphics/section-cuts.ts',
    'src/graphics/three/canvas-three-gl.ts',
    'src/graphics/three/controls/section-handles.ts',
    'src/graphics/three/controls/tau-camera-controls.tsx',
    'src/graphics/three/controls/viewport-gizmo-interaction-lock.tsx',
    'src/graphics/three/gltf-world.ts',
    'src/graphics/three/materials/infinite-grid-material.ts',
    'src/graphics/three/materials/infinite-grid-material.node.ts',
    'src/graphics/three/post-processing-settings.ts',
    'src/graphics/three/react/exact-measurement.tsx',
    'src/graphics/three/react/gltf-mesh.tsx',
    'src/graphics/three/render-frame-timing.ts',
    'src/graphics/three/render-loop-observer.ts',
    'src/graphics/three/renderer.ts',
    'src/graphics/three/scene-overlay.tsx',
    'src/graphics/three/stage-options.ts',
    'src/graphics/three/stage.tsx',
    'src/graphics/three/three-canvas-instance.tsx',
    'src/graphics/three/three-context.tsx',
    'src/graphics/three/three-graphics-backend-context.tsx',
    'src/graphics/three/use-camera-framing.ts',
    'src/graphics/three/utils/camera-controls-adapter.ts',
    'src/graphics/three/utils/geometry-presentation-admission.ts',
    'src/graphics/three/utils/infinite-grid-frame.ts',
    'src/graphics/three/utils/lights.utils.ts',
    'src/graphics/three/utils/model-component-owner.ts',
    'src/graphics/three/utils/render-order.utils.ts',
    'src/graphics/three/utils/scene-tags.ts',
    'src/graphics/three/utils/section-cap-overlap.ts',
    'src/graphics/three/utils/section-cap-overlap-debug.ts',
    'src/graphics/three/utils/section-cap-performance-debug.ts',
    'src/graphics/three/utils/section-cap-polygon-boolean-backend.ts',
    'src/graphics/three/utils/section-cap-polygon-boolean-clipper2-ts.ts',
    'src/graphics/three/utils/section-cap-polygon-boolean-clipper2-wasm.ts',
    'src/graphics/three/utils/section-cap-polygon-types.ts',
    'src/graphics/three/utils/section-cap-region.ts',
    'src/graphics/three/utils/section-cap-render-parts.ts',
    'src/graphics/three/utils/section-cap-stencil-debug.ts',
    'src/graphics/three/utils/three-shader-debug.ts',
    'src/graphics/three/utils/tsl-node-graph-snapshot.ts',
    'src/hooks/use-graphics.tsx',
    'src/hooks/use-viewer-shortcuts.ts',
    'src/hooks/use-webgl-context-tracker.tsx',
    'src/lib/renderer-telemetry.ts',
    'src/machines/graphics.machine.ts',
    'src/machines/kinematics.machine.ts',
    'src/machines/model-interaction.machine.ts',
    'src/model-viewer.tsx',
    'src/parameters/parameter-edit.ts',
    'src/parameters/parameter-group-card.tsx',
    'src/parameters/parameter-select.tsx',
    'src/panels/structure-section.tsx',
    'src/parameters/parameters.tsx',
    'src/parameters/parameters-boolean.tsx',
    'src/parameters/parameters-number.tsx',
    'src/parameters/parameters-number-field.tsx',
    'src/parameters/rjsf-context.ts',
    'src/parameters/rjsf-field-path.tsx',
    'src/parameters/rjsf-theme.tsx',
    'src/parameters/rjsf-utils.ts',
    'src/parameters/rjsf-validator.ts',
    'src/services/graphics-camera-registry.ts',
    'src/utils/inspect-glb.ts',
    ...workerEntries,
  ],
  sourcemap: false,
  clean: true,
  dts: { eager: true },
  minify: true,
  plugins: [workerUrlPlugin],
  hooks: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- tsdown's hook API uses colon-delimited names.
    'build:done': async ({ options }) => assembleBundledDeclarations(process.cwd(), options.outDir, 'viewer'),
  },
  tsconfig: 'tsconfig.build.json',
  unbundle: true,
};

export default defineConfig(async () => {
  const pattern = bundlePattern(await workspace(), 'viewer');
  return {
    ...baseConfig,
    format: 'esm',
    outDir: 'dist',
    deps: { alwaysBundle: [pattern], dts: { neverBundle: [pattern] } },
  } satisfies UserConfig;
});
