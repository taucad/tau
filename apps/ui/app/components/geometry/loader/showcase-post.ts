import type { PerspectiveCamera, Scene } from 'three';
import { RenderPipeline as ThreeRenderPipeline } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';
import { luminance, pass, saturate, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

/** Render pipelines shared by the showcase loaders: a bloom chain for hero tiers and a plain pass for readbacks. */

export type ShowcaseRenderPipeline = InstanceType<typeof ThreeRenderPipeline>;

export type ShowcaseBloomSettings = Readonly<{
  strength: number;
  radius: number;
  threshold: number;
  /** Coverage the halo gains per unit of luminance, so it composites over a transparent canvas. */
  alphaGain: number;
}>;

/** Restrained glow that lifts highlights without haloing the whole body. */
export const defaultBloomSettings: ShowcaseBloomSettings = {
  strength: 0.18,
  radius: 0.3,
  threshold: 1.35,
  alphaGain: 0.8,
};

/** The scene and camera a pipeline draws. */
export type ShowcaseView = Readonly<{ scene: Scene; camera: PerspectiveCamera }>;

/** Scene pass plus a bloom halo, with coverage for the halo so it composites over the page. */
export const createBloomPipeline = (
  renderer: WebGPURenderer,
  view: ShowcaseView,
  settings: ShowcaseBloomSettings = defaultBloomSettings,
): ShowcaseRenderPipeline => {
  const scenePass = pass(view.scene, view.camera);
  /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder is typed as `any` in `@types/three`; the graph is verified by the backend e2e spec. */
  const scenePassColor = scenePass.getTextureNode('output');
  const glow = bloom(scenePassColor, settings.strength, settings.radius, settings.threshold);
  const composed = scenePassColor.add(glow);
  // The canvas is transparent and premultiplied: give the halo coverage so it composites over the page.
  const alpha = scenePassColor.a.max(saturate(luminance(glow.rgb).mul(settings.alphaGain)));
  const post = new ThreeRenderPipeline(renderer);
  post.outputNode = vec4(composed.rgb, alpha);
  /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
  return post;
};

/** Scene pass only, with the renderer's tone mapping and output encoding, for offscreen readbacks. */
export const createCapturePipeline = (renderer: WebGPURenderer, view: ShowcaseView): ShowcaseRenderPipeline => {
  /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder is typed as `any` in `@types/three`. */
  const post = new ThreeRenderPipeline(renderer);
  post.outputNode = pass(view.scene, view.camera).getTextureNode('output');
  /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  return post;
};
