import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { NodeMaterial, QuadMesh, RenderTarget, UnsignedByteType } from 'three/webgpu';
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
import { useCameraRetarget, useCameraRig, useRenderFrame } from '#hooks/use-graphics.js';
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
  outputQuad: QuadMesh;
  outputQuadWithoutAo: QuadMesh;
  aoNode: ReturnType<typeof ao>;
  depthRestore: QuadMesh;
  depthRestoreMaterial: NodeMaterial;
  scenePass: ScenePassWithWarmup;
  displayMode: { value: number };
  compositeStage: { value: number };
  updateAoCamera: () => void;
}>;

/**
 * WebGPU-only GTAO post-pipeline.
 *
 * Architecture (see `docs/research/webgpu-post-processing-performance-audit.md` R1 and
 * `docs/research/webgpu-composite-quad-depth-write-non-functional.md` for the C2 reversal):
 * - **Single MRT scenePass** — one rasterisation produces beauty color + view-space normal + depth. The legacy
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
 * - **Scoped warmup** — MRT scene submission restores renderer state synchronously; depth compilation remains async.
 *   Final AO and composite compilation still occurs on first use.
 *
 * **AA strategy.** Anti-aliasing comes from hardware MSAA on the `WebGPURenderer` (`antialias: true`). The
 * scenePass inherits 4-MSAA on both attachments; the normal MRT being multisampled is acceptable since we no
 * longer pay for a second scene rasterisation (see audit D1a). TRAA was removed because the viewport runs
 * `frameloop='demand'`: temporal AA cannot accumulate while the scene is idle, and a single un-converged TRAA
 * frame surfaces as edge graininess.
 *
 * Does **not** monkey-patch `gl.render` — `QuadMesh.render` calls `renderer.render`.
 */
type ScenePassWithWarmup = Readonly<{
  // Three r184's PassNode methods consume only renderer from these contexts.
  setup(context: { renderer: WebGPURenderer }): void;
  updateBefore(context: { renderer: WebGPURenderer }): void;
  dispose(): void;
}>;

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
    resource.aoNode.radius.value = radius;
    resource.aoNode.thickness.value = radius * gtaoThicknessToRadiusRatio;
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
}: {
  readonly camera: ThreeCamera;
  readonly gpuRenderer: WebGPURenderer;
  readonly scene: Parameters<typeof pass>[0];
  readonly toneMapping: ToneMapping;
}): PostProcessingPipelineResources => {
  const scenePass = pass(scene, camera);
  let aoNode: ReturnType<typeof ao> | undefined;
  let outputQuad: QuadMesh | undefined;
  let outputQuadWithoutAo: QuadMesh | undefined;
  let depthRestoreMaterial: NodeMaterial | undefined;
  try {
    scenePass.setMRT(
      mrt({
        // Beauty colour — TSL `output` is the standard fragment output (lit scene colour).
        output,
        // View-space normal encoded into a UNORM8 RGB channel; decoded below before feeding GTAO.
        // Encoding keeps the MRT attachment compact and matches the existing type override.
        normal: directionToColor(normalView),
      }),
    );

    const scenePassNormalTexture = scenePass.getTexture('normal');
    scenePassNormalTexture.type = UnsignedByteType;

    const scenePassColor = scenePass.getTextureNode('output');
    const scenePassNormal = sample((uv) => colorToDirection(scenePass.getTextureNode('normal').sample(uv)));
    const scenePassDepth = scenePass.getTextureNode('depth');

    depthRestoreMaterial = new NodeMaterial();
    depthRestoreMaterial.colorWrite = false;
    depthRestoreMaterial.depthTest = false;
    depthRestoreMaterial.depthWrite = true;
    /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TSL texture node fluent API */
    depthRestoreMaterial.depthNode = scenePassDepth.sample(screenUV);
    const depthRestore = new QuadMesh(depthRestoreMaterial);

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
    const displayMode = uniform(0);
    const compositeStage = uniform(0);

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
    // A uniform branch still schedules GTAONode's update pass. This retained output graph
    // samples only the same beauty MRT and applies the same tone mapping.
    outputQuadWithoutAo = createOutputQuad(renderOutput(scenePassColor, toneMapping, LinearSRGBColorSpace));
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

    return {
      camera,
      outputQuad,
      outputQuadWithoutAo,
      aoNode,
      depthRestore,
      depthRestoreMaterial,
      scenePass: scenePass as unknown as ScenePassWithWarmup,
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
    (resource.outputQuad.material as NodeMaterial).dispose();
    (resource.outputQuadWithoutAo.material as NodeMaterial).dispose();
    resource.aoNode.dispose();
    resource.depthRestoreMaterial.dispose();
    resource.scenePass.dispose();
  }
};

/**
 * Render an endpoint once into a throwaway target so its scene materials build their node graphs
 * and pipelines. three keys render contexts by call depth, so the scene pass must nest inside the
 * output quad's render as it does in a live frame; a top-level `updateBefore` builds a context no
 * frame uses. PassNode.compileAsync is avoided because it holds global target/MRT across awaits.
 */
const warmScenePass = (resource: PostProcessingPipelineResources, gpuRenderer: WebGPURenderer): void => {
  const previousTarget = gpuRenderer.getRenderTarget();
  const previousMrt = gpuRenderer.getMRT();
  const warmTarget = new RenderTarget(1, 1);
  try {
    gpuRenderer.setRenderTarget(warmTarget);
    resource.outputQuad.render(gpuRenderer);
  } finally {
    gpuRenderer.setRenderTarget(previousTarget);
    gpuRenderer.setMRT(previousMrt);
    warmTarget.dispose();
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
  const resourcesRef = useRef<Map<Camera, PostProcessingPipelineResources> | undefined>(undefined);
  const allResourcesRef = useRef<readonly PostProcessingPipelineResources[] | undefined>(undefined);
  const selectedCameraRef = useRef<ThreeCamera>(cameraRig.activeCamera);
  const renderFrame = useRenderFrame();

  const warmInactiveEndpoints = useCallback((): void => {
    for (const [camera, resource] of resourcesRef.current ?? []) {
      if (camera !== selectedCameraRef.current) {
        warmScenePass(resource, gl as unknown as WebGPURenderer);
      }
    }
  }, [gl]);

  useLayoutEffect(() => {
    const gpuRenderer = gl as unknown as WebGPURenderer;
    const cancellation = { cancelled: false };
    const resources: PostProcessingPipelineResources[] = [];
    try {
      for (const camera of [cameraRig.perspectiveCamera, cameraRig.orthographicCamera]) {
        resources.push(createPipelineResources({ camera, gpuRenderer, scene, toneMapping }));
      }
      allResourcesRef.current = resources;
    } catch (error) {
      disposePipelineResources(resources);
      console.error('Failed to create WebGPU post-processing pipelines', error);
      return undefined;
    }

    // Publish only after both endpoint scene passes are warm. Until then the stable
    // priority-1 owner below renders the scene directly with the active camera.
    // async-iife: bootstrap — React effects cannot await pipeline warmup; cleanup owns cancellation.
    void (async (): Promise<void> => {
      try {
        for (const resource of resources) {
          warmScenePass(resource, gpuRenderer);
        }
        // The output quads too: an unwarmed one builds its pipeline on the first frame after a
        // projection switch, a ~200 ms stall.
        await Promise.all(
          resources.flatMap((resource) =>
            [resource.depthRestore, resource.outputQuad, resource.outputQuadWithoutAo].map(async (quad) =>
              gpuRenderer.compileAsync(quad, quad.camera),
            ),
          ),
        );
      } catch (error) {
        console.error('Failed to warm WebGPU post-processing pipelines', error);
        return;
      }
      if (cancellation.cancelled) {
        return;
      }
      resourcesRef.current = new Map(resources.map((resource) => [resource.camera, resource]));
      warmInactiveEndpoints();
      invalidate();
    })();

    return (): void => {
      cancellation.cancelled = true;
      resourcesRef.current = undefined;
      allResourcesRef.current = undefined;
      disposePipelineResources(resources);
    };
  }, [cameraRig, gl, invalidate, scene, toneMapping, warmInactiveEndpoints]);

  useLayoutEffect(() => {
    for (const resource of allResourcesRef.current ?? []) {
      // oxlint-disable-next-line react/immutability -- These retained GPU uniforms are owned by this post-processing mount and are updated without rebuilding its graph.
      resource.aoNode.scale.value = gtaoIntensity;
      resource.aoNode.distanceFallOff.value = gtaoDistanceFalloff;
      resource.displayMode.value = aoDisplayModes[displayMode];
      resource.compositeStage.value = aoCompositeStage === 'display' ? 1 : 0;
    }
    if (resourcesRef.current) {
      invalidate();
    }
  }, [aoAllowed, aoCompositeStage, aoEnabled, displayMode, gtaoDistanceFalloff, gtaoIntensity, invalidate]);

  useLayoutEffect(() => {
    // A scene pass builds new geometry's materials on its first frame. The stage sets a new render
    // frame once that geometry is mounted; warm the inactive endpoint then, so a projection switch
    // does not stall ~200 ms on it.
    void renderFrame;
    warmInactiveEndpoints();
  }, [renderFrame, warmInactiveEndpoints]);

  const retarget = useCallback(
    (camera: ThreeCamera, snapshot: CameraDriverSnapshot): void => {
      selectedCameraRef.current = camera;
      const target = new Vector3(
        ...toThreeRenderPoint({ renderFrame: cameraRig.renderFrame, pointMeters: snapshot.view.target }),
      );
      updateGtaoSpatialScale({
        at: target,
        resources: allResourcesRef.current ?? [],
        size,
        viewport,
        radiusCssPixels: resolveAoRadiusCssPixels(radiusCssPixels, { ...size, dpr: viewport.dpr }),
      });
      if (resourcesRef.current) {
        invalidate();
      }
    },
    [cameraRig, invalidate, radiusCssPixels, size, viewport],
  );
  useCameraRetarget(retarget);

  const restoreDepth = useCallback(
    (target?: WebGLRenderTarget): void => {
      const selected = resourcesRef.current?.get(selectedCameraRef.current);
      if (!selected) {
        return;
      }
      const renderer = gl as unknown as WebGPURenderer;
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(target ?? null);
      try {
        // The untested full-screen quad writes every depth texel, so no clear is needed; on the
        // frame target a clear would also run an extra output pass.
        selected.depthRestore.render(renderer);
      } finally {
        renderer.setRenderTarget(previousTarget);
      }
    },
    [gl],
  );
  useOverlayDepthRestore(restoreDepth);

  useFrame((state) => {
    const selected = resourcesRef.current?.get(selectedCameraRef.current);
    if (selected) {
      selected.updateAoCamera();
      (aoAllowed && aoEnabled ? selected.outputQuad : selected.outputQuadWithoutAo).render(
        state.gl as unknown as WebGPURenderer,
      );
      return;
    }
    // ponytail: untone-mapped until the scene pass is warm; a tone-mapped fallback would need its own pass.
    state.gl.render(state.scene, state.camera);
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
