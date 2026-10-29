/**
 * Calibration-server-only source experiment. No product module imports this file.
 * Each unique source anchor is checked, so an upstream edit fails rather than
 * silently measuring a different graph. URL choices are fixed until page reload.
 */
export function transformRenderingAblation(source: string, id: string): string | undefined {
  const file = id.split('?')[0] ?? id;
  let code = source;
  const replace = (before: string, after: string): void => {
    if (code.split(before).length !== 2) {
      throw new Error(`Rendering ablation anchor drift in ${file}: ${before}`);
    }
    code = code.replace(before, after);
  };
  const prelude = `const tauAblation = new URLSearchParams(globalThis.location.search);
if (tauAblation.has('surfaceFilter')) throw new Error('surfaceFilter is retired: node composition always reuses scene color. Use source 44fd8d3acb for historical variants.');
`;
  if (file.endsWith('/graphics/three/post-processing-webgpu.tsx')) {
    code = "import { ivec2, screenCoordinate } from 'three/tsl';\n" + code;
    replace(
      "import { createViewportFxaa } from '#graphics/three/fxaa.js';",
      "import { createViewportFxaa as tauSurfaceFxaa } from '#graphics/three/fxaa.js';\nconst createViewportFxaa: typeof tauSurfaceFxaa = (input, sampleColor) => tauAblation.get('surfaceAa') === 'off' ? (sampleColor ? sampleColor(screenUV) : input) : tauSurfaceFxaa(input, sampleColor);",
    );
    replace(
      '    const preparation = scheduleCameraPreparation(renderer.domElement, () => {',
      `    if (tauAblation.get('cameraPreparation') === 'off') return;
    const preparation = scheduleCameraPreparation(renderer.domElement, () => {`,
    );
    replace(
      '      if (eligibility.surfaces === 0) {',
      `      scene.userData.calibrationPreparation = { ...eligibility };
      if (eligibility.surfaces === 0) {`,
    );
    replace(
      '        // Exact live pass context, with no second graph or final canvas draw.\n        selected.outputQuad.render(renderer);',
      `        const preparationStart = performance.now();
        selected.outputQuad.render(renderer);
        scene.userData.calibrationPreparation = { milliseconds: performance.now() - preparationStart, at: performance.now() };`,
    );
    // Native sharing remains experimental; node WebGL2 shares by default.
    code = "import { FloatType } from 'three';\n" + code;
    replace(
      `          // Keep the complete live graph: no target disposal or second
          // 5K endpoint. AO reads stable matrices updated from this scene camera.
          previous.setCamera(camera);
          resourcesRef.current.delete(selectedCameraRef.current);
          resourcesRef.current.set(camera, previous);`,
      `          if (tauAblation.get('cameraOwnership') === 'recreate') {
            disposePipelineResources([previous], gl as unknown as WebGPURenderer);
            frameRef.current = undefined;
            resourcesRef.current.delete(selectedCameraRef.current);
          } else {
            previous.setCamera(camera);
            resourcesRef.current.delete(selectedCameraRef.current);
            resourcesRef.current.set(camera, previous);
          }`,
    );
    replace(
      'frame.sharedDepth = gpuRenderer.coordinateSystem === WebGLCoordinateSystem;',
      `frame.sharedDepth = tauAblation.has('depthOwnership')
        ? tauAblation.get('depthOwnership') === 'shared'
        : gpuRenderer.coordinateSystem === WebGLCoordinateSystem;
      if (frame.sharedDepth && gpuRenderer.coordinateSystem !== WebGLCoordinateSystem && !gpuRenderer.hasFeature('depth32float-stencil8')) {
        throw new Error('Shared depth requires float32 stencil support');
      }`,
    );
    replace(
      'depth.type = UnsignedInt248Type;',
      'depth.type = gpuRenderer.coordinateSystem === WebGLCoordinateSystem ? UnsignedInt248Type : FloatType;',
    );

    replace(
      'material.depthNode = depthMaterial.depthNode;',
      "material.depthNode = tauAblation.get('depthCopy') === 'load' ? (depthMaterial.depthNode as ReturnType<typeof texture>).load(ivec2(screenCoordinate)) : depthMaterial.depthNode;",
    );
    replace(
      'const compactFrame = toneMapping === NeutralToneMapping;',
      "const compactFrame = tauAblation.get('frameStorage') !== 'half' && toneMapping === NeutralToneMapping;",
    );
    replace(
      'const compactNormals = gpuRenderer.coordinateSystem !== WebGLCoordinateSystem;',
      "const compactNormals = tauAblation.get('normalStorage') === 'rgba' ? false : tauAblation.get('normalStorage') === 'rg' ? true : gpuRenderer.coordinateSystem !== WebGLCoordinateSystem;",
    );
    replace(
      'const scenePass = pass(scene, camera, { samples: 0 });',
      `const scenePass = pass(scene, camera,
      tauAblation.has('sceneSamples') ? { samples: Number(tauAblation.get('sceneSamples')) } : { samples: 0 });
    scene.userData.calibrationScenePass = scenePass;`,
    );
    replace('const withNormal = withAo;', "const withNormal = withAo || tauAblation.get('abl') === 'mrt';");
    replace(
      'if (!withAo) {',
      `if (!withAo) {
      if (tauAblation.get('abl') === 'mrt') scenePass.getTexture('normal').type = UnsignedByteType;`,
    );
    replace(
      'denoiseInput!.sample(uv).r, float(1)',
      `tauAblation.get('abl') === 'raw-ao' ? aoTexture.sample(uv).r
        : tauAblation.get('abl') === 'bilateral-ao' ? denoiseNode.upsample(denoiseInput, uv)
        : denoiseInput!.sample(uv).r, float(1)`,
    );
    replace(
      "const withAo = aoAllowed && aoEnabled && displayMode !== 'no-ao';",
      `const withAo = aoAllowed && aoEnabled && displayMode !== 'no-ao'
        && !['beauty', 'mrt'].includes(tauAblation.get('abl') ?? '');`,
    );
  } else if (file.endsWith('/graphics/three/materials/gltf-edges.ts')) {
    replace('  material.transparent = true;', "  material.transparent = tauAblation.get('lineCoverage') !== 'opaque';");
    replace(
      '  material.analyticButtCaps = true;',
      "  material.analyticButtCaps = tauAblation.get('lineCaps') !== 'round';",
    );
  } else if (file.endsWith('/graphics/three/materials/named-uniform-array.ts')) {
    replace(
      "  const array = uniformArray<'vec4'>(values, 'vec4').setName(name);",
      "  if (tauAblation.get('shaderNames') === 'legacy') return uniformArray<'vec4'>(values, 'vec4');\n  const array = uniformArray<'vec4'>(values, 'vec4').setName(name);",
    );
  } else if (file.endsWith('/graphics/three/controls/viewport-gizmo-cube-surface.ts')) {
    replace(
      "if (backend === 'webgpu') {",
      "if (backend === 'webgpu' && tauAblation.get('pickerIdentity') !== 'legacy') {",
    );
  } else if (file.endsWith('/graphics/three/controls/viewport-gizmo-cube-axes.ts')) {
    replace(
      "const SpriteMaterial = renderingBackend === 'webgpu' ? SpriteNodeMaterial : THREE.SpriteMaterial;",
      "const SpriteMaterial = renderingBackend === 'webgpu' && tauAblation.get('pickerIdentity') !== 'legacy' ? SpriteNodeMaterial : THREE.SpriteMaterial;",
    );
  } else if (file.endsWith('/graphics/three/controls/section-plane-picker.ts')) {
    replace(
      'material.positionNode = positionLocal;',
      "if (tauAblation.get('pickerIdentity') !== 'legacy') material.positionNode = positionLocal;",
    );
  } else if (file.endsWith('/graphics/three/post-processing.tsx')) {
    code =
      `import { useFrame as useDiagnosticFrame } from '@react-three/fiber';
function MainSceneFallback(): undefined { useDiagnosticFrame((state) => { state.gl.render(state.scene, state.camera); }, 1); return undefined; }
` + code;
    replace(
      "gl.toneMapping = backend === 'webgpu' ? NoToneMapping : rendererToneMappingModes[toneMapping];",
      "gl.toneMapping = backend === 'webgpu' && tauAblation.get('abl') !== 'direct' ? NoToneMapping : rendererToneMappingModes[toneMapping];",
    );
    replace(
      "if (backend === 'webgpu') {",
      "if (tauAblation.get('abl') === 'direct') return <MainSceneFallback />;\n  if (backend === 'webgpu') {",
    );
  } else if (file.endsWith('/graphics/three/renderer.ts')) {
    replace(
      'const renderer = new ThreeWebGPURenderer(options);',
      `if (['0', '4'].includes(tauAblation.get('samples') ?? '')) Object.assign(options, { antialias: tauAblation.get('samples') === '4', samples: Number(tauAblation.get('samples')) });
    if (tauAblation.get('nodegl') === '1') Object.assign(options, { forceWebGL: true, reversedDepthBuffer: false });
    const renderer = new ThreeWebGPURenderer(options);`,
    );
    replace(
      "if (backend === 'webgpu' && renderer.coordinateSystem !== THREE.WebGPUCoordinateSystem) {",
      "if (backend === 'webgpu' && tauAblation.get('nodegl') !== '1' && renderer.coordinateSystem !== THREE.WebGPUCoordinateSystem) {",
    );
    code =
      `import { installAllocationLedger } from '/app/routes/[__e2e].onshape-render-profile/allocation-ledger.ts';\n` +
      code;
    replace(
      "if (useCase === 'viewport') {\n      // NodeRenderer",
      "if (tauAblation.has('ledger')) installAllocationLedger(renderer, tauAblation.get('passCost') ?? undefined);\n    if (useCase === 'viewport') {\n      // NodeRenderer",
    );
    replace(
      'renderer.setTransparentSort(reversedDepthTransparentSort);',
      'if (renderer.reversedDepthBuffer) renderer.setTransparentSort(reversedDepthTransparentSort);',
    );
  } else if (file.endsWith('/graphics/three/react/model-emphasis-overlay.tsx')) {
    replace('croppedMask = true,', "croppedMask = tauAblation.get('maskRegion') !== 'full',");
    replace('fuseNativeClear = true,', "fuseNativeClear = tauAblation.get('nativeClear') !== 'separate',");
    replace('boundedComposite = true,', "boundedComposite = tauAblation.get('compositeRegion') !== 'full',");
    replace(
      "depthTexture: backend === 'webgpu' ? null : new DepthTexture(1, 1, UnsignedIntType),",
      "depthTexture: backend === 'webgpu' && tauAblation.get('maskDepthStorage') !== 'resolved' ? null : new DepthTexture(1, 1, UnsignedIntType),",
    );
    replace(
      'previousTarget.samples <= 1 &&',
      "tauAblation.get('maskDepth') !== 'separate' && previousTarget.samples <= 1 &&",
    );
    replace(
      'const both = set.hover.length > 0 && set.selected.length > 0;',
      "const both = tauAblation.get('maskStorage') === 'rgba' || (set.hover.length > 0 && set.selected.length > 0);",
    );
  } else if (file.endsWith('/graphics/three/react/gltf-mesh.tsx')) {
    replace(
      'setModelEmphasisSet(rootScene, emphasised);',
      `const calibrationMode = tauAblation.get('emphasis');
      const calibrationMeshes = calibrationMode ? getComponentInventory(scene).filter((object): object is Mesh => isSurfaceObject(object)) : [];
      const calibrationIndex = Number(tauAblation.get('emphasisIndex') ?? 0);
      if (!Number.isSafeInteger(calibrationIndex) || calibrationIndex < 0 || (calibrationMeshes.length > 0 && calibrationIndex >= calibrationMeshes.length)) throw new Error('Invalid calibration emphasisIndex');
      const calibrationEmphasis = calibrationMode ? {
        hover: calibrationMode === 'hover' || calibrationMode === 'both' ? calibrationMeshes.slice(1, 2) : [],
        selected: calibrationMode === 'selected' || calibrationMode === 'both' ? calibrationMeshes.slice(calibrationIndex, calibrationIndex + 1) : [],
      } : emphasised;
      if (calibrationMode) rootScene.userData.calibrationEmphasis = { mode: calibrationMode, selectedIndex: calibrationIndex, hover: calibrationEmphasis.hover.map((mesh) => mesh.name), selected: calibrationEmphasis.selected.map((mesh) => mesh.name) };
      setModelEmphasisSet(rootScene, calibrationEmphasis);`,
    );
  } else if (file.endsWith('/graphics/three/utils/section-stencil-caps.ts')) {
    // `capOutline=off` removes the cap outline pass only: a query choice, so an outline ablation no longer needs a
    // source edit that an already-open `hmr:false` page would silently ignore. It drops required CAD edges and is
    // diagnostic-only; the draw count must fall before a comparison is admitted.
    replace(
      'if (allFaces.length > 0 && frame.outlineWidthPixels > 0) {',
      "if (allFaces.length > 0 && frame.outlineWidthPixels > 0 && tauAblation.get('capOutline') !== 'off') {",
    );
  } else if (file.endsWith('/graphics/three/scene-overlay.tsx')) {
    replace('restoreDepth();', "if (tauAblation.get('depthRestore') !== 'off') restoreDepth();");
  } else if (file.endsWith('/[__e2e].onshape-render-profile/route.tsx')) {
    code =
      `import { readAllocationLedgers, resetAllocationCosts } from '/app/routes/[__e2e].onshape-render-profile/allocation-ledger.ts';\n` +
      code;
    replace(
      'if (current.frame >= 30 && current.samples.length < 300) {',
      "if (tauAblation.has('passCost') && current.frame === 30) resetAllocationCosts();\n      if (current.frame >= 30 && current.samples.length < 300) {",
    );
    replace(
      'current.drainStarted = now;',
      "current.drainStarted = now;\n        if (tauAblation.has('passCost')) resetAllocationCosts(false);",
    );
    replace(
      'current.gpuPassRanges.slice(0, 16)',
      "current.gpuPassRanges.slice(0, tauAblation.has('ledger') ? undefined : 16)",
    );
    replace('enableGrid={overlay}', "enableGrid={overlay && tauAblation.get('overlay') !== 'axes'}");
    replace('enableAxes={overlay}', "enableAxes={overlay && tauAblation.get('overlay') !== 'grid'}");
    replace(
      'const [overlay, setOverlay] = useState(false);',
      "const [overlay, setOverlay] = useState(tauAblation.has('overlay'));",
    );
    replace(
      "useState('f6-authored-planetary')",
      "useState(tauAblation.has('abl') ? 'f8-native-build123d-planetary' : 'f6-authored-planetary')",
    );
    replace('span: 0.22,', "span: tauAblation.get('view') === 'close' ? 0.09 : 0.22,");
    replace(
      'const [edges, setEdges] = useState(true);',
      "const [edges, setEdges] = useState(tauAblation.get('edges') !== 'off');",
    );
    replace(
      'const [viewportWidth, setViewportWidth] = useState(1276);',
      "const [viewportWidth, setViewportWidth] = useState(tauAblation.has('abl') ? 2560 : 1276);",
    );
    replace(
      'const [viewportHeight, setViewportHeight] = useState(798);',
      "const [viewportHeight, setViewportHeight] = useState(tauAblation.has('abl') ? 1440 : 798);",
    );
    replace("graphicsBackend: 'webgl',", "graphicsBackend: tauAblation.has('abl') ? 'webgpu' : 'webgl',");
    replace(
      '    if (current.frame === 12) {',
      `    if (current.frame === 12 || (scene.userData.calibrationPreparation !== undefined && scene.userData.calibrationPreparation !== scene.userData.reportedPreparation)) {
      scene.userData.reportedPreparation = scene.userData.calibrationPreparation;`,
    );
    replace(
      '...metadata,\n      startup: { ...startup.current },\n      geometryHash:',
      `...metadata,
      startup: { ...startup.current },
      emphasis: scene.userData.calibrationEmphasis,
      allocationLedger: tauAblation.has('ledger') ? readAllocationLedgers() : undefined,
      ablation: Object.fromEntries(tauAblation),
      scenePassSamples: scene.userData.calibrationScenePass?.renderTarget.samples, cameraPreparation: scene.userData.calibrationPreparation,
      geometryHash:`,
    );
  } else {
    return undefined;
  }
  return prelude + code;
}
