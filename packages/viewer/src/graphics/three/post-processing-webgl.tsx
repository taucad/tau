import { useCallback, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AlwaysDepth, HalfFloatType, ShaderMaterial } from 'three';
import type { Scene, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
import {
  BlendFunction,
  EffectComposer,
  EffectPass,
  FXAAEffect,
  Pass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import type { ThreeCamera } from '@taucad/three/camera';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.jsx';
import { useOverlayDepthRestore } from '#graphics/three/scene-overlay.jsx';
import { ManagedN8AoPass } from '#graphics/three/n8ao-pass.js';
import { isCoarsePointerDevice } from '#graphics/three/utils/device-tier.js';
import { defaultPostProcessingSettings, resolveAoRadiusCssPixels } from '#graphics/three/post-processing-settings.js';
import type { PostProcessingSettings } from '#graphics/three/post-processing-settings.js';

type ComposerResources = Readonly<{
  composer: EffectComposer;
  renderPass: RenderPass;
  depthRestore: CanvasDepthRestorePass;
  aoPasses: Map<ThreeCamera, ManagedN8AoPass>;
  /**
   * Coarse-pointer tier: one AO endpoint at a time, at half resolution, in a single-sample composer.
   * Each N8AO endpoint holds ~20 B per drawing-buffer pixel, and composer MSAA another ~48.
   */
  constrained: boolean;
  scene: Scene;
  state: { sync?: ComposerSync };
  beforeAoToneMappingEffect: ToneMappingEffect;
  beforeAoToneMappingPass: EffectPass;
  toneMappingEffect: ToneMappingEffect;
  toneMappingPass: OutputAntialiasPass;
}>;

type WebGlPostProcessingSettings = Omit<PostProcessingSettings, 'gtaoDistanceFalloff' | 'gtaoIntensity'>;

const toneMappingModes = {
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
  linear: ToneMappingMode.LINEAR,
  none: ToneMappingMode.LINEAR,
} satisfies Record<PostProcessingSettings['toneMapping'], ToneMappingMode>;

const aoDisplayModes = { combined: 0, ao: 1, 'no-ao': 2 } as const;

/** @returns Whether an AO endpoint was created, which then needs the current configuration. */
const selectComposerCamera = (resource: ComposerResources, camera: ThreeCamera, aoEnabled: boolean): boolean => {
  resource.renderPass.mainCamera = camera;
  if (resource.constrained) {
    for (const [endpoint, aoPass] of resource.aoPasses) {
      if (endpoint !== camera) {
        resource.composer.removePass(aoPass);
        aoPass.dispose();
        resource.aoPasses.delete(endpoint);
      }
    }
  }
  let created = false;
  if (aoEnabled && !resource.aoPasses.has(camera)) {
    const aoPass = new ManagedN8AoPass(resource.scene, camera);
    resource.aoPasses.set(camera, aoPass);
    resource.composer.addPass(aoPass, resource.composer.passes.indexOf(resource.toneMappingPass));
    created = true;
  }
  for (const [endpoint, aoPass] of resource.aoPasses) {
    // N8AO bakes camera projection into three materials. Keep those cameras fixed.
    aoPass.enabled = aoEnabled && endpoint === camera;
  }
  resource.toneMappingPass.aoPass = aoEnabled ? resource.aoPasses.get(camera) : undefined;
  return created;
};

const configureComposer = (
  resource: ComposerResources,
  settings: WebGlPostProcessingSettings,
  viewport: {
    readonly width: number;
    readonly height: number;
    readonly dpr: number;
  },
): void => {
  for (const aoPass of resource.aoPasses.values()) {
    Object.assign(aoPass.configuration, {
      halfRes: settings.webglHalfResolution || resource.constrained,
      screenSpaceRadius: true,
      // EffectComposer gives passes physical drawing-buffer dimensions.
      aoRadius: resolveAoRadiusCssPixels(settings.radiusCssPixels, viewport) * viewport.dpr,
      denoiseRadius: settings.webglDenoiseRadiusCssPixels * viewport.dpr,
      intensity: settings.intensity,
      distanceFalloff: settings.distanceFalloff,
      renderMode: aoDisplayModes[settings.displayMode],
    });
  }
  const rawAo = settings.aoEnabled && settings.displayMode === 'ao';
  const displayAo = settings.aoEnabled && settings.displayMode !== 'no-ao' && settings.aoCompositeStage === 'display';
  resource.beforeAoToneMappingPass.enabled = displayAo && !rawAo;
  for (const aoPass of resource.aoPasses.values()) {
    // AO publishes its own composite target directly to the terminal pass.
    aoPass.needsSwap = false;
  }
  for (const effect of [resource.beforeAoToneMappingEffect, resource.toneMappingEffect]) {
    effect.mode = toneMappingModes[settings.toneMapping];
    effect.blendMode.opacity.value = settings.toneMapping === 'none' ? 0 : 1;
  }
  // Native EffectPass still encodes sRGB once when its effect opacity is zero.
  // An empty EffectPass would skip offscreen rendering, including warmup.
  if (displayAo || rawAo) {
    resource.toneMappingEffect.blendMode.opacity.value = 0;
  }
};

type ComposerSync = Readonly<{
  settings: WebGlPostProcessingSettings;
  viewport: {
    readonly width: number;
    readonly height: number;
    readonly dpr: number;
  };
}>;

/** Size the composer and apply the viewer's settings for the active camera. */
const syncComposer = (resource: ComposerResources, activeCamera: ThreeCamera, sync: ComposerSync): void => {
  const { settings, viewport } = sync;
  const previous = resource.state.sync;
  // EffectComposer sizes its buffers from the renderer's pixel ratio, which R3F has set to `viewport.dpr`.
  if (
    !previous ||
    previous.viewport.width !== viewport.width ||
    previous.viewport.height !== viewport.height ||
    previous.viewport.dpr !== viewport.dpr
  ) {
    resource.composer.setSize(viewport.width, viewport.height);
  }
  const created = selectComposerCamera(resource, activeCamera, settings.aoEnabled && settings.displayMode !== 'no-ao');
  if (previous !== sync || created) {
    configureComposer(resource, settings, viewport);
  }
  resource.state.sync = sync;
};

/** Receives the composer's stable depth texture, then writes it to the canvas or a caller's target. */
class CanvasDepthRestorePass extends Pass {
  public constructor() {
    super('TauCanvasDepthRestorePass');
    this.needsDepthTexture = true;
    this.needsSwap = false;
    this.fullscreenMaterial = new ShaderMaterial({
      colorWrite: false,
      // The test stays enabled and always passes: WebGL discards every depth write while
      // `GL_DEPTH_TEST` is disabled, so `depthTest: false` here would write no depth at all.
      depthTest: true,
      depthFunc: AlwaysDepth,
      depthWrite: true,
      uniforms: { depthBuffer: { value: null } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D depthBuffer;
        varying vec2 vUv;
        void main() {
          gl_FragDepth = texture2D(depthBuffer, vUv).r;
          gl_FragColor = vec4(0.0);
        }
      `,
    });
  }

  public override setDepthTexture(depthTexture: Texture): void {
    (this.fullscreenMaterial as ShaderMaterial).uniforms['depthBuffer']!.value = depthTexture;
  }

  /** Composer insertion is only for stable depth delivery; restoration runs after final colour. */
  public override render(): void {
    return undefined;
  }

  /** Stamp this frame's depth into `target`, or the canvas when it is omitted. */
  public restore(renderer: WebGLRenderer, target?: WebGLRenderTarget): void {
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(target ?? null);
    try {
      // AlwaysDepth replaces every depth texel; clearing first repeats the same work.
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.autoClear = previousAutoClear;
    }
  }
}

/** Encodes into the borrowed single-sample post target before the final FXAA draw. */
class OutputAntialiasPass extends Pass {
  public aoPass: ManagedN8AoPass | undefined;
  private readonly colorTarget: WebGLRenderTarget;
  private readonly toneMappingPass: EffectPass;
  private readonly antialiasPass: EffectPass;

  public constructor(camera: ThreeCamera, toneMappingEffect: ToneMappingEffect, colorTarget: WebGLRenderTarget) {
    super('TauOutputAntialiasPass');
    this.needsSwap = false;
    this.colorTarget = colorTarget;
    this.toneMappingPass = new EffectPass(camera, toneMappingEffect);
    this.antialiasPass = new EffectPass(camera, new FXAAEffect());
  }

  public override initialize(...parameters: Parameters<EffectPass['initialize']>): void {
    this.toneMappingPass.initialize(...parameters);
    this.antialiasPass.initialize(...parameters);
  }

  public override setSize(width: number, height: number): void {
    this.toneMappingPass.setSize(width, height);
    this.antialiasPass.setSize(width, height);
  }

  // oxlint-disable-next-line eslint/max-params -- Preserve postprocessing Pass.render's upstream signature.
  public override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    outputBuffer: WebGLRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean,
  ): void {
    // AO has finished reading pre-tone color before this target is reused for encoding.
    // With AO disabled, inputBuffer is geometry color and pre-tone is skipped.
    const source = this.aoPass?.enabled ? this.aoPass.outputTargetInternal : inputBuffer;
    this.toneMappingPass.render(renderer, source, this.colorTarget, deltaTime, stencilTest);
    this.antialiasPass.renderToScreen = this.renderToScreen;
    this.antialiasPass.render(renderer, this.colorTarget, outputBuffer, deltaTime, stencilTest);
  }

  public override dispose(): void {
    this.toneMappingPass.dispose();
    this.antialiasPass.dispose();
  }
}

const createComposer = ({
  camera,
  gl,
  scene,
}: {
  readonly camera: ThreeCamera;
  readonly gl: WebGLRenderer;
  readonly scene: Scene;
}): ComposerResources => {
  const constrained = isCoarsePointerDevice();
  // The constrained tier relies on the FXAA pass below instead of a multisampled HDR target.
  const composer = new EffectComposer(gl, {
    stencilBuffer: true,
    multisampling: constrained ? 0 : 4,
    frameBufferType: HalfFloatType,
  });
  // EffectComposer starts each frame at inputBuffer. Only geometry needs MSAA;
  // fullscreen post passes consume its resolved color and use this target.
  composer.outputBuffer.samples = 0;
  composer.outputBuffer.depthBuffer = false;
  composer.outputBuffer.stencilBuffer = false;
  const renderPass = new RenderPass(scene, camera);
  const depthRestore = new CanvasDepthRestorePass();
  // SRC ignores opacity; NORMAL keeps a genuine uniform-controlled bypass.
  const beforeAoToneMappingEffect = new ToneMappingEffect({
    mode: ToneMappingMode.ACES_FILMIC,
    blendFunction: BlendFunction.NORMAL,
  });
  const beforeAoToneMappingPass = new EffectPass(camera, beforeAoToneMappingEffect);
  const toneMappingEffect = new ToneMappingEffect({
    mode: ToneMappingMode.ACES_FILMIC,
    blendFunction: BlendFunction.NORMAL,
  });
  // Tone mapping consumes color only; retargeting its EffectPass would unnecessarily
  // change its camera-dependent shader defines on each projection switch.
  // MSAA precedes AO; final FXAA also covers edges introduced by its composite.
  const toneMappingPass = new OutputAntialiasPass(camera, toneMappingEffect, composer.outputBuffer);
  const aoPasses = new Map<ThreeCamera, ManagedN8AoPass>();
  try {
    composer.addPass(renderPass);
    composer.addPass(depthRestore);
    composer.addPass(beforeAoToneMappingPass);
    composer.addPass(toneMappingPass);
    return {
      scene,
      state: {},
      composer,
      renderPass,
      depthRestore,
      aoPasses,
      constrained,
      beforeAoToneMappingEffect,
      beforeAoToneMappingPass,
      toneMappingEffect,
      toneMappingPass,
    };
  } catch (error) {
    for (const pass of [renderPass, depthRestore, beforeAoToneMappingPass, ...aoPasses.values(), toneMappingPass]) {
      if (!composer.passes.includes(pass)) {
        pass.dispose();
      }
    }
    composer.dispose();
    throw error;
  }
};

/** One shared composer with fixed-camera AO passes created only when demanded. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- WebGL acronym matches the public component API.
export function PostProcessingWebGL({ settings }: { readonly settings?: Partial<PostProcessingSettings> }): undefined {
  const { gl, scene, size, viewport, invalidate } = useThree();
  const {
    aoEnabled,
    aoCompositeStage,
    radiusCssPixels,
    intensity,
    distanceFalloff,
    displayMode,
    toneMapping,
    webglHalfResolution,
    webglDenoiseRadiusCssPixels,
  } = {
    ...defaultPostProcessingSettings,
    ...settings,
  };
  const cameraRig = useCameraRig();
  const resourceRef = useRef<ComposerResources | undefined>(undefined);

  const syncRef = useRef<ComposerSync | undefined>(undefined);

  // Declared before the owner below, so a composer it replaces is gone by the time this runs and
  // its successor is synced from what this recorded, including on first mount.
  useLayoutEffect(() => {
    const sync: ComposerSync = {
      settings: {
        aoEnabled,
        aoCompositeStage,
        radiusCssPixels,
        intensity,
        distanceFalloff,
        displayMode,
        toneMapping,
        webglHalfResolution,
        webglDenoiseRadiusCssPixels,
      },
      viewport: { width: size.width, height: size.height, dpr: viewport.dpr },
    };
    syncRef.current = sync;
    const resource = resourceRef.current;
    if (resource) {
      syncComposer(resource, cameraRig.activeCamera, sync);
    }
    invalidate();
  }, [
    aoEnabled,
    aoCompositeStage,
    cameraRig,
    distanceFalloff,
    displayMode,
    intensity,
    invalidate,
    radiusCssPixels,
    size.height,
    size.width,
    toneMapping,
    viewport.dpr,
    webglHalfResolution,
    webglDenoiseRadiusCssPixels,
  ]);

  useLayoutEffect(() => {
    let resource: ComposerResources;
    try {
      resource = createComposer({
        camera: cameraRig.activeCamera,
        gl,
        scene,
      });
    } catch (error) {
      console.error('Failed to create WebGL post-processing pipeline', error);
      return undefined;
    }
    try {
      // Configure the requested endpoint. Render once in the real frame/context.
      if (syncRef.current) {
        syncComposer(resource, cameraRig.activeCamera, syncRef.current);
      }
    } catch (error) {
      resource.composer.dispose();
      console.error('Failed to configure WebGL post-processing pipeline', error);
      invalidate();
      return undefined;
    }
    resourceRef.current = resource;
    invalidate();
    return () => {
      if (resourceRef.current === resource) {
        resource.composer.dispose();
        resourceRef.current = undefined;
      }
    };
  }, [cameraRig, gl, invalidate, scene]);

  const retarget = useCallback((camera: ThreeCamera): void => {
    const resource = resourceRef.current;
    if (resource) {
      try {
        if (syncRef.current) {
          syncComposer(resource, camera, syncRef.current);
        }
      } catch (error) {
        // An endpoint failure retires the owner once; future frames use direct rendering.
        resource.composer.dispose();
        resourceRef.current = undefined;
        console.error('Failed to configure WebGL post-processing endpoint', error);
      }
    }
  }, []);
  useCameraRetarget(retarget);

  const restoreDepth = useCallback(
    (target?: WebGLRenderTarget): void => {
      resourceRef.current?.depthRestore.restore(gl, target);
    },
    [gl],
  );
  useOverlayDepthRestore(restoreDepth);

  useFrame((state, delta) => {
    const resource = resourceRef.current;
    if (resource) {
      resource.composer.render(delta);
      return;
    }
    state.gl.render(state.scene, state.camera);
  }, 1);

  return undefined;
}
