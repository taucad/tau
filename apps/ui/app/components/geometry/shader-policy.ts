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
    id: 'viewport-control-history',
    modules: [
      'packages/viewer/src/graphics/three/controls/section-plane-picker.ts',
      'packages/viewer/src/graphics/three/controls/viewport-gizmo-cube-surface.ts',
      'packages/viewer/src/graphics/three/controls/viewport-gizmo-cube-axes.ts',
    ],
    authoring: ['tsl'],
    backends: ['webgpu'],
    risks: ['camera', 'custom-position', 'upstream-drift'],
  },
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
    id: 'section-stencil-caps',
    helpers: ['packages/viewer/src/graphics/three/materials/triangle-derivatives.node.ts'],
    modules: [
      'packages/viewer/src/graphics/three/materials/section-stencil.material.ts',
      'packages/viewer/src/graphics/three/materials/section-cap-outline.material.ts',
      'packages/viewer/src/graphics/three/materials/section-cap-outline.node.ts',
      'packages/viewer/src/graphics/three/utils/section-stencil-caps.ts',
    ],
    authoring: ['glsl', 'tsl', 'fixed-function', 'render-pass'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'derivatives', 'depth', 'clipping', 'lifecycle', 'hot-path'],
  },
  {
    id: 'surface-depth-bias',
    modules: [
      'packages/viewer/src/graphics/three/materials/gltf-surface-depth-bias.ts',
      'packages/viewer/src/graphics/three/logarithmic-depth.ts',
    ],
    authoring: ['on-before-compile', 'tsl', 'fixed-function'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'depth', 'clipping', 'upstream-drift'],
  },
  {
    id: 'section-clip',
    helpers: ['packages/viewer/src/graphics/three/materials/named-uniform-array.ts'],
    modules: ['packages/viewer/src/graphics/three/materials/section-clip.ts'],
    authoring: ['on-before-compile', 'tsl'],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'spatial-frame', 'clipping', 'lifecycle', 'hot-path', 'upstream-drift', 'private-api'],
  },
  {
    id: 'fat-lines',
    helpers: ['packages/viewer/src/graphics/three/materials/line-coverage.ts'],
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
    // Internal graph and lifecycle helpers share this site's contract.
    helpers: [
      'packages/viewer/src/graphics/three/ao-normal.ts',
      'packages/viewer/src/graphics/three/gtao-log-depth.ts',
      'packages/viewer/src/graphics/three/surface-reuse.ts',
      'packages/viewer/src/graphics/three/camera-preparation.ts',
      'packages/viewer/src/graphics/three/transmission-retirement.ts',
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.ts',
      'packages/viewer/src/graphics/three/webgpu-stencil-state.ts',
      'packages/viewer/src/graphics/three/webgl-clear-state.ts',
      'packages/viewer/src/graphics/three/ao-denoise.ts',
      'packages/viewer/src/graphics/three/fxaa.ts',
    ],
    authoring: ['tsl', 'render-pipeline'],
    backends: ['webgpu'],
    risks: ['camera', 'depth', 'lifecycle', 'hot-path', 'private-api', 'upstream-drift'],
  },
  {
    id: 'model-emphasis-silhouette',
    helpers: [
      'packages/viewer/src/graphics/three/materials/model-emphasis-region.ts',
      'packages/viewer/src/graphics/three/materials/model-emphasis-crop.ts',
    ],
    modules: [
      'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.material.ts',
      'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.node.ts',
    ],
    backends: ['webgl', 'webgpu'],
    risks: ['camera', 'transparency', 'depth', 'lifecycle', 'hot-path'],
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
const sectionStencilCapsUnit = 'packages/viewer/src/graphics/three/utils/section-stencil-caps.test.ts';
const sectionStencilCapsBrowser = 'packages/viewer/src/graphics/three/utils/section-stencil-caps.browser.test.ts';
const sectionCapOutlineUnit = 'packages/viewer/src/graphics/three/materials/section-cap-outline.material.test.ts';
const modelPickRegion = 'packages/viewer/src/graphics/three/utils/model-gpu-pick-region.browser.test.ts';
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
  'viewport-control-history': {
    reference: [
      'packages/viewer/src/graphics/three/controls/viewport-gizmo-cube.browser.test.ts::should return the 5K section picker to identical pixels and picks after camera round trips: %s',
    ],
    'generated-source': [
      'packages/viewer/src/graphics/three/controls/section-plane-picker.test.ts::should guard the observer shortcut bypassed by the moving picker tiles',
    ],
    pixels: [
      'packages/viewer/src/graphics/three/controls/viewport-gizmo-cube.browser.test.ts::should return the 5K section picker to identical pixels and picks after camera round trips: %s',
    ],
    'backend-differential': [
      'packages/viewer/src/graphics/three/controls/viewport-gizmo-cube.browser.test.ts::should return the 5K section picker to identical pixels and picks after camera round trips: %s',
    ],
  },
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
  'section-stripes': {
    ...evidence(
      sectionStencilCapsUnit,
      'should cap with the shared surface depth bias and the cap stencil test',
      'packages/viewer/src/graphics/three/materials/striped-material.test.ts::matches stable stripped section cap node material JSON snapshot',
    ),
    'real-compile': [
      `${sectionStencilCapsBrowser}::should compile and draw every pass without a shader or pipeline error`,
    ],
    pixels: [`${sectionStencilCapsBrowser}::should cap each owner where its solids hold the cut, and nowhere else`],
    'depth-clipping': [
      `${sectionStencilCapsBrowser}::should cap each owner where its solids hold the cut, and nowhere else`,
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should occlude grid and hidden outlines through actual stencil caps',
    ],
    lifecycle: [
      `${sectionStencilCapsUnit}::should reuse its pooled draws frame after frame, and let go of a source that left`,
    ],
  },
  'section-stencil-caps': {
    reference: [
      'packages/viewer/src/graphics/three/utils/section-outline-geometry.test.ts::should preserve every triangle position and winding with constant geometric normals',
      `${sectionStencilCapsUnit}::should take the half-spaces whose removed side holds a perspective eye`,
      `${sectionStencilCapsUnit}::should cut a box into the polygon where the plane meets it, ordered around it`,
    ],
    'generated-source': [
      'packages/viewer/src/graphics/three/node-frame-reference.browser.test.ts::should keep cap coverage independent of triangle grouping through 5K motion on %s',
      `${sectionCapOutlineUnit}::should compile the outline band after the clipping chunks and discard off the band`,
      `${sectionCapOutlineUnit}::matches stable stripped section cap outline node material JSON snapshot`,
    ],
    'real-compile': [
      `${sectionStencilCapsBrowser}::should compile and draw every pass without a shader or pipeline error`,
    ],
    pixels: [
      'packages/viewer/src/graphics/three/node-frame-reference.browser.test.ts::should keep cap coverage independent of triangle grouping through 5K motion on %s',
      'packages/viewer/src/graphics/three/node-frame-reference.browser.test.ts::should give section outlines the BREP square-pixel coverage at 5K',
      `${sectionStencilCapsBrowser}::should cap each owner where its solids hold the cut, and nowhere else`,
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should occlude grid and hidden outlines through actual stencil caps',
      `${sectionStencilCapsBrowser}::should show overlap on exactly the pixels where two owners overlap`,
      `${sectionStencilCapsBrowser}::should outline the cut edges, beside the caps`,
      `${sectionStencilCapsBrowser}::should draw an unbroken line along every visible cut edge`,
      `${sectionStencilCapsBrowser}::should antialias the line, as model edges are, rather than cut it off at whole pixels`,
    ],
    'backend-differential': [
      `${sectionStencilCapsBrowser}::should show overlap on exactly the pixels where two owners overlap`,
    ],
    'depth-clipping': [
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.browser.test.ts::should preserve rasterized cap-outline depth on a front surface at 5K on %s',
      `${sectionStencilCapsBrowser}::should cap each owner where its solids hold the cut, and nowhere else`,
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should occlude grid and hidden outlines through actual stencil caps',
      `${sectionStencilCapsUnit}::should cap with the shared surface depth bias and the cap stencil test`,
    ],
    lifecycle: [
      'packages/viewer/src/graphics/three/utils/section-outline-geometry.test.ts::should reuse buffers for transforms and draw ranges and retire only owned revisions',
      `${sectionStencilCapsUnit}::should reuse its pooled draws frame after frame, and let go of a source that left`,
    ],
    'structural-perf': [
      `${sectionStencilCapsUnit}::should count, cap and outline each crossing source with draws that do not depend on its triangles`,
      'packages/viewer/src/graphics/three/node-frame-reference.browser.test.ts::should keep cap coverage independent of triangle grouping through 5K motion on %s',
    ],
    'gpu-whole-frame': [
      `${sectionStencilCapsBrowser}::should spend main-thread time on pieces and meshes, not triangles`,
    ],
  },
  'surface-depth-bias': {
    ...evidence(
      'packages/viewer/src/graphics/three/materials/gltf-surface-depth-bias.test.ts',
      'fails compilation when the expected log-depth chunk is absent or duplicated',
      'packages/viewer/src/graphics/three/materials/gltf-surface-depth-bias.test.ts::also separates orthographic surfaces when the renderer writes fragment depth',
    ),
    reference: [
      'packages/viewer/src/graphics/three/materials/gltf-surface-depth-bias.test.ts::sizes node surface separation to actual DPR and reversed depth',
    ],
    pixels: [
      'packages/viewer/src/graphics/three/viewport-depth.browser.test.ts::keeps rear surfaces occluded at the deployed close-up clip interval on %s',
      'packages/viewer/src/graphics/three/viewport-depth.browser.test.ts::preserves opaque ownership on the reported planetary close-up on %s',
      'packages/viewer/src/graphics/three/materials/gltf-edge-end-bleed.browser.test.ts::should keep a hidden edge that ends on a face boundary behind that face',
    ],
  },
  'section-clip': {
    ...evidence(sectionClipUnit, 'should remove what the cut model removes for'),
    reference: [
      `${sectionClipUnit}::should remove what the cut model removes for`,
      `${sectionClipUnit}::should take the fat-line position from the trimmed view-space segment end`,
    ],
    'generated-source': [
      'packages/viewer/src/graphics/three/materials/named-uniform-array.test.ts::should pin the upstream uniform declaration and binding contract',
      'packages/viewer/src/graphics/three/shader-cache.browser.test.ts::should reuse section shader source across independent owners on node %s',
      `${sectionClipUnit}::should compile the clip into the`,
      `${sectionClipUnit}::should fail compilation when a clipping chunk is`,
    ],
    'real-compile': [
      'packages/viewer/src/graphics/three/shader-cache.browser.test.ts::should reuse section shader source across independent owners on node %s',
      `${graphicsBackendEndToEnd}::no WebGPU validation errors emit during a Birdhouse preview render`,
      `${sectionClipBrowser}::should compile and draw the clip without a shader or pipeline error`,
    ],
    pixels: [`${sectionClipBrowser}::should draw exactly what the cut model keeps, away from each boundary`],
    'depth-clipping': [`${sectionClipBrowser}::should let the backdrop show through every removed part of a surface`],
    lifecycle: [
      'packages/viewer/src/graphics/three/materials/named-uniform-array.test.ts::should restore the builder after failed generation without sharing owner data',
      'packages/viewer/src/graphics/three/shader-cache.browser.test.ts::should reuse section shader source across independent owners on node %s',
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
      `${sectionStencilCapsBrowser}::should spend main-thread time on pieces and meshes, not triangles`,
    ],
  },
  'fat-lines': {
    ...evidence(
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts',
      'fails deterministically when the exact Three revision',
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::matches stable stripped WebGPU line2 node material JSON snapshot',
    ),
    reference: [
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::should require review when the upstream DPR singleton ownership changes',
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::should preserve native reversed depth without a fragment-depth rewrite',
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::should establish hardware blending before a cached shader can bypass setup',
      'packages/viewer/src/graphics/three/materials/line2.material.test.ts::emits geometric viewZToLogarithmicDepth',
    ],
    pixels: [
      'packages/viewer/src/graphics/three/node-frame-reference.browser.test.ts::should give section outlines the BREP square-pixel coverage at 5K',
      'packages/viewer/src/graphics/three/node-frame-reference.browser.test.ts::should preserve long-axis coverage across cached materials and frame formats at 5K',
      `${graphicsBackendEndToEnd}::grid, axes and model shading display the same`,
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should preserve nominal unlit stroke coverage across phases',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should preserve opaque planetary pixels beneath workspace axes at 5K',
      'packages/viewer/src/graphics/three/utils/gltf-edge-batches.browser.test.ts::should match canonical pixels when shared, mirrored and singleton edges move together',
    ],
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
    'depth-clipping': [
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should retain scene and cap depth before later overlays',
    ],
    reference: [
      'packages/viewer/src/graphics/three/post-processing-webgl.test.tsx::restores the selected composer depth directly to canvas',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should pass the actual log-depth convention to the half-resolution shader',
      'packages/viewer/src/graphics/three/post-processing.test.tsx::should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum',
      'packages/viewer/src/graphics/three/post-processing-webgl.test.tsx::should compose display AO after tone mapping and bypass tone mapping for the raw AO diagnostic',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should publish spatial AO without overwriting normal channels when halfRes=%s',
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should initialize the weighted AO sum after every composite shader reconfiguration',
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
      'packages/viewer/src/graphics/three/n8ao-pass.test.ts::should publish spatial AO without overwriting normal channels when halfRes=%s',
      'packages/viewer/src/graphics/three/post-processing-webgl.pipeline.test.tsx::should keep fullscreen color writes out of geometry MSAA across frames with %j',
    ],
  },
  'webgpu-post': {
    // AO compile checks cap the 13-tap gather budget; pixel checks verify moving-image grain and shimmer.
    ...evidence(
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx',
      'restores the selected scene-pass depth with one direct fullscreen draw',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should guard the upstream implementations whose owned resources require explicit disposal',
    ),
    'generated-source': [
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.test.ts::should require requalification when Three sampled-view caching or texture lifetime changes',
      'packages/viewer/src/graphics/three/webgl-clear-state.test.ts::should require requalification when Three color-clear or mask caching changes',
      'packages/viewer/src/graphics/three/ao-denoise.test.ts::should preserve the deterministic depth and normal %s graph',
      'packages/viewer/src/graphics/three/fxaa.test.ts::should preserve the resource-free FXAA graph for a caller-owned color input',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should retain the continuous unlit planetary rim through production composition at 5K',
      'packages/viewer/src/graphics/three/fxaa.test.ts::should guard the exact classic FXAA source and quality contract paired with the node port',
      'packages/viewer/src/graphics/three/ao-denoise.browser.test.ts::should compile viewport %s with native validation and an invalid-shader control',
      'packages/viewer/src/graphics/three/ao-denoise.browser.test.ts::should compile viewport %s with WebGL2 validation and an invalid-shader control',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should guard the upstream implementations whose owned resources require explicit disposal',
    ],
    pixels: [
      'packages/viewer/src/graphics/three/fxaa.browser.test.ts::should retain surface boundary quality with bounded FXAA on %s',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should retain planetary surface boundaries and motion with six-step filtering at 5K on %s',
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.browser.test.ts::should preserve sampled depth and attachment stencil through resize/recreation',
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.browser.test.ts::should restore repeated stencil references across passes and framebuffer copies',
      'packages/viewer/src/graphics/three/utils/section-stencil-caps.browser.test.ts::should cap each owner where its solids hold the cut, and nowhere else',
      'packages/viewer/src/graphics/three/node-frame-reference.browser.test.ts::should preserve display ramps, alpha and linear overlay blends in compact frame storage',
      'packages/viewer/src/graphics/three/ao-normal.browser.test.ts::should round-trip both normal hemispheres through RG8 on %s',
      'packages/viewer/src/graphics/three/ao-normal.browser.test.ts::should interpolate decoded normals across folds and clear texels on %s',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should occlude grid and hidden outlines through actual stencil caps',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should keep contact AO smooth without erasing it',
    ],
    'backend-differential': [
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should keep contact AO smooth without erasing it',
    ],
    'real-compile': [
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.browser.test.ts::should preserve sampled depth and attachment stencil through resize/recreation',
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.browser.test.ts::should restore repeated stencil references across passes and framebuffer copies',
      'packages/viewer/src/graphics/three/utils/section-stencil-caps.browser.test.ts::should cap each owner where its solids hold the cut, and nowhere else',
      'packages/viewer/src/graphics/three/ao-denoise.browser.test.ts::should compile viewport %s with native validation and an invalid-shader control',
      'packages/viewer/src/graphics/three/ao-denoise.browser.test.ts::should compile viewport %s with WebGL2 validation and an invalid-shader control',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should keep contact AO smooth without erasing it',
    ],
    'depth-clipping': [
      'packages/viewer/src/graphics/three/viewport-depth.browser.test.ts::reconstructs logarithmic AO depth across tiny-near perspective and signed orthographic cameras',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should occlude grid and hidden outlines through actual stencil caps',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should retain scene and cap depth before later overlays',
    ],
    reference: [
      'packages/viewer/src/graphics/three/utils/spatial.utils.test.ts::uses the actual orthographic span',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::uses hardware-filtered RGBA8 normals on the node WebGL2 backend',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should keep contact AO smooth without erasing it',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should tone-map the scene once in linear light and leave the sRGB encode to the output pass',
      'packages/viewer/src/graphics/three/post-processing.test.tsx::should resolve viewport AO radius from the CSS diagonal independently of DPR above the physical minimum',
    ],
    lifecycle: [
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should isolate two 5K node views through sibling resize and remount on %s',
      'packages/viewer/src/graphics/three/surface-reuse.test.ts::should retire every attachment user before initialization and retry a failed preparation',
      'packages/viewer/src/graphics/three/surface-reuse.test.ts::should restore the target after %s fails',
      'packages/viewer/src/graphics/three/surface-reuse.test.ts::should isolate simultaneous owners and release only the retiring framebuffer view',
      'packages/viewer/src/graphics/three/camera-preparation.test.ts::should cancel on input, hidden document and disposal, allowing a later eligible frame',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should prepare offscreen once and restore camera and state after failure=%s',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should preserve the saved rear planetary section through preparation and cut reset at 5K on %s with AO %s',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should isolate CAD draws and restore renderer state after failure=%s',
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.browser.test.ts::should preserve sampled depth and attachment stencil through resize/recreation',
      'packages/viewer/src/graphics/three/webgpu-depth-sampling.browser.test.ts::should restore repeated stencil references across passes and framebuffer copies',
      'packages/viewer/src/graphics/three/utils/section-stencil-caps.browser.test.ts::should cap each owner where its solids hold the cut, and nowhere else',
      'packages/viewer/src/graphics/three/transmission-retirement.test.ts::should retire only the viewport copy belonging to the disposed scene pass',
      'packages/viewer/src/graphics/three/transmission-retirement.test.ts::should pin the upstream viewport-copy and transmission ownership contract',
      'packages/viewer/src/graphics/three/transmission-retirement.browser.test.ts::should release a retired transmission copy and reacquire it safely on %s',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should retire the scene transmission copy with its owning graph',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should retain HDR frame storage for unbounded output and retire it on tone-map changes',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should restore output state when final encoding fails and recover the following frame',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should dispose the retargeted graph once on unmount',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should retarget one live graph and frame without rebuilding camera resources',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should retain transmissive composition and bounded resources across camera switches',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::updates AO output and estimator uniforms without rebuilding the production graph',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should release partial resources when graph construction fails',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::keeps beauty ahead of AO dependencies and preserves its alpha in the AO visualization',
      'packages/viewer/src/graphics/three/canvas-three-gl.test.ts::should configure both native camera projections before the first WebGPU scene pass',
    ],
    'structural-perf': [
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should share D24S8 on node WebGL2 and prepare all three views before drawing',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should reuse scene color with compact composition and precise depth on %s',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should occlude grid and hidden outlines through actual stencil caps',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should retain one linear stencil frame through overlays and encode only at frame completion',
      'packages/viewer/src/graphics/three/canvas-three-gl.test.ts::should leave canvas depth to the composed frame without changing standalone renderers',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should keep AO active without multisampled scene attachments or a native-resolution AA intermediate',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should budget AO at half drawing-buffer resolution',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should resize AO with CSS size and DPR without rebuilding the pipeline',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should prepare only the active beauty endpoint when AO is disabled',
      'packages/viewer/src/graphics/three/post-processing-webgpu.test.tsx::should retain scene depth for overlays without a final antialias target',
    ],
  },
  'model-emphasis-silhouette': {
    ...evidence(
      'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.test.ts',
      'draws the outline only where mask coverage changes',
      'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.test.ts::matches stable stripped silhouette node material JSON snapshot',
    ),
    reference: [
      'packages/viewer/src/graphics/three/materials/model-emphasis-silhouette.test.ts::draws the outline only where mask coverage changes',
      'packages/viewer/src/graphics/three/materials/model-emphasis-region.test.ts::bounds the composite in original clip coordinates with device-pixel filter padding',
      'packages/viewer/src/graphics/three/materials/model-emphasis-crop.test.ts::should preserve crop depth and pixel placement',
      'packages/viewer/src/graphics/three/materials/model-emphasis-region.test.ts::keeps full coverage for eye-plane crossings and deformation and bounds the union of separate parts',
      'packages/viewer/src/graphics/three/materials/model-emphasis-region.test.ts::retains padding at fractional DPR and restores bounds after offscreen motion and camera switching',
    ],
    pixels: [
      'packages/viewer/src/graphics/three/react/model-emphasis-overlay.browser.test.ts::preserves fractional and occluded highlights with node WebGL2',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should clear persistent emphasis through the production node frame',
      'packages/viewer/src/graphics/three/materials/model-emphasis-pixels.test.ts::should judge displayed alpha boundaries while rejecting missing, shifted and occluded strokes on both themes',
    ],
    'backend-differential': [
      'packages/viewer/src/graphics/three/react/model-emphasis-overlay.browser.test.ts::preserves fractional and occluded highlights with node WebGL2',
      'packages/viewer/src/graphics/three/post-processing-antialias.browser.test.tsx::should clear persistent emphasis through the production node frame',
      'packages/viewer/src/graphics/three/materials/model-emphasis-pixels.test.ts::should judge displayed alpha boundaries while rejecting missing, shifted and occluded strokes on both themes',
    ],
    lifecycle: [
      'packages/viewer/src/graphics/three/react/model-emphasis-overlay.test.ts::packs one node emphasis state without reducing coverage samples or depth precision',
      'packages/viewer/src/graphics/three/react/model-emphasis-overlay.test.ts::should clear color at the qualified node pass for WebGL2=%s',
      'packages/viewer/src/graphics/three/react/model-emphasis-overlay.browser.test.ts::should preserve required depth attachments and omit unused resolved mask depth',
    ],
    'structural-perf': [
      'packages/viewer/src/graphics/three/materials/model-emphasis-region.test.ts::bounds the composite in original clip coordinates with device-pixel filter padding',
      'packages/viewer/src/graphics/three/materials/model-emphasis-crop.test.ts::should preserve crop depth and pixel placement',
      'packages/viewer/src/graphics/three/react/model-emphasis-overlay.browser.test.ts::should preserve required depth attachments and omit unused resolved mask depth',
      'packages/viewer/src/graphics/three/react/model-emphasis-overlay.test.ts::should guard the installed depth allocation and framebuffer implementation',
    ],
  },
  'model-pick': {
    reference: [`${modelPickBrowser}::should name the mesh and the distance the BVH names, away from silhouettes`],
    'real-compile': [`${modelPickBrowser}::should name the mesh and the distance the BVH names, away from silhouettes`],
    pixels: [`${modelPickBrowser}::should name the mesh and the distance the BVH names, away from silhouettes`],
    'backend-differential': [
      `${modelPickBrowser}::should name the mesh and the distance the BVH names, away from silhouettes`,
    ],
    'depth-clipping': [
      `${modelPickBrowser}::should pick what the section cut leaves, through what it removes`,
      `${modelPickRegion}::should allocate only on demand and preserve pixel-centre hits at 5K and small viewports`,
      'packages/viewer/src/graphics/three/utils/model-gpu-pick-upstream.test.ts::should guard the installed cropped-camera depth flag and readback row stride',
    ],
    'structural-perf': [
      `${modelPickRegion}::should allocate only on demand and preserve pixel-centre hits at 5K and small viewports`,
    ],
    lifecycle: [
      `${modelPickRegion}::should coalesce pending regions and suppress replay after disposal`,
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
