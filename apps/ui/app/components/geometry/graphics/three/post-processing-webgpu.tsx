import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { NodeMaterial, QuadMesh, RenderPipeline as ThreeRenderPipeline, UnsignedByteType } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import {
  colorToDirection,
  directionToColor,
  mrt,
  normalView,
  output,
  pass,
  sample,
  screenUV,
  vec3,
  vec4,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { Vector3 } from 'three';
import type { Camera } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import type { ThreeCamera } from '@taucad/three/camera';
import { toThreeRenderPoint } from '@taucad/three/spatial';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.js';
import { pixelsToWorldUnits } from '#components/geometry/graphics/three/utils/spatial.utils.js';
import { useOverlayDepthRestore } from '#components/geometry/graphics/three/scene-overlay.js';

type PostProcessingPipelineResources = Readonly<{
  camera: ThreeCamera;
  post: InstanceType<typeof ThreeRenderPipeline>;
  aoNode: ReturnType<typeof ao>;
  depthRestore: QuadMesh;
  depthRestoreMaterial: NodeMaterial;
  scenePass: ScenePassWithCompile;
}>;

/**
 * WebGPU-only GTAO post-pipeline.
 *
 * Architecture (see `docs/research/webgpu-post-processing-performance-audit.md` R1 and
 * `docs/research/webgpu-composite-quad-depth-write-non-functional.md` for the C2 reversal):
 * - **Single MRT scenePass** — one rasterisation produces beauty color + view-space normal + depth. The legacy
 *   prePass (which re-rasterised the scene purely to harvest depth/normals) is gone.
 * - **Compose-based AO** — the composite quad multiplies scene color by the AO factor (`scenePassColor.mul(vec4(vec3(ao.r), 1))`)
 *   instead of routing AO through `builtinAOContext`. This is the GTAO-paper-canonical pattern recommended in
 *   `three/addons/tsl/display/GTAONode.js`.
 * - **Explicit canvas-depth restore** — the active scene-pass depth is sampled by a retained
 *   direct-to-canvas `QuadMesh` that writes depth only immediately before overlays. The main
 *   scene is never traversed or replayed.
 * - **`compileAsync` warmup** — the `RenderPipeline` is built off the critical path inside `useLayoutEffect`
 *   so the first `useFrame` after mount does not block on pipeline compile.
 *
 * **AA strategy.** Anti-aliasing comes from hardware MSAA on the `WebGPURenderer` (`antialias: true`). The
 * scenePass inherits 4-MSAA on both attachments; the normal MRT being multisampled is acceptable since we no
 * longer pay for a second scene rasterisation (see audit D1a). TRAA was removed because the viewport runs
 * `frameloop='demand'`: temporal AA cannot accumulate while the scene is idle, and a single un-converged TRAA
 * frame surfaces as edge graininess.
 *
 * Does **not** monkey-patch `gl.render` — Three's pipeline calls `renderer.render` internally.
 */
type ScenePassWithCompile = Readonly<{
  compileAsync(renderer: unknown): Promise<void>;
  dispose(): void;
}>;

const gtaoRadiusPixels = 24;
// Preserve the tuned GTAO depth acceptance while making both values derive from one screen-space contract.
const gtaoThicknessToRadiusRatio = 1 / 0.09;

const updateGtaoSpatialScale = ({
  at,
  resources,
  size,
  viewport,
}: {
  readonly at: Vector3;
  readonly resources: readonly PostProcessingPipelineResources[];
  readonly size: { readonly width: number; readonly height: number };
  readonly viewport: unknown;
}): void => {
  for (const resource of resources) {
    const radius = pixelsToWorldUnits({
      at,
      camera: resource.camera,
      pixels: gtaoRadiusPixels,
      size,
      viewport,
    });
    resource.aoNode.radius.value = radius;
    resource.aoNode.thickness.value = radius * gtaoThicknessToRadiusRatio;
  }
};

const createPipelineResources = ({
  camera,
  gpuRenderer,
  scene,
}: {
  readonly camera: ThreeCamera;
  readonly gpuRenderer: WebGPURenderer;
  readonly scene: Parameters<typeof pass>[0];
}): PostProcessingPipelineResources => {
  const scenePass = pass(scene, camera);
  let aoNode: ReturnType<typeof ao> | undefined;
  let post: InstanceType<typeof ThreeRenderPipeline> | undefined;
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

    aoNode = ao(scenePassDepth, scenePassNormal, camera as Camera);
    aoNode.resolutionScale = 0.5;
    // Temporal direction rotation shimmers under `frameloop='demand'` because the
    // viewport never accumulates frame-to-frame.
    aoNode.useTemporalFiltering = false;
    aoNode.samples.value = 8;
    aoNode.distanceFallOff.value = 1;

    const aoTexture = aoNode.getTextureNode();

    post = new ThreeRenderPipeline(gpuRenderer);
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder (`.mul`, `.sample`) is typed as `any` in `@types/three`; the runtime shape is verified via the unit + snapshot tests. */
    post.outputNode = scenePassColor.mul(vec4(vec3(aoTexture.sample(screenUV).r), 1));
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

    return {
      camera,
      post,
      aoNode,
      depthRestore,
      depthRestoreMaterial,
      scenePass: scenePass as unknown as ScenePassWithCompile,
    };
  } catch (error) {
    depthRestoreMaterial?.dispose();
    post?.dispose();
    aoNode?.dispose();
    scenePass.dispose();
    throw error;
  }
};

const disposePipelineResources = (resources: readonly PostProcessingPipelineResources[]): void => {
  for (const resource of resources) {
    resource.post.dispose();
    resource.aoNode.dispose();
    resource.depthRestoreMaterial.dispose();
    resource.scenePass.dispose();
  }
};

function PostProcessingWebGpuActive(): ReactNode {
  const { gl, scene, invalidate, size, viewport } = useThree();
  const cameraRig = useCameraRig();
  const resourcesRef = useRef<Map<Camera, PostProcessingPipelineResources> | undefined>(undefined);
  const allResourcesRef = useRef<readonly PostProcessingPipelineResources[] | undefined>(undefined);
  const selectedCameraRef = useRef<ThreeCamera>(cameraRig.activeCamera);

  useLayoutEffect(() => {
    const gpuRenderer = gl as unknown as WebGPURenderer;
    const cancellation = { cancelled: false };
    const resources: PostProcessingPipelineResources[] = [];
    try {
      resources.push(
        createPipelineResources({ camera: cameraRig.perspectiveCamera, gpuRenderer, scene }),
        createPipelineResources({ camera: cameraRig.orthographicCamera, gpuRenderer, scene }),
      );
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
        await Promise.all(
          resources.map(async (resource) => {
            await Promise.all([
              resource.scenePass.compileAsync(gpuRenderer),
              gpuRenderer.compileAsync(resource.depthRestore, resource.depthRestore.camera),
            ]);
          }),
        );
      } catch (error) {
        console.error('Failed to warm WebGPU post-processing pipelines', error);
        return;
      }
      if (cancellation.cancelled) {
        return;
      }
      resourcesRef.current = new Map(resources.map((resource) => [resource.camera, resource]));
      invalidate();
    })();

    return (): void => {
      cancellation.cancelled = true;
      resourcesRef.current = undefined;
      allResourcesRef.current = undefined;
      disposePipelineResources(resources);
    };
  }, [cameraRig, gl, invalidate, scene]);

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
      });
    },
    [cameraRig, size, viewport],
  );
  useCameraRetarget(retarget);

  const restoreDepth = useCallback((): void => {
    const selected = resourcesRef.current?.get(selectedCameraRef.current);
    if (!selected) {
      return;
    }
    const renderer = gl as unknown as WebGPURenderer;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(null);
    try {
      renderer.clearDepth();
      selected.depthRestore.render(renderer);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
  }, [gl]);
  useOverlayDepthRestore(restoreDepth);

  useFrame((state) => {
    const selected = resourcesRef.current?.get(selectedCameraRef.current);
    if (selected) {
      selected.post.render();
      return;
    }
    state.gl.render(state.scene, state.camera);
  }, 1);

  return null;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- WebGPU acronym matches three.js / browser API naming
export function PostProcessingWebGPU(): ReactNode {
  const { gl } = useThree();

  if (!('isWebGPURenderer' in gl) || !gl.isWebGPURenderer) {
    return null;
  }

  return <PostProcessingWebGpuActive />;
}
