import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { RenderPipeline as ThreeRenderPipeline, UnsignedByteType } from 'three/webgpu';
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
import type { Camera } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeCamera } from '@taucad/three/camera';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.js';

type PostProcessingPipelineResources = Readonly<{
  camera: ThreeCamera;
  post: InstanceType<typeof ThreeRenderPipeline>;
  aoNode: ReturnType<typeof ao>;
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
 * - **No composite-quad depth wiring** — the audit's R2 attempt to wire `_quadMesh.material.depthNode` to
 *   `scenePassDepth.sample(screenUV)` was reverted: in three.js r184 the composite-quad depth output does **not**
 *   reach the canvas swap-chain depth attachment that subsequent `gl.render` calls read. Canvas depth bridging
 *   is owned by the priority-2 `SceneOverlay` traverse + cached `colorWrite=false` clone-swap depth pre-pass
 *   (see `apps/ui/app/components/geometry/graphics/three/scene-overlay.tsx`).
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

    aoNode = ao(scenePassDepth, scenePassNormal, camera as Camera);
    aoNode.resolutionScale = 0.5;
    // Temporal direction rotation shimmers under `frameloop='demand'` because the
    // viewport never accumulates frame-to-frame.
    aoNode.useTemporalFiltering = false;
    aoNode.radius.value = 0.09;
    aoNode.thickness.value = 1;
    aoNode.samples.value = 8;
    aoNode.distanceFallOff.value = 1;

    const aoTexture = aoNode.getTextureNode();

    post = new ThreeRenderPipeline(gpuRenderer);
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder (`.mul`, `.sample`) is typed as `any` in `@types/three`; the runtime shape is verified via the unit + snapshot tests. */
    post.outputNode = scenePassColor.mul(vec4(vec3(aoTexture.sample(screenUV).r), 1));
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

    return { camera, post, aoNode, scenePass: scenePass as unknown as ScenePassWithCompile };
  } catch (error) {
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
    resource.scenePass.dispose();
  }
};

function PostProcessingWebGpuActive(): ReactNode {
  const { gl, scene, invalidate } = useThree();
  const cameraRig = useCameraRig();
  const resourcesRef = useRef<Map<Camera, PostProcessingPipelineResources> | undefined>(undefined);
  const selectedCameraRef = useRef<ThreeCamera>(cameraRig.activeCamera);

  useLayoutEffect(() => {
    const gpuRenderer = gl as unknown as WebGPURenderer;
    const cancellation = { cancelled: false };
    let resources: PostProcessingPipelineResources[] = [];
    try {
      resources.push(
        createPipelineResources({ camera: cameraRig.perspectiveCamera, gpuRenderer, scene }),
        createPipelineResources({ camera: cameraRig.orthographicCamera, gpuRenderer, scene }),
      );
    } catch (error) {
      disposePipelineResources(resources);
      console.error('Failed to create WebGPU post-processing pipelines', error);
      return undefined;
    }

    // Publish only after both endpoint scene passes are warm. Until then the stable
    // priority-1 owner below renders the scene directly with the active camera.
    void (async (): Promise<void> => {
      try {
        await Promise.all(resources.map((resource) => resource.scenePass.compileAsync(gpuRenderer)));
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
      disposePipelineResources(resources);
    };
  }, [cameraRig, gl, invalidate, scene]);

  const retarget = useCallback((camera: ThreeCamera): void => {
    selectedCameraRef.current = camera;
  }, []);
  useCameraRetarget(retarget);

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
