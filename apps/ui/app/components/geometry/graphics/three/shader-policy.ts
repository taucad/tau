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
    risks: ['camera', 'depth', 'clipping', 'upstream-drift'],
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
    risks: ['camera', 'depth', 'lifecycle', 'hot-path', 'upstream-drift'],
  },
  {
    id: 'webgpu-post',
    modules: ['#components/geometry/graphics/three/post-processing-webgpu.tsx'],
    authoring: ['tsl', 'render-pipeline'],
    backends: ['webgpu'],
    risks: ['camera', 'depth', 'lifecycle', 'hot-path'],
  },
  {
    id: 'model-emphasis-silhouette',
    modules: [
      '#components/geometry/graphics/three/materials/model-emphasis-silhouette.material.ts',
      '#components/geometry/graphics/three/materials/model-emphasis-silhouette.node.ts',
    ],
    backends: ['webgl', 'webgpu'],
    risks: ['transparency', 'depth', 'lifecycle', 'hot-path'],
  },
  {
    id: 'metal-morph-loader',
    modules: [
      '#components/geometry/loader/metal-morph-material.node.ts',
      // The bloom and capture pipelines both loaders draw through; registered once, under the first site.
      '#components/geometry/loader/showcase-post.ts',
    ],
    authoring: ['tsl', 'render-pipeline'],
    backends: ['webgl', 'webgpu'],
    risks: ['custom-position', 'transparency', 'lifecycle', 'hot-path'],
  },
  {
    id: 'glass-prism-loader',
    modules: ['#components/geometry/loader/glass-prism-material.node.ts'],
    authoring: ['tsl', 'render-pipeline'],
    backends: ['webgl', 'webgpu'],
    risks: ['custom-position', 'transparency', 'lifecycle', 'hot-path'],
  },
] as const;

const graphicsBackendEndToEnd = 'apps/ui-e2e/src/graphics-backend.spec.ts';
const metalMorphLoaderEndToEnd = 'apps/ui-e2e/src/metal-morph-loader.spec.ts';
const glassPrismLoaderEndToEnd = 'apps/ui-e2e/src/glass-prism-loader.spec.ts';
const metalMorphLoaderRoot = 'apps/ui/app/components/geometry/loader';
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
    'apps/ui/app/components/geometry/graphics/three/materials/gltf-surface-depth-bias.test.ts::also separates orthographic surfaces when the renderer writes fragment depth',
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
  'webgl-post': {
    ...evidence(
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgl.test.tsx',
      'restores the selected composer depth directly to canvas',
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should guard the dependency implementation whose owned wrappers it disposes',
    ),
    reference: [
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgl.test.tsx::restores the selected composer depth directly to canvas',
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should pass the actual log-depth convention to the half-resolution shader',
      'apps/ui/app/components/geometry/graphics/three/post-processing.test.tsx::should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum',
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgl.test.tsx::should compose display AO after tone mapping and bypass tone mapping for the raw AO diagnostic',
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should copy AO color without rejecting pixels against a reused composer depth attachment',
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should distinguish opacity-aware tone-map blending from the installed default that ignores opacity',
    ],
    lifecycle: [
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should dispose all owned fullscreen materials and preserve borrowed depth',
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should stop transparent scene replays when all visible parts become opaque',
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should release half-resolution materials without disposing shared fullscreen geometry on a toggle',
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgl.test.tsx::updates AO diagnostics and tone mapping on the retained production composers',
      'apps/ui/app/components/geometry/graphics/three/canvas-three-gl.test.ts::should restore both retained cameras to forward depth before a WebGL canvas starts',
      'apps/ui/app/components/geometry/graphics/three/three-canvas-instance.test.tsx::should restore both retained camera depth conventions when AO is disabled',
    ],
    'structural-perf': [
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgl.test.tsx::bypasses AO execution while retaining the same tone-mapping composer',
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should route the native AO copy without texture feedback when needsSwap=',
      'apps/ui/app/components/geometry/graphics/three/n8ao-pass.test.ts::should restart native composer frames at the MSAA geometry target after an in-place post chain',
    ],
  },
  'webgpu-post': {
    ...evidence(
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx',
      'restores the selected scene-pass depth with one direct fullscreen draw',
    ),
    reference: [
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx::should tone-map once before display AO and encode the raw AO diagnostic without exposure',
      'apps/ui/app/components/geometry/graphics/three/post-processing.test.tsx::should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum',
    ],
    lifecycle: [
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx::disposes both endpoint resources once on unmount',
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx::updates AO output and estimator uniforms without rebuilding the production graph',
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx::restores MRT and target when synchronous scene prewarm throws',
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx::keeps beauty ahead of AO dependencies and preserves its alpha in the AO visualization',
      'apps/ui/app/components/geometry/graphics/three/canvas-three-gl.test.ts::should configure both native camera projections before the first WebGPU scene pass',
    ],
    'structural-perf': [
      'apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx::bypasses GTAO through a retained beauty-only graph sharing the same scene pass',
    ],
  },
  'model-emphasis-silhouette': evidence(
    'apps/ui/app/components/geometry/graphics/three/materials/model-emphasis-silhouette.test.ts',
    'draws the outline only where mask coverage changes',
    'apps/ui/app/components/geometry/graphics/three/materials/model-emphasis-silhouette.test.ts::matches stable stripped silhouette node material JSON snapshot',
  ),
  'metal-morph-loader': {
    reference: [
      `${metalMorphLoaderRoot}/metal-morph-shapes.test.ts::should measure a cube face at its inradius and a corner at its circumradius`,
      `${metalMorphLoaderRoot}/metal-morph-shapes.test.ts::should fillet an edge over a band that scales with the temperature`,
      `${metalMorphLoaderRoot}/metal-morph-sequence.test.ts::should move the front monotonically from source to target during a morph`,
    ],
    'generated-source': [
      `${metalMorphLoaderRoot}/metal-morph-material.node.test.ts::matches stable stripped physical node material snapshot`,
      `${metalMorphLoaderEndToEnd}::compiles the liquid metal body through Three`,
    ],
    'real-compile': [`${metalMorphLoaderEndToEnd}::compiles the liquid metal body through Three`],
    pixels: [`${metalMorphLoaderEndToEnd}::renders a chrome body with highlights and dark facets through`],
    'depth-clipping': [
      `${metalMorphLoaderEndToEnd}::keeps the transparent canvas clear outside the body silhouette through`,
    ],
    'backend-differential': [`${metalMorphLoaderEndToEnd}::renders the same resting silhouette on both backends`],
    lifecycle: [
      `${metalMorphLoaderRoot}/metal-morph-loader.test.tsx::should forward theme and speed to the controller and dispose it on unmount`,
      `${metalMorphLoaderRoot}/metal-morph-material.node.test.ts::should animate through uniform mutation without rebuilding the graph`,
    ],
    'structural-perf': [
      `${metalMorphLoaderEndToEnd}::renders one body of 40,962 vertices with the bloom chain enabled`,
    ],
    'gpu-whole-frame': [`${metalMorphLoaderEndToEnd}::sustains the loop under a bounded frame interval`],
  },
  'glass-prism-loader': {
    reference: [
      `${metalMorphLoaderRoot}/glass-prism-light-field.test.ts::should spread a spectrum through a prism with violet deviated furthest`,
      `${metalMorphLoaderRoot}/glass-prism-light-field.test.ts::should turn a beam by a right angle through total internal reflection`,
      `${metalMorphLoaderRoot}/glass-prism-shapes.test.ts::should cut a three-cornered section from the resting prism`,
    ],
    'generated-source': [
      `${metalMorphLoaderRoot}/glass-prism-material.node.test.ts::matches stable stripped glass node material snapshot`,
      `${glassPrismLoaderEndToEnd}::compiles the glass body through Three`,
    ],
    'real-compile': [`${glassPrismLoaderEndToEnd}::compiles the glass body through Three`],
    pixels: [`${glassPrismLoaderEndToEnd}::renders a glass body and a spectrum through`],
    'depth-clipping': [
      `${glassPrismLoaderEndToEnd}::keeps the transparent canvas clear outside the light sheet through`,
    ],
    'backend-differential': [`${glassPrismLoaderEndToEnd}::renders the same resting glass on both backends`],
    lifecycle: [
      `${metalMorphLoaderRoot}/glass-prism-loader.test.tsx::should forward theme and speed to the controller and dispose it on unmount`,
      `${metalMorphLoaderRoot}/glass-prism-material.node.test.ts::should animate through uniform mutation without rebuilding the graph`,
    ],
    'structural-perf': [`${glassPrismLoaderEndToEnd}::renders one body of 10,242 vertices with the light sheet traced`],
    'gpu-whole-frame': [`${glassPrismLoaderEndToEnd}::sustains the loop under a bounded frame interval`],
  },
} as const;
