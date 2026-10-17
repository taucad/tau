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
    id: 'gltf-edge-occurrences',
    modules: ['packages/viewer/src/graphics/three/utils/gltf-edge-batches.ts'],
    authoring: ['on-before-compile', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['custom-position', 'depth', 'clipping', 'lifecycle', 'hot-path', 'upstream-drift'],
  },
  {
    id: 'filament-beads',
    modules: [
      'apps/ui/app/components/printer/printer-filament-material.ts',
      'apps/ui/app/components/printer/printer-filament-material.node.ts',
    ],
    authoring: ['on-before-compile', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['custom-position', 'depth', 'lifecycle', 'hot-path', 'upstream-drift'],
  },
  {
    id: 'infinite-grid',
    modules: [
      'packages/viewer/src/graphics/three/materials/infinite-grid-material.ts',
      'packages/viewer/src/graphics/three/materials/infinite-grid-material.node.ts',
    ],
    authoring: ['glsl', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'spatial-frame', 'derivatives', 'transparency', 'depth', 'lifecycle', 'hot-path'],
  },
  {
    id: 'scene-overlay',
    modules: ['packages/viewer/src/graphics/three/scene-overlay.tsx'],
    authoring: ['render-pass'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'depth', 'clipping', 'lifecycle', 'hot-path'],
  },
  {
    id: 'section-stripes',
    modules: [
      'packages/viewer/src/graphics/three/materials/striped-material.ts',
      'packages/viewer/src/graphics/three/materials/striped-material.node.ts',
    ],
    authoring: ['glsl', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['derivatives', 'depth', 'clipping', 'lifecycle'],
  },
  {
    id: 'surface-depth-bias',
    modules: ['packages/viewer/src/graphics/three/materials/gltf-surface-depth-bias.ts'],
    authoring: ['on-before-compile', 'fixed-function'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'depth', 'clipping', 'upstream-drift'],
  },
  {
    id: 'section-clip',
    modules: ['packages/viewer/src/graphics/three/materials/section-clip.ts'],
    authoring: ['on-before-compile', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'spatial-frame', 'clipping', 'lifecycle', 'hot-path', 'upstream-drift'],
  },
  {
    id: 'fat-lines',
    modules: ['packages/viewer/src/graphics/three/materials/line2.material.ts'],
    authoring: ['tsl', 'upstream-fork'],
    backends: ['webgpu'],
    risks: ['camera', 'transparency', 'depth', 'clipping', 'hot-path', 'private-api', 'upstream-drift'],
  },
  {
    id: 'morphing-points',
    modules: [
      'apps/ui/app/components/geometry/splash/morphing-points-material.ts',
      'apps/ui/app/components/geometry/splash/morphing-points-material.node.ts',
    ],
    authoring: ['glsl', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'transparency', 'custom-position', 'lifecycle', 'hot-path'],
  },
  {
    id: 'webgl-post',
    modules: ['packages/viewer/src/graphics/three/post-processing-webgl.tsx'],
    authoring: ['glsl', 'render-pass'],
    backends: ['webgl'],
    risks: ['camera', 'depth', 'lifecycle', 'hot-path', 'upstream-drift'],
  },
  {
    id: 'webgpu-post',
    modules: ['packages/viewer/src/graphics/three/post-processing-webgpu.tsx'],
    authoring: ['tsl', 'render-pipeline'],
    backends: ['webgpu'],
    risks: ['camera', 'depth', 'lifecycle', 'hot-path'],
  },
  {
    id: 'model-emphasis-silhouette',
    modules: [
      'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.material.ts',
      'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.node.ts',
    ],
    backends: ['webgl', 'webgpu'],
    risks: ['transparency', 'depth', 'lifecycle', 'hot-path'],
  },
  {
    id: 'model-pick',
    modules: [
      'packages/viewer/src/graphics/three/materials/model-pick.material.ts',
      'packages/viewer/src/graphics/three/materials/model-pick.node.ts',
    ],
    authoring: ['glsl', 'tsl', 'render-pass'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'depth', 'clipping', 'lifecycle'],
  },
  {
    id: 'metal-morph-loader',
    modules: [
      'apps/ui/app/components/geometry/loader/metal-morph-material.node.ts',
      // The bloom and capture pipelines both loaders draw through; registered once, under the first site.
      'apps/ui/app/components/geometry/loader/showcase-post.ts',
    ],
    authoring: ['tsl', 'render-pipeline'],
    backends: ['webgl', 'webgpu'],
    risks: ['custom-position', 'transparency', 'lifecycle', 'hot-path'],
  },
  {
    id: 'glass-prism-loader',
    modules: ['apps/ui/app/components/geometry/loader/glass-prism-material.node.ts'],
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
const sectionClipUnit = 'packages/viewer/src/graphics/three/materials/section-clip.test.ts';
const sectionClippingGroupUnit = 'packages/viewer/src/graphics/three/react/section-clipping-group.test.tsx';
const sectionClipBrowser = 'packages/viewer/src/graphics/three/materials/section-clip.browser.test.ts';
const gltfMeshLifecycleUnit = 'packages/viewer/src/graphics/three/react/gltf-mesh.camera-lifecycle.test.tsx';
const modelPickBrowser = 'packages/viewer/src/graphics/three/utils/model-gpu-pick.browser.test.ts';
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
  'gltf-edge-occurrences': {
    'backend-differential': [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should preserve pixels and release actual occurrence buffers through material changes',
    ],
    reference: [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.test.ts::should reject malformed prototypes and out-of-capacity placements',
    ],
    'generated-source': [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.test.ts::should retain the stripped occurrence endpoint graph',
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should preserve pixels and release actual occurrence buffers through material changes',
    ],
    'real-compile': [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should preserve pixels and release actual occurrence buffers through material changes',
    ],
    pixels: [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should preserve pixels and release actual occurrence buffers through material changes',
    ],
    'depth-clipping': [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should preserve pixels and release actual occurrence buffers through material changes',
    ],
    lifecycle: [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should retain canonical identity and finite line cohorts across appearance and pose events',
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should preserve pixels and release actual occurrence buffers through material changes',
    ],
    'structural-perf': [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should preserve pixels and release actual occurrence buffers through material changes',
    ],
    'gpu-whole-frame': [
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should preserve pixels and release actual occurrence buffers through material changes',
    ],
  },
  'filament-beads': {
    reference: [
      'apps/ui/app/components/printer/printer-filament-material.test.ts::should retain exact bead extents and bounded joins',
    ],
    'generated-source': [
      'apps/ui/app/components/printer/printer-filament-material.test.ts::should match the stable stripped filament node graph',
      'apps/ui/app/components/printer/printer-filament-material.test.ts::should guard generated shader anchors',
    ],
    'real-compile': [
      'apps/ui/app/components/printer/printer-viewer.browser.test.tsx::should compile filament with negative controls and measure dense whole frames',
    ],
    pixels: ['apps/ui/app/components/printer/printer-viewer.browser.test.tsx::frames the print wide'],
    'backend-differential': [
      'apps/ui/app/components/printer/printer-viewer.browser.test.tsx::grain and translucent hardware with WebGPU',
    ],
    'depth-clipping': ['apps/ui/app/components/printer/printer-viewer.browser.test.tsx::shades the plate from below'],
    lifecycle: ['apps/ui/app/components/printer/printer-toolpath.test.ts::should use one shared capped profile'],
    'structural-perf': [
      'apps/ui/app/components/printer/printer-toolpath.test.ts::should use one shared capped profile',
    ],
    'gpu-whole-frame': [
      'apps/ui/app/components/printer/printer-viewer.browser.test.tsx::should compile filament with negative controls and measure dense whole frames',
    ],
  },
  'infinite-grid': {
    ...evidence(
      'packages/viewer/src/graphics/three/materials/infinite-grid-material.test.ts',
      'fades radially before the camera-sized proxy boundary',
      'packages/viewer/src/graphics/three/materials/infinite-grid-material.node.test.ts::matches stable stripped material JSON snapshot',
    ),
    pixels: [`${graphicsBackendEndToEnd}::framed GLTF keeps the complete radial grid fade for`],
    'depth-clipping': [
      `${graphicsBackendEndToEnd}::framed GLTF keeps the complete radial grid fade for`,
      `${graphicsBackendEndToEnd}::keeps nearby rear GLTF edges occluded behind the front slab`,
    ],
  },
  'scene-overlay': evidence(
    'packages/viewer/src/graphics/three/scene-overlay.test.tsx',
    'renders only the overlay scene once',
  ),
  'section-stripes': evidence(
    'packages/viewer/src/graphics/three/materials/striped-material-vertex-colored.test.ts',
    'keeps a shared material pinned',
    'packages/viewer/src/graphics/three/materials/striped-material-vertex-colored.test.ts::stable stripped vertex-colored WebGPU node material graph',
  ),
  'surface-depth-bias': evidence(
    'packages/viewer/src/graphics/three/materials/gltf-surface-depth-bias.test.ts',
    'fails compilation when the expected log-depth chunk is absent or duplicated',
    'packages/viewer/src/graphics/three/materials/gltf-surface-depth-bias.test.ts::also separates orthographic surfaces when the renderer writes fragment depth',
  ),
  'section-clip': {
    ...evidence(sectionClipUnit, 'should remove what the cut model removes for'),
    reference: [
      `${sectionClipUnit}::should remove what the cut model removes for`,
      `${sectionClipUnit}::should take the fat-line position from the trimmed view-space segment end`,
    ],
    'generated-source': [
      `${sectionClipUnit}::should compile the clip into the`,
      `${sectionClipUnit}::should fail compilation when a clipping chunk is`,
    ],
    'real-compile': [
      `${graphicsBackendEndToEnd}::no WebGPU validation errors emit during a Birdhouse preview render`,
      `${sectionClipBrowser}::should compile and draw the clip without a shader or pipeline error`,
    ],
    pixels: [`${sectionClipBrowser}::should draw exactly what the cut model keeps, away from each boundary`],
    'depth-clipping': [`${sectionClipBrowser}::should let the backdrop show through every removed part of a surface`],
    lifecycle: [
      `${sectionClipUnit}::should keep the clip when the surface depth bias composed under it turns off`,
      `${sectionClipUnit}::should give each viewer its own clip and refuse to share a material between them`,
      `${sectionClippingGroupUnit}::should compile the clip into every model surface, line and point on`,
      `${gltfMeshLifecycleUnit}::should install section clipping on every demanded primitive before committing on`,
      `${gltfMeshLifecycleUnit}::should present the same geometry hash again with every material clipped at commit on`,
    ],
    'structural-perf': [
      `${sectionClipBrowser}::should never relink as the cuts go from none to one to three pieces and back`,
      `${sectionClipUnit}::should keep every WebGL program input as cuts go from none to one to three to none`,
      `${sectionClipUnit}::should keep the WebGPU material cache keys and versions as cuts go from none to one to three to none`,
      `${sectionClippingGroupUnit}::should return early on a frame whose pieces are unchanged`,
    ],
    'gpu-whole-frame': [
      'apps/ui-e2e/src/section-view-overlap-performance-diagnostics.spec.ts::captures overlap and no-overlap diagnostics in',
    ],
  },
  'fat-lines': {
    ...evidence(
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts',
      'fails deterministically when the exact Three revision',
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::matches stable stripped WebGPU line2 node material JSON snapshot',
    ),
    reference: [
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::should preserve native reversed depth without a fragment-depth rewrite',
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::emits geometric viewZToLogarithmicDepth',
    ],
    pixels: [`${graphicsBackendEndToEnd}::grid, axes and model shading display the same`],
    'structural-perf': [
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::should keep its semantic cache key stable across setup and equivalent materials',
    ],
    'gpu-whole-frame': [`${graphicsBackendEndToEnd}::records warmed whole-frame benchmark`],
  },
  'morphing-points': evidence(
    'apps/ui/app/components/geometry/splash/morphing-points-semantics.test.ts',
    'starts exactly at source, ends at target',
    'apps/ui/app/components/geometry/splash/morphing-points-material.node.test.ts::matches stable stripped points node material snapshot',
  ),
  'webgl-post': {
    ...evidence(
      'packages/viewer/src/graphics/three/post-processing-webgl.test.tsx',
      'restores the selected composer depth directly to canvas',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should guard the dependency implementation whose owned wrappers it disposes',
    ),
    reference: [
      'packages/viewer/src/graphics/three/post-processing-webgl.test.tsx::restores the selected composer depth directly to canvas',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should pass the actual log-depth convention to the half-resolution shader',
      'packages/viewer/src/graphics/three/post-processing.test.tsx::should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum',
      'packages/viewer/src/graphics/three/post-processing-webgl.test.tsx::should compose display AO after tone mapping and bypass tone mapping for the raw AO diagnostic',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should copy AO color without rejecting pixels against a reused composer depth attachment',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should distinguish opacity-aware tone-map blending from the installed default that ignores opacity',
    ],
    lifecycle: [
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should dispose all owned fullscreen materials and preserve borrowed depth',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should stop transparent scene replays when all visible parts become opaque',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should release half-resolution materials without disposing shared fullscreen geometry on a toggle',
      'packages/viewer/src/graphics/three/post-processing-webgl.test.tsx::updates AO diagnostics and tone mapping on the retained production composers',
      'packages/viewer/src/graphics/three/canvas-three-gl.test.ts::should restore both retained cameras to forward depth before a WebGL canvas starts',
      'packages/viewer/src/graphics/three/three-canvas-instance.test.tsx::should restore both retained camera depth conventions when AO is disabled',
    ],
    'structural-perf': [
      'packages/viewer/src/graphics/three/post-processing-webgl.test.tsx::bypasses AO execution while retaining the same tone-mapping composer',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should route the native AO copy without texture feedback when needsSwap=',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should restart native composer frames at the MSAA geometry target after an in-place post chain',
    ],
  },
  'webgpu-post': {
    ...evidence(
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx',
      'restores the selected scene-pass depth with one direct fullscreen draw',
    ),
    reference: [
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should tone-map the scene once in linear light and leave the sRGB encode to the output pass',
      'packages/viewer/src/graphics/three/post-processing.test.tsx::should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum',
    ],
    lifecycle: [
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should dispose every demanded endpoint once on unmount',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::updates AO output and estimator uniforms without rebuilding the production graph',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should release partial resources when graph construction fails',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::keeps beauty ahead of AO dependencies and preserves its alpha in the AO visualization',
      'packages/viewer/src/graphics/three/canvas-three-gl.test.ts::should configure both native camera projections before the first WebGPU scene pass',
    ],
    'structural-perf': [
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should prepare only the active beauty endpoint when AO is disabled',
    ],
  },
  'model-emphasis-silhouette': evidence(
    'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.test.ts',
    'draws the outline only where mask coverage changes',
    'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.test.ts::matches stable stripped silhouette node material JSON snapshot',
  ),
  'model-pick': {
    reference: [`${modelPickBrowser}::should name the mesh and the distance the BVH names, away from silhouettes`],
    'real-compile': [`${modelPickBrowser}::should name the mesh and the distance the BVH names, away from silhouettes`],
    pixels: [`${modelPickBrowser}::should name the mesh and the distance the BVH names, away from silhouettes`],
    'backend-differential': [
      `${modelPickBrowser}::should name the mesh and the distance the BVH names, away from silhouettes`,
    ],
    'depth-clipping': [`${modelPickBrowser}::should pick what the section cut leaves, through what it removes`],
    lifecycle: [
      `${modelPickBrowser}::should answer pending for a scene the buffer does not show, then replay once when the pass lands`,
      `${gltfMeshLifecycleUnit}::should leave hover and selection alone while the model pick is pending, then resolve the replayed pointer`,
    ],
  },
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
