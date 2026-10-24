import { Color, Fog, FogExp2, Material, Matrix4, OrthographicCamera, Vector2, Vector3 } from 'three';
import type { Scene, ShaderMaterial, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { Pass } from 'postprocessing';
// @ts-expect-error -- n8ao 1.10.2 does not publish TypeScript declarations.
import { DepthType, N8AOPostPass } from 'n8ao';
import type { ThreeCamera } from '@taucad/three/camera';
import { sceneTransparencyRevision } from '#graphics/three/utils/scene-transparency-revision.js';

type FullscreenTriangle = { readonly material: ShaderMaterial; render(renderer: WebGLRenderer): void };

type N8AoPass = Pass & {
  configuration: {
    aoRadius: number;
    denoiseRadius: number;
    distanceFalloff: number;
    intensity: number;
    screenSpaceRadius: boolean;
    renderMode: number;
    transparencyAware: boolean;
    halfRes: boolean;
    aoTones: number;
    biasOffset: number;
    biasMultiplier: number;
    color: Color;
    colorMultiply: boolean;
    denoiseIterations: number;
    depthBufferType: number;
    gammaCorrection: boolean;
  };
  camera: ThreeCamera;
  width: number;
  height: number;
  autosetGamma: boolean;
  samples: Vector3[];
  samplesDenoise: Vector2[];
  bluenoise: Texture;
  depthTexture: Texture | undefined;
  writeTargetInternal: WebGLRenderTarget;
  readTargetInternal: WebGLRenderTarget;
  outputTargetInternal: WebGLRenderTarget;
  accumulationRenderTarget: WebGLRenderTarget;
  depthDownsampleTarget?: WebGLRenderTarget;
  transparencyRenderTargetDWFalse?: WebGLRenderTarget;
  transparencyRenderTargetDWTrue?: WebGLRenderTarget;
  effectShaderQuad: FullscreenTriangle;
  poissonBlurQuad: FullscreenTriangle;
  effectCompositerQuad: FullscreenTriangle;
  copyQuad: FullscreenTriangle;
  accumulationQuad: FullscreenTriangle;
  depthCopyPass?: FullscreenTriangle;
  depthDownsampleQuad?: FullscreenTriangle;
  detectTransparency(): void;
  configureTransparencyTarget(): void;
  configureHalfResTargets(): void;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Exact method name from the guarded N8AO dependency.
  configureAOPass(depthBufferType: number, orthographic: boolean): void;
  configureDenoisePass(depthBufferType: number, orthographic: boolean): void;
  configureEffectCompositer(depthBufferType: number, orthographic: boolean): void;
  renderTransparency(renderer: WebGLRenderer): void;
};

// Render orchestration adapted from N8AO 1.10.2 src/N8AOPostPass.js; the composite
// shader also receives the guarded weighted-sum initialization below.
// https://github.com/N8python/n8ao/blob/d3dd84bdb4e66b1f78bc7946e98b50f4e90dd19e/src/N8AOPostPass.js
// Its distributed LICENSE is CC0-1.0 (package.json labels it ISC). The source-map hash
// and depth constants are guarded by n8ao-pass.test.ts. No workspace patch is needed here.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The untyped dependency constructor is constrained to the fields verified by the installed-source test.
const n8AoConstructor = N8AOPostPass as unknown as new (scene: Scene, camera: ThreeCamera) => N8AoPass;
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Guarded exported constants from the same untyped dependency.
const depthTypes = DepthType as { Default: number; Log: number; Reverse: number };

/** Owns spatial N8AO and publishes its composite target for the viewer's output pass. */
export class ManagedN8AoPass extends n8AoConstructor {
  // The base constructor calls detectTransparency before finishing its target setup.
  // Defer detection to the first render to avoid allocating the transparency targets twice.
  private readonly isReady: boolean;
  private isDisposed = false;
  private isRendering = false;
  private classifiedThisFrame = false;
  private transparencyRevision: number | undefined;
  private readonly resolution = new Vector2();
  private readonly aoResolution = new Vector2();
  private readonly cameraPosition = new Vector3();
  private readonly projectionView = new Matrix4();
  private readonly biasAdjustment = new Vector2();
  private readonly aoColor = new Color();

  public constructor(scene: Scene, camera: ThreeCamera) {
    super(scene, camera);
    // The terminal pass reads outputTargetInternal directly; no composer swap or copy.
    this.needsSwap = false;
    this.isReady = true;
  }

  public override configureEffectCompositer(depthBufferType: number, orthographic: boolean): void {
    super.configureEffectCompositer(depthBufferType, orthographic);
    // Upstream accumulates into an uninitialized local in HALFRES. Apply this to
    // each fresh material, including those rebuilt for depth/projection changes.
    const { material } = this.effectCompositerQuad;
    material.fragmentShader = material.fragmentShader.replace('vec4 texel;', 'vec4 texel = vec4(0.0);');
  }

  // oxlint-disable-next-line eslint/max-params -- Preserve postprocessing Pass.render's upstream signature.
  public override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    _outputBuffer: WebGLRenderTarget,
    _deltaTime?: number,
    _stencilTest?: boolean,
  ): void {
    const xrEnabled = renderer.xr.enabled;
    const { autoClear } = renderer;
    renderer.xr.enabled = false;
    this.isRendering = true;
    this.classifiedThisFrame = false;
    try {
      const depthType = renderer.capabilities.logarithmicDepthBuffer
        ? depthTypes.Log
        : renderer.capabilities.reversedDepthBuffer
          ? depthTypes.Reverse
          : depthTypes.Default;
      if (this.configuration.depthBufferType !== depthType) {
        this.configuration.depthBufferType = depthType;
        const orthographic = this.camera instanceof OrthographicCamera;
        this.configureAOPass(depthType, orthographic);
        this.configureDenoisePass(depthType, orthographic);
        this.configureEffectCompositer(depthType, orthographic);
      }
      this.detectTransparency();
      this.camera.updateMatrixWorld();
      if (this.configuration.transparencyAware) {
        this.renderTransparency(renderer);
      }
      const output = this.outputTargetInternal.texture;
      if (output.type !== inputBuffer.texture.type || output.format !== inputBuffer.texture.format) {
        output.type = inputBuffer.texture.type;
        output.format = inputBuffer.texture.format;
        output.needsUpdate = true;
      }
      this.camera.getWorldPosition(this.cameraPosition);
      this.resolution.set(this.width, this.height);
      this.aoResolution
        .copy(this.resolution)
        .multiplyScalar(this.configuration.halfRes ? 0.5 : 1)
        .floor();
      const radius =
        this.configuration.aoRadius * (this.configuration.halfRes && this.configuration.screenSpaceRadius ? 0.5 : 1);
      this.renderSpatialAo(renderer, inputBuffer, radius);
      this.renderComposite(renderer, inputBuffer, radius);
    } finally {
      renderer.autoClear = autoClear;
      renderer.xr.enabled = xrEnabled;
      this.isRendering = false;
    }
  }

  public override detectTransparency(): void {
    if (!this.isReady) {
      return;
    }
    const revision = sceneTransparencyRevision(this.scene);
    if (this.isRendering && this.classifiedThisFrame) {
      return;
    }
    if (this.isRendering) {
      this.classifiedThisFrame = true;
    }
    if (this.isRendering && revision !== undefined && revision === this.transparencyRevision) {
      return;
    }

    let hasTransparency = false;
    this.scene.traverseVisible((object) => {
      if (!('material' in object)) {
        return;
      }
      const materials: unknown[] = Array.isArray(object.material) ? object.material : [object.material];
      if (
        materials.some(
          (material) =>
            material instanceof Material &&
            material.visible &&
            ((material.transparent && object.userData['treatAsOpaque'] !== true) ||
              object.userData['cannotReceiveAO'] === true),
        )
      ) {
        hasTransparency = true;
      }
    });
    // Isolation changes material transparency in place. Owned scenes notify semantic
    // changes; unknown scenes retain classification on each requested frame.
    this.configuration.transparencyAware = hasTransparency;
    this.transparencyRevision = revision;
  }

  public override configureTransparencyTarget(): void {
    if (!this.configuration.transparencyAware && this.depthCopyPass) {
      // FullScreenTriangle.dispose also disposes geometry shared by every N8AO endpoint.
      this.depthCopyPass.material.dispose();
      this.depthCopyPass = undefined;
    }
    super.configureTransparencyTarget();
  }

  public override configureHalfResTargets(): void {
    if (!this.configuration.halfRes && this.depthDownsampleQuad) {
      // Half-resolution toggles must preserve the same shared fullscreen geometry.
      this.depthDownsampleQuad.material.dispose();
      this.depthDownsampleQuad = undefined;
    }
    super.configureHalfResTargets();
    if (this.depthDownsampleTarget) {
      // Upstream puts depthBuffer on its textures; this flag belongs to the MRT owner.
      this.depthDownsampleTarget.depthBuffer = false;
    }
  }

  public override dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    for (const quad of [
      this.effectShaderQuad,
      this.poissonBlurQuad,
      this.effectCompositerQuad,
      this.copyQuad,
      this.accumulationQuad,
      this.depthCopyPass,
      this.depthDownsampleQuad,
    ]) {
      quad?.material.dispose();
    }
    // Pass.dispose only finds direct resources, missing N8AO's wrapped materials.
    // It would also dispose this borrowed texture, which belongs to EffectComposer.
    this.depthTexture = undefined;
    super.dispose();
  }

  private renderSpatialAo(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget, radius: number): void {
    const { configuration, camera } = this;
    if (configuration.halfRes) {
      const downsampleUniforms = this.depthDownsampleQuad!.material.uniforms;
      downsampleUniforms['sceneDepth']!.value = this.depthTexture;
      downsampleUniforms['resolution']!.value = this.resolution;
      downsampleUniforms['near']!.value = camera.near;
      downsampleUniforms['far']!.value = camera.far;
      downsampleUniforms['projectionMatrixInv']!.value = camera.projectionMatrixInverse;
      downsampleUniforms['viewMatrixInv']!.value = camera.matrixWorld;
      downsampleUniforms['logDepth']!.value = configuration.depthBufferType === depthTypes.Log;
      downsampleUniforms['ortho']!.value = camera instanceof OrthographicCamera;
      renderer.setRenderTarget(this.depthDownsampleTarget!);
      this.depthDownsampleQuad!.render(renderer);
    }
    const depth = configuration.halfRes ? this.depthDownsampleTarget!.textures[0] : this.depthTexture;
    const effectUniforms = this.effectShaderQuad.material.uniforms;
    effectUniforms['sceneDiffuse']!.value = inputBuffer.texture;
    effectUniforms['sceneDepth']!.value = depth;
    effectUniforms['sceneNormal']!.value = configuration.halfRes ? this.depthDownsampleTarget!.textures[1] : null;
    effectUniforms['projMat']!.value = camera.projectionMatrix;
    effectUniforms['viewMat']!.value = camera.matrixWorldInverse;
    effectUniforms['projViewMat']!.value = this.projectionView.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    effectUniforms['projectionMatrixInv']!.value = camera.projectionMatrixInverse;
    effectUniforms['viewMatrixInv']!.value = camera.matrixWorld;
    effectUniforms['cameraPos']!.value = this.cameraPosition;
    effectUniforms['biasAdjustment']!.value = this.biasAdjustment.set(
      configuration.biasOffset,
      configuration.biasMultiplier,
    );
    effectUniforms['resolution']!.value = this.aoResolution;
    effectUniforms['time']!.value = performance.now() / 1000;
    effectUniforms['samples']!.value = this.samples;
    effectUniforms['bluenoise']!.value = this.bluenoise;
    effectUniforms['radius']!.value = radius;
    effectUniforms['distanceFalloff']!.value = configuration.distanceFalloff;
    effectUniforms['near']!.value = camera.near;
    effectUniforms['far']!.value = camera.far;
    effectUniforms['ortho']!.value = camera instanceof OrthographicCamera;
    effectUniforms['screenSpaceRadius']!.value = configuration.screenSpaceRadius;
    // Viewer AO is spatial: no history is reused across camera or model motion.
    effectUniforms['frame']!.value = 0;
    renderer.setRenderTarget(this.writeTargetInternal);
    this.effectShaderQuad.render(renderer);
    for (let index = 0; index < configuration.denoiseIterations; index++) {
      [this.writeTargetInternal, this.readTargetInternal] = [this.readTargetInternal, this.writeTargetInternal];
      const blurUniforms = this.poissonBlurQuad.material.uniforms;
      blurUniforms['tDiffuse']!.value = this.readTargetInternal.texture;
      blurUniforms['sceneDepth']!.value = depth;
      blurUniforms['projMat']!.value = camera.projectionMatrix;
      blurUniforms['viewMat']!.value = camera.matrixWorldInverse;
      blurUniforms['projectionMatrixInv']!.value = camera.projectionMatrixInverse;
      blurUniforms['viewMatrixInv']!.value = camera.matrixWorld;
      blurUniforms['cameraPos']!.value = this.cameraPosition;
      blurUniforms['resolution']!.value = this.aoResolution;
      blurUniforms['time']!.value = performance.now() / 1000;
      blurUniforms['blueNoise']!.value = this.bluenoise;
      blurUniforms['radius']!.value = configuration.denoiseRadius * (configuration.halfRes ? 0.5 : 1);
      blurUniforms['worldRadius']!.value = radius;
      blurUniforms['distanceFalloff']!.value = configuration.distanceFalloff;
      blurUniforms['index']!.value = index;
      blurUniforms['poissonDisk']!.value = this.samplesDenoise;
      blurUniforms['near']!.value = camera.near;
      blurUniforms['far']!.value = camera.far;
      blurUniforms['screenSpaceRadius']!.value = configuration.screenSpaceRadius;
      renderer.setRenderTarget(this.writeTargetInternal);
      this.poissonBlurQuad.render(renderer);
    }
  }

  private renderComposite(renderer: WebGLRenderer, inputBuffer: WebGLRenderTarget, radius: number): void {
    const { configuration, camera } = this;
    const compositeUniforms = this.effectCompositerQuad.material.uniforms;
    compositeUniforms['transparencyDWFalse']!.value = this.transparencyRenderTargetDWFalse?.texture ?? null;
    compositeUniforms['transparencyDWTrue']!.value = this.transparencyRenderTargetDWTrue?.texture ?? null;
    compositeUniforms['transparencyDWTrueDepth']!.value = this.transparencyRenderTargetDWTrue?.depthTexture ?? null;
    compositeUniforms['transparencyAware']!.value = configuration.transparencyAware;
    compositeUniforms['sceneDiffuse']!.value = inputBuffer.texture;
    compositeUniforms['sceneDepth']!.value = this.depthTexture;
    compositeUniforms['aoTones']!.value = configuration.aoTones;
    compositeUniforms['near']!.value = camera.near;
    compositeUniforms['far']!.value = camera.far;
    compositeUniforms['projectionMatrixInv']!.value = camera.projectionMatrixInverse;
    compositeUniforms['viewMatrixInv']!.value = camera.matrixWorld;
    compositeUniforms['ortho']!.value = camera instanceof OrthographicCamera;
    compositeUniforms['downsampledDepth']!.value = configuration.halfRes
      ? this.depthDownsampleTarget!.textures[0]
      : this.depthTexture;
    compositeUniforms['resolution']!.value = this.resolution;
    compositeUniforms['blueNoise']!.value = this.bluenoise;
    compositeUniforms['intensity']!.value = configuration.intensity;
    compositeUniforms['renderMode']!.value = configuration.renderMode;
    compositeUniforms['screenSpaceRadius']!.value = configuration.screenSpaceRadius;
    compositeUniforms['radius']!.value = radius;
    compositeUniforms['distanceFalloff']!.value = configuration.distanceFalloff;
    compositeUniforms['gammaCorrection']!.value = this.autosetGamma
      ? this.renderToScreen
      : configuration.gammaCorrection;
    // The upsampler reads .gba as the normal. Temporal accumulation replaces
    // alpha with a blend weight, corrupting normal.z even at frame zero.
    // Spatial AO consumes the denoised RGBA result directly at either scale.
    compositeUniforms['tDiffuse']!.value = this.writeTargetInternal.texture;
    compositeUniforms['color']!.value = this.aoColor.copy(configuration.color).convertSRGBToLinear();
    compositeUniforms['colorMultiply']!.value = configuration.colorMultiply;
    compositeUniforms['cameraPos']!.value = this.cameraPosition;
    compositeUniforms['fog']!.value = this.scene.fog !== null;
    if (this.scene.fog instanceof Fog) {
      compositeUniforms['fogExp']!.value = false;
      compositeUniforms['fogNear']!.value = this.scene.fog.near;
      compositeUniforms['fogFar']!.value = this.scene.fog.far;
    } else if (this.scene.fog instanceof FogExp2) {
      compositeUniforms['fogExp']!.value = true;
      compositeUniforms['fogDensity']!.value = this.scene.fog.density;
    }
    renderer.setRenderTarget(this.outputTargetInternal);
    this.effectCompositerQuad.render(renderer);
  }
}
