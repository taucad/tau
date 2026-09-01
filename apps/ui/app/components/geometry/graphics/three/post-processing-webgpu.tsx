import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
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
import type { PerspectiveCamera as ThreePerspectiveCamera } from 'three';
import { useFrame, useThree } from '@react-three/fiber';

type PostProcessingPipelineResources = Readonly<{
  post: InstanceType<typeof ThreeRenderPipeline>;
  aoNode: { dispose(): void };
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
}>;

function PostProcessingWebGpuActive(): ReactNode {
  const { gl, scene, camera, invalidate } = useThree();
  const pipelineRef = useRef<PostProcessingPipelineResources | undefined>(undefined);
  const cancellationRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  useLayoutEffect(() => {
    const gpuRenderer = gl as unknown as WebGPURenderer;
    const perspectiveCamera = camera as ThreePerspectiveCamera;
    const localCancellation = { cancelled: false };
    cancellationRef.current = localCancellation;

    const scenePass = pass(scene, perspectiveCamera);
    scenePass.setMRT(
      mrt({
        // Beauty colour — TSL `output` is the standard fragment output (lit scene colour).
        output,
        // View-space normal encoded into a UNORM8 RGB channel; decoded below before feeding GTAO.
        // Encoding (vs. storing `normalView` raw) keeps the MRT attachment compact and matches
        // the existing UnsignedByteType type override applied a few lines down.
        normal: directionToColor(normalView),
      }),
    );

    const scenePassNormalTexture = scenePass.getTexture('normal');
    scenePassNormalTexture.type = UnsignedByteType;

    const scenePassColor = scenePass.getTextureNode('output');
    const scenePassNormal = sample((uv) => colorToDirection(scenePass.getTextureNode('normal').sample(uv)));
    const scenePassDepth = scenePass.getTextureNode('depth');

    const aoNode = ao(scenePassDepth, scenePassNormal, perspectiveCamera);
    aoNode.resolutionScale = 0.5;
    // D3 (perf audit): temporal direction rotation produces shimmer under `frameloop='demand'` because the
    // viewport never accumulates frame-to-frame. Re-enable only when we adopt a true history-buffer TAA pass
    // or switch the canvas to `frameloop='always'`.
    aoNode.useTemporalFiltering = false;
    aoNode.radius.value = 0.09;
    aoNode.thickness.value = 1;
    // D4 (perf audit): 8 samples is the GTAO-paper-recommended real-time floor. CAD geometry is dominated by
    // planar faces and tolerates undersampling well; bump back to 16 if corner/crevice AO degrades on dense assemblies.
    aoNode.samples.value = 8;
    aoNode.distanceFallOff.value = 1;

    const aoTexture = aoNode.getTextureNode();

    const post = new ThreeRenderPipeline(gpuRenderer);
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder (`.mul`, `.sample`) is typed as `any` in `@types/three`; the runtime shape is verified via the unit + snapshot tests. */
    // Compose AO multiplicatively with the beauty color; alpha is preserved via the explicit `vec4(_, _, _, 1)` constant.
    post.outputNode = scenePassColor.mul(vec4(vec3(aoTexture.sample(screenUV).r), 1));
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */

    // D2 (perf audit): warm the scene render pipeline off the critical path. `PassNode.compileAsync`
    // precompiles the scene's vertex+fragment pipelines so the first `post.render()` after mount does
    // not block on shader compile. `RenderPipeline` itself has no compileAsync hook; the composite
    // quad is comparatively cheap and compiles lazily on its first draw.
    // async-iife: bootstrap — useLayoutEffect cannot be async; the bootstrap publishes `pipelineRef`
    // on completion and the `cancelled` flag ensures a teardown before resolution is a no-op.
    void (async (): Promise<void> => {
      try {
        await (scenePass as unknown as ScenePassWithCompile).compileAsync(gpuRenderer);
      } catch (error) {
        console.error('Failed to warm WebGPU post-processing pipeline', error);
        return;
      }
      if (localCancellation.cancelled) {
        return;
      }
      pipelineRef.current = { post, aoNode };
      invalidate();
    })();

    return (): void => {
      localCancellation.cancelled = true;
      pipelineRef.current = undefined;
      post.dispose();
      aoNode.dispose();
    };
  }, [gl, scene, camera, invalidate]);

  useFrame(() => {
    pipelineRef.current?.post.render();
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
