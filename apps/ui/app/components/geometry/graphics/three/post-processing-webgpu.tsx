import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { NodeMaterial, QuadMesh, UnsignedByteType } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import {
  colorToDirection,
  directionToColor,
  float,
  mix,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  sample,
  screenUV,
  select,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { LinearSRGBColorSpace, Vector3 } from 'three';
import type { Camera, ToneMapping, WebGLRenderTarget } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import type { ThreeCamera } from '@taucad/three/camera';
import { toThreeRenderPoint } from '@taucad/three/spatial';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.js';
import { pixelsToWorldUnits } from '#components/geometry/graphics/three/utils/spatial.utils.js';
import { useOverlayDepthRestore } from '#components/geometry/graphics/three/scene-overlay.js';
import {
  defaultPostProcessingSettings,
  resolveAoRadiusCssPixels,
} from '#components/geometry/graphics/three/post-processing-settings.js';
import type { PostProcessingSettings } from '#components/geometry/graphics/three/post-processing-settings.js';
import { createGtaoCameraAdapter } from '#components/geometry/graphics/three/gtao-depth-camera.js';

type PostProcessingPipelineResources = Readonly<{
  camera: ThreeCamera;
  outputQuad?: QuadMesh;
  outputQuadWithoutAo: QuadMesh;
  aoNode?: ReturnType<typeof ao>;
  depthRestore: QuadMesh;
  depthRestoreMaterial: NodeMaterial;
  scenePass: ReturnType<typeof pass>;
  displayMode: { value: number };
  compositeStage: { value: number };
  updateAoCamera?: () => void;
}>;

/**
 * WebGPU-only GTAO post-pipeline.
 *
 * Architecture (see `docs/research/webgpu-post-processing-performance-audit.md` R1 and
 * `docs/research/webgpu-composite-quad-depth-write-non-functional.md` for the C2 reversal):
 * - **Single scenePass** — one rasterisation produces beauty color + depth and, when AO is requested, normals. The legacy
 *   prePass (which re-rasterised the scene purely to harvest depth/normals) is gone.
 * - **Compose-based AO** — the composite quad multiplies beauty by visibility, either before tone mapping
 *   or in linear display RGB. The graph tone-maps once; the AO-only diagnostic bypasses tone mapping.
 * - **Framebuffer output** — the composite is a plain `QuadMesh` drawn through the renderer's
 *   frame target, whose output pass only encodes sRGB (`renderer.toneMapping` stays `NoToneMapping`).
 *   Overlays then draw into that same target: a `RenderPipeline` writes the canvas directly, and the
 *   next overlay's output pass would copy the frame target's stale contents over it.
 * - **Explicit depth restore** — the active scene-pass depth is sampled by a retained `QuadMesh`
 *   that writes depth into the canvas, or into a caller's target, only when a pass asks for it.
 *   The main scene is never traversed or replayed.
 * - **Demand preparation** — only the active camera and requested AO graph are created. Compilation occurs
 *   through the actual frame target on first use.
 *
 * **AA strategy.** Anti-aliasing comes from hardware MSAA on the `WebGPURenderer` (`antialias: true`). The
 * scenePass inherits 4-MSAA on both attachments; the normal MRT being multisampled is acceptable since we no
 * longer pay for a second scene rasterisation (see audit D1a). TRAA was removed because the viewport runs
 * `frameloop='demand'`: temporal AA cannot accumulate while the scene is idle, and a single un-converged TRAA
 * frame surfaces as edge graininess.
 *
 * Does **not** monkey-patch `gl.render` — `QuadMesh.render` calls `renderer.render`.
 */
// Preserve the tuned GTAO depth acceptance while making both values derive from one screen-space contract.
const gtaoThicknessToRadiusRatio = 1 / 0.09;
const aoDisplayModes = { combined: 0, ao: 1, 'no-ao': 2 } as const;

const updateGtaoSpatialScale = ({
  at,
  resources,
  size,
  viewport,
  radiusCssPixels,
}: {
  readonly at: Vector3;
  readonly resources: readonly PostProcessingPipelineResources[];
  readonly size: { readonly width: number; readonly height: number };
  readonly viewport: unknown;
  readonly radiusCssPixels: number;
}): void => {
  for (const resource of resources) {
    const radius = pixelsToWorldUnits({
      at,
      camera: resource.camera,
      pixels: radiusCssPixels,
      size,
      viewport,
    });
    if (resource.aoNode) {
      resource.aoNode.radius.value = radius;
      resource.aoNode.thickness.value = radius * gtaoThicknessToRadiusRatio;
    }
  }
};

const createOutputQuad = (fragmentNode: NodeMaterial['fragmentNode']): QuadMesh => {
  const material = new NodeMaterial();
  material.fragmentNode = fragmentNode;
  material.depthTest = false;
  material.depthWrite = false;
  return new QuadMesh(material);
};

const createPipelineResources = ({
  camera,
  gpuRenderer,
  scene,
  toneMapping,
  withAo,
}: {
  readonly camera: ThreeCamera;
  readonly gpuRenderer: WebGPURenderer;
  readonly scene: Parameters<typeof pass>[0];
  readonly toneMapping: ToneMapping;
  readonly withAo: boolean;
}): PostProcessingPipelineResources => {
  const scenePass = pass(scene, camera);
  let aoNode: ReturnType<typeof ao> | undefined;
  let outputQuad: QuadMesh | undefined;
  let outputQuadWithoutAo: QuadMesh | undefined;
  let depthRestoreMaterial: NodeMaterial | undefined;
  try {
    if (withAo) {
      scenePass.setMRT(
        mrt({
          // Beauty colour — TSL `output` is the standard fragment output (lit scene colour).
          output,
          // View-space normal encoded into a UNORM8 RGB channel; decoded below before feeding GTAO.
          // Encoding keeps the MRT attachment compact and matches the existing type override.
          normal: directionToColor(normalView),
        }),
      );
    }

    const scenePassColor = scenePass.getTextureNode('output');
    const scenePassDepth = scenePass.getTextureNode('depth');

    depthRestoreMaterial = new NodeMaterial();
    depthRestoreMaterial.colorWrite = false;
    depthRestoreMaterial.depthTest = false;
    depthRestoreMaterial.depthWrite = true;
    /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TSL texture node fluent API */
    depthRestoreMaterial.depthNode = scenePassDepth.sample(screenUV);
    const depthRestore = new QuadMesh(depthRestoreMaterial);

    const displayMode = uniform(0);
    const compositeStage = uniform(0);
    outputQuadWithoutAo = createOutputQuad(renderOutput(scenePassColor, toneMapping, LinearSRGBColorSpace));
    if (!withAo) {
      return {
        camera,
        outputQuadWithoutAo,
        depthRestore,
        depthRestoreMaterial,
        scenePass,
        displayMode,
        compositeStage,
      };
    }
    scenePass.getTexture('normal').type = UnsignedByteType;
    const scenePassNormal = sample((uv) => colorToDirection(scenePass.getTextureNode('normal').sample(uv)));

    // GTAONode rejects forward depth >= 1 as background. Pair 1-depth with
    // forward projection matrices; changing only the samples corrupts positions.
    const aoCamera = createGtaoCameraAdapter(camera, gpuRenderer.reversedDepthBuffer);
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TSL texture node fluent API.
    const aoDepth = sample((uv) =>
      gpuRenderer.reversedDepthBuffer ? scenePassDepth.sample(uv).r.oneMinus() : scenePassDepth.sample(uv).r,
    );
    aoNode = ao(aoDepth, scenePassNormal, aoCamera.camera as Camera);
    aoNode.resolutionScale = 0.5;
    // Temporal direction rotation shimmers under `frameloop='demand'` because the
    // viewport never accumulates frame-to-frame.
    aoNode.useTemporalFiltering = false;
    aoNode.samples.value = 8;
    aoNode.distanceFallOff.value = defaultPostProcessingSettings.gtaoDistanceFalloff;

    const aoTexture = aoNode.getTextureNode();
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder (`.mul`, `.sample`) is typed as `any` in `@types/three`; the runtime shape is verified via the unit + snapshot tests. */
    const aoFactor = aoTexture.sample(screenUV).r;
    const visibility = select<'float'>(displayMode.equal(2), float(1), aoFactor);
    const beforeTone = select<'float'>(compositeStage.equal(0), visibility, float(1));
    const afterTone = select<'float'>(compositeStage.equal(1), visibility, float(1));
    // Traverse beauty before AO: GTAONode resets clear alpha while rendering its
    // dependencies. Scheduling the scene from that branch would make its MRT opaque.
    // AO visualization also preserves the scene's coverage instead of filling its background.
    const beauty = renderOutput(scenePassColor.mul(vec4(vec3(beforeTone), 1)), toneMapping, LinearSRGBColorSpace).mul(
      vec4(vec3(afterTone), 1),
    );
    // Tone-map once, on the chosen side of AO; the AO-only diagnostic keeps its linear visibility.
    outputQuad = createOutputQuad(
      mix(beauty, vec4(vec3(aoFactor), scenePassColor.a), select<'float'>(displayMode.equal(1), float(1), float(0))),
    );
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

    return {
      camera,
      outputQuad,
      outputQuadWithoutAo,
      aoNode,
      depthRestore,
      depthRestoreMaterial,
      scenePass,
      displayMode,
      compositeStage,
      updateAoCamera: aoCamera.update,
    };
  } catch (error) {
    depthRestoreMaterial?.dispose();
    (outputQuad?.material as NodeMaterial | undefined)?.dispose();
    (outputQuadWithoutAo?.material as NodeMaterial | undefined)?.dispose();
    aoNode?.dispose();
    scenePass.dispose();
    throw error;
  }
};

const disposePipelineResources = (resources: readonly PostProcessingPipelineResources[]): void => {
  for (const resource of resources) {
    (resource.outputQuad?.material as NodeMaterial | undefined)?.dispose();
    (resource.outputQuadWithoutAo.material as NodeMaterial).dispose();
    resource.aoNode?.dispose();
    resource.depthRestoreMaterial.dispose();
    resource.scenePass.dispose();
  }
};

type PostProcessingWebGpuProperties = Readonly<{
  settings?: Partial<PostProcessingSettings>;
  /** The viewer's post-processing toggle: off keeps the tone-mapped scene pass and drops AO. */
  aoAllowed: boolean;
  toneMapping: ToneMapping;
}>;

function PostProcessingWebGpuActive({ settings, aoAllowed, toneMapping }: PostProcessingWebGpuProperties): ReactNode {
  const { gl, scene, invalidate, size, viewport } = useThree();
  const { aoEnabled, aoCompositeStage, radiusCssPixels, gtaoIntensity, gtaoDistanceFalloff, displayMode } = {
    ...defaultPostProcessingSettings,
    ...settings,
  };
  const cameraRig = useCameraRig();
  const resourcesRef = useRef(new Map<Camera, PostProcessingPipelineResources>());
  const selectedCameraRef = useRef<ThreeCamera>(cameraRig.activeCamera);
  const targetRef = useRef(new Vector3());
  const withAo = aoAllowed && aoEnabled && displayMode !== 'no-ao';

  // Only the current endpoint is needed now. The other projection is created on its first frame.
  // AO changes replace the endpoint resources, so beauty-only scenes own no normal attachment or GTAO graph.
  useLayoutEffect(() => {
    const resources = resourcesRef.current;
    try {
      const camera = selectedCameraRef.current;
      resources.set(
        camera,
        createPipelineResources({ camera, gpuRenderer: gl as unknown as WebGPURenderer, scene, toneMapping, withAo }),
      );
      invalidate();
    } catch (error) {
      console.error('Failed to create WebGPU post-processing pipeline', error);
    }
    return () => {
      disposePipelineResources([...resources.values()]);
      resources.clear();
    };
  }, [gl, invalidate, scene, toneMapping, withAo]);

  const updateAoSettings = useCallback(
    (selected: PostProcessingPipelineResources): void => {
      if (!selected.aoNode) {
        return;
      }
      selected.aoNode.scale.value = gtaoIntensity;
      selected.aoNode.distanceFallOff.value = gtaoDistanceFalloff;
      selected.displayMode.value = aoDisplayModes[displayMode];
      selected.compositeStage.value = aoCompositeStage === 'display' ? 1 : 0;
      updateGtaoSpatialScale({
        at: targetRef.current,
        resources: [selected],
        size,
        viewport,
        radiusCssPixels: resolveAoRadiusCssPixels(radiusCssPixels, { ...size, dpr: viewport.dpr }),
      });
      selected.updateAoCamera?.();
    },
    [aoCompositeStage, displayMode, gtaoDistanceFalloff, gtaoIntensity, radiusCssPixels, size, viewport],
  );

  useLayoutEffect(() => {
    const selected = resourcesRef.current.get(selectedCameraRef.current);
    if (selected) {
      updateAoSettings(selected);
    }
    invalidate();
  }, [invalidate, updateAoSettings]);

  const retarget = useCallback(
    (camera: ThreeCamera, snapshot: CameraDriverSnapshot): void => {
      selectedCameraRef.current = camera;
      const target = toThreeRenderPoint({ renderFrame: cameraRig.renderFrame, pointMeters: snapshot.view.target });
      targetRef.current.set(target.x, target.y, target.z);
      invalidate();
    },
    [cameraRig, invalidate],
  );
  useCameraRetarget(retarget);

  const restoreDepth = useCallback(
    (target?: WebGLRenderTarget): void => {
      const selected = resourcesRef.current.get(selectedCameraRef.current);
      if (!selected) {
        return;
      }
      const renderer = gl as unknown as WebGPURenderer;
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(target ?? null);
      try {
        selected.depthRestore.render(renderer);
      } finally {
        renderer.setRenderTarget(previousTarget);
      }
    },
    [gl],
  );
  useOverlayDepthRestore(restoreDepth);

  useFrame((state) => {
    const camera = selectedCameraRef.current;
    let selected = resourcesRef.current.get(camera);
    if (!selected) {
      selected = createPipelineResources({
        camera,
        gpuRenderer: state.gl as unknown as WebGPURenderer,
        scene,
        toneMapping,
        withAo,
      });
      resourcesRef.current.set(camera, selected);
    }
    updateAoSettings(selected);
    (selected.outputQuad ?? selected.outputQuadWithoutAo).render(state.gl as unknown as WebGPURenderer);
  }, 1);
  return null;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- WebGPU acronym matches three.js / browser API naming
export function PostProcessingWebGPU(properties: PostProcessingWebGpuProperties): ReactNode {
  const { gl } = useThree();

  if (!('isWebGPURenderer' in gl) || !gl.isWebGPURenderer) {
    return null;
  }

  return <PostProcessingWebGpuActive {...properties} />;
}
