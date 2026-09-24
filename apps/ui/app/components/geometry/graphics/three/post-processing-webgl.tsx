import { useCallback, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AlwaysDepth, HalfFloatType, ShaderMaterial } from 'three';
import type { Scene, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
import {
  BlendFunction,
  EffectComposer,
  EffectPass,
  Pass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import type { ThreeCamera } from '@taucad/three/camera';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.js';
import { useOverlayDepthRestore } from '#components/geometry/graphics/three/scene-overlay.js';
import { ManagedN8AoPass } from '#components/geometry/graphics/three/n8ao-pass.js';
import {
  defaultPostProcessingSettings,
  resolveAoRadiusCssPixels,
} from '#components/geometry/graphics/three/post-processing-settings.js';
import type { PostProcessingSettings } from '#components/geometry/graphics/three/post-processing-settings.js';

type ComposerResources = Readonly<{
  composer: EffectComposer;
  renderPass: RenderPass;
  depthRestore: CanvasDepthRestorePass;
  aoPasses: ReadonlyMap<ThreeCamera, ManagedN8AoPass>;
  beforeAoToneMappingEffect: ToneMappingEffect;
  beforeAoToneMappingPass: EffectPass;
  toneMappingEffect: ToneMappingEffect;
  toneMappingPass: EffectPass;
}>;

type WebGlPostProcessingSettings = Omit<PostProcessingSettings, 'gtaoDistanceFalloff' | 'gtaoIntensity'>;

const toneMappingModes = {
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
  linear: ToneMappingMode.LINEAR,
  none: ToneMappingMode.LINEAR,
} satisfies Record<PostProcessingSettings['toneMapping'], ToneMappingMode>;

const aoDisplayModes = { combined: 0, ao: 1, 'no-ao': 2 } as const;

const selectComposerCamera = (resource: ComposerResources, camera: ThreeCamera, aoEnabled: boolean): void => {
  resource.renderPass.mainCamera = camera;
  for (const [endpoint, aoPass] of resource.aoPasses) {
    // N8AO bakes camera projection into three materials. Keep those cameras fixed.
    aoPass.enabled = aoEnabled && endpoint === camera;
  }
};

const configureComposer = (
  resource: ComposerResources,
  settings: WebGlPostProcessingSettings,
  viewport: { readonly width: number; readonly height: number; readonly dpr: number },
): void => {
  for (const aoPass of resource.aoPasses.values()) {
    Object.assign(aoPass.configuration, {
      halfRes: settings.webglHalfResolution,
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
  const displayAo = settings.aoCompositeStage === 'display';
  resource.beforeAoToneMappingPass.enabled = displayAo && !rawAo;
  for (const aoPass of resource.aoPasses.values()) {
    // Pre-tone already moved beauty to the single-sample post target. N8AO's
    // internal composite can be copied back there without returning to MSAA.
    aoPass.needsSwap = !resource.beforeAoToneMappingPass.enabled;
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
    renderer.setRenderTarget(target ?? null);
    try {
      renderer.clearDepth();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
  }
}

const createComposer = ({
  camera,
  cameras,
  gl,
  scene,
}: {
  readonly camera: ThreeCamera;
  readonly cameras: readonly ThreeCamera[];
  readonly gl: WebGLRenderer;
  readonly scene: Scene;
}): ComposerResources => {
  const composer = new EffectComposer(gl, { stencilBuffer: true, multisampling: 4, frameBufferType: HalfFloatType });
  // EffectComposer starts each frame at inputBuffer. Only geometry needs MSAA;
  // fullscreen post passes consume its resolved color and use this target.
  composer.outputBuffer.samples = 0;
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
  // Tone mapping consumes color only; retargeting EffectPass would unnecessarily
  // change its camera-dependent shader defines on each projection switch.
  const toneMappingPass = new EffectPass(camera, toneMappingEffect);
  const aoPasses = new Map<ThreeCamera, ManagedN8AoPass>();
  try {
    for (const endpoint of cameras) {
      aoPasses.set(endpoint, new ManagedN8AoPass(scene, endpoint));
    }
    composer.addPass(renderPass);
    composer.addPass(depthRestore);
    composer.addPass(beforeAoToneMappingPass);
    for (const aoPass of aoPasses.values()) {
      composer.addPass(aoPass);
    }
    composer.addPass(toneMappingPass);
    return {
      composer,
      renderPass,
      depthRestore,
      aoPasses,
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

const warmComposer = (resource: ComposerResources, renderer: WebGLRenderer, activeCamera: ThreeCamera): void => {
  const target = renderer.getRenderTarget();
  const cubeFace = renderer.getActiveCubeFace();
  const mipmapLevel = renderer.getActiveMipmapLevel();
  const { renderToScreen } = resource.toneMappingPass;
  const aoEnabled = resource.aoPasses.get(activeCamera)?.enabled ?? false;
  resource.toneMappingPass.renderToScreen = false;
  try {
    for (const camera of resource.aoPasses.keys()) {
      selectComposerCamera(resource, camera, aoEnabled);
      resource.composer.render(0);
    }
  } finally {
    selectComposerCamera(resource, activeCamera, aoEnabled);
    resource.toneMappingPass.renderToScreen = renderToScreen;
    renderer.setRenderTarget(target, cubeFace, mipmapLevel);
  }
};

/** One shared composer with prewarmed, fixed-camera AO passes for both projections. */
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

  useLayoutEffect(() => {
    try {
      resourceRef.current = createComposer({
        camera: cameraRig.activeCamera,
        cameras: [cameraRig.perspectiveCamera, cameraRig.orthographicCamera],
        gl,
        scene,
      });
    } catch (error) {
      console.error('Failed to create WebGL post-processing pipeline', error);
    }
    return () => {
      resourceRef.current?.composer.dispose();
      resourceRef.current = undefined;
    };
  }, [cameraRig, gl, scene]);

  useLayoutEffect(() => {
    resourceRef.current?.composer.setSize(size.width, size.height);
    invalidate();
  }, [cameraRig, gl, invalidate, scene, size.height, size.width, viewport.dpr]);

  useLayoutEffect(() => {
    const resource = resourceRef.current;
    if (resource) {
      selectComposerCamera(resource, cameraRig.activeCamera, aoEnabled);
      configureComposer(
        resource,
        {
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
        { ...size, dpr: gl.getPixelRatio() },
      );
    }
    invalidate();
  }, [
    aoEnabled,
    aoCompositeStage,
    cameraRig,
    distanceFalloff,
    displayMode,
    gl,
    intensity,
    invalidate,
    radiusCssPixels,
    scene,
    size.height,
    size.width,
    toneMapping,
    viewport.dpr,
    webglHalfResolution,
    webglDenoiseRadiusCssPixels,
  ]);

  useLayoutEffect(() => {
    const resource = resourceRef.current;
    if (resource) {
      try {
        // Size and settings effects above run first, including on renderer/scene replacement.
        warmComposer(resource, gl, cameraRig.activeCamera);
      } catch (error) {
        resource.composer.dispose();
        resourceRef.current = undefined;
        console.error('Failed to warm WebGL post-processing pipeline', error);
      }
      invalidate();
    }
  }, [cameraRig, gl, invalidate, scene]);

  const retarget = useCallback(
    (camera: ThreeCamera): void => {
      const resource = resourceRef.current;
      if (resource) {
        selectComposerCamera(resource, camera, aoEnabled);
      }
    },
    [aoEnabled],
  );
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
