/**
 * Test-only inventory of Tau-owned shader and render-pass sites. Production code must not import this module.
 */
export const shaderRiskCapabilities = {
  camera: ['reference', 'pixels', 'backend-differential'],
  'spatial-frame': ['reference', 'pixels', 'backend-differential'],
  derivatives: ['reference', 'generated-source', 'pixels', 'backend-differential'],
  transparency: ['reference', 'pixels', 'depth-clipping'],
  depth: ['reference', 'real-compile', 'pixels', 'backend-differential', 'depth-clipping'],
  clipping: ['real-compile', 'pixels', 'depth-clipping'],
  'custom-position': ['reference', 'generated-source', 'pixels'],
  lifecycle: ['lifecycle'],
  'hot-path': ['structural-perf', 'gpu-whole-frame'],
  'private-api': ['generated-source', 'real-compile'],
  'upstream-drift': ['generated-source'],
} as const;

export const shaderSites = [
  {
    id: 'infinite-grid',
    modules: [
      '#components/geometry/graphics/three/materials/infinite-grid-material.ts',
      '#components/geometry/graphics/three/materials/infinite-grid-material.node.ts',
    ],
    authoring: ['glsl', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'spatial-frame', 'derivatives', 'transparency', 'depth', 'lifecycle', 'hot-path'],
  },
  {
    id: 'scene-overlay',
    modules: ['#components/geometry/graphics/three/scene-overlay.tsx'],
    authoring: ['render-pass'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'depth', 'clipping', 'lifecycle', 'hot-path'],
  },
  {
    id: 'section-stripes',
    modules: [
      '#components/geometry/graphics/three/materials/striped-material.ts',
      '#components/geometry/graphics/three/materials/striped-material.node.ts',
    ],
    authoring: ['glsl', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['derivatives', 'depth', 'clipping', 'lifecycle'],
  },
  {
    id: 'surface-depth-bias',
    modules: ['#components/geometry/graphics/three/materials/gltf-surface-depth-bias.ts'],
    authoring: ['on-before-compile', 'fixed-function'],
    backends: ['webgl', 'webgpu'],
    risks: ['depth', 'clipping', 'upstream-drift'],
  },
  {
    id: 'fat-lines',
    modules: ['#components/geometry/graphics/three/materials/line2.material.ts'],
    authoring: ['tsl', 'upstream-fork'],
    backends: ['webgpu'],
    risks: ['camera', 'transparency', 'depth', 'clipping', 'hot-path', 'private-api', 'upstream-drift'],
  },
  {
    id: 'morphing-points',
    modules: [
      '#components/geometry/splash/morphing-points-material.ts',
      '#components/geometry/splash/morphing-points-material.node.ts',
    ],
    authoring: ['glsl', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'transparency', 'custom-position', 'lifecycle', 'hot-path'],
  },
  {
    id: 'webgl-post',
    modules: ['#components/geometry/graphics/three/post-processing-webgl.tsx'],
    authoring: ['glsl', 'render-pass'],
    backends: ['webgl'],
    risks: ['camera', 'depth', 'lifecycle', 'hot-path'],
  },
  {
    id: 'webgpu-post',
    modules: ['#components/geometry/graphics/three/post-processing-webgpu.tsx'],
    authoring: ['tsl', 'render-pipeline'],
    backends: ['webgpu'],
    risks: ['camera', 'depth', 'lifecycle', 'hot-path'],
  },
] as const;

const graphicsBackendEndToEnd = 'apps/ui-e2e/src/graphics-backend.spec.ts';
const generatedShaderEndToEnd = 'apps/ui-e2e/src/shader-fixture.spec.ts';
const evidence = (unit: string, semantic: string, generatedSource = `${unit}::${semantic}`) => ({
  reference: [`${unit}::${semantic}`],
  'generated-source': [
    generatedSource,
    `${generatedShaderEndToEnd}::compiles and renders the infinite grid through Three`,
  ],
  'real-compile': [`${graphicsBackendEndToEnd}::no WebGPU validation errors emit during a Birdhouse preview render`],
  pixels: [`${graphicsBackendEndToEnd}::canvas pixel histogram detects`],
  'backend-differential': [`${graphicsBackendEndToEnd}::render-frame rebase and rescale are pixel-invariant`],
  'depth-clipping': [`${graphicsBackendEndToEnd}::keeps nearby rear GLTF edges occluded behind the front slab`],
  lifecycle: [`${unit}::${semantic}`],
  'structural-perf': [`${unit}::${semantic}`],
  'gpu-whole-frame': [`${graphicsBackendEndToEnd}::post-processing keeps one live render owner`],
});

/** Evidence names are checked against real test source by shader-policy.test.ts. */
export const shaderEvidence = {
  'infinite-grid': {
    ...evidence(
      'apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.test.ts',
      'fades radially before the camera-sized proxy boundary',
      'apps/ui/app/components/geometry/graphics/three/materials/infinite-grid-material.node.test.ts::matches stable stripped material JSON snapshot',
    ),
    pixels: [`${graphicsBackendEndToEnd}::framed GLTF keeps the complete radial grid fade for`],
    'depth-clipping': [
      `${graphicsBackendEndToEnd}::framed GLTF keeps the complete radial grid fade for`,
      `${graphicsBackendEndToEnd}::keeps nearby rear GLTF edges occluded behind the front slab`,
    ],
  },
  'scene-overlay': evidence(
    'apps/ui/app/components/geometry/graphics/three/scene-overlay.test.tsx',
    'renders only the overlay scene once',
  ),
  'section-stripes': evidence(
    'apps/ui/app/components/geometry/graphics/three/materials/striped-material-vertex-colored.test.ts',
    'keeps a shared material pinned',
    'apps/ui/app/components/geometry/graphics/three/materials/striped-material-vertex-colored.test.ts::stable stripped vertex-colored WebGPU node material graph',
  ),
  'surface-depth-bias': evidence(
    'apps/ui/app/components/geometry/graphics/three/materials/gltf-surface-depth-bias.test.ts',
    'fails compilation when the expected log-depth chunk is absent or duplicated',
    'apps/ui/app/components/geometry/graphics/three/materials/gltf-surface-depth-bias.test.ts::pushes opaque WebGL triangles locally in logarithmic depth',
  ),
  'fat-lines': evidence(
    'apps/ui/app/components/geometry/graphics/three/materials/line2.material.test.ts',
    'fails deterministically when the exact Three revision',
    'apps/ui/app/components/geometry/graphics/three/materials/line2.material.test.ts::matches stable stripped WebGPU line2 node material JSON snapshot',
  ),
  'morphing-points': evidence(
    'apps/ui/app/components/geometry/splash/morphing-points-semantics.test.ts',
    'starts exactly at source, ends at target',
    'apps/ui/app/components/geometry/splash/morphing-points-material.node.test.ts::matches stable stripped points node material snapshot',
  ),
  'webgl-post': evidence(
    'apps/ui/app/components/geometry/graphics/three/post-processing-webgl.test.tsx',
    'restores the selected composer depth directly to canvas',
  ),
  'webgpu-post': evidence(
    'apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx',
    'restores the selected scene-pass depth with one direct fullscreen draw',
  ),
} as const;
