import { Material } from 'three';
import type { Scene, ShaderMaterial, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
import type { Pass } from 'postprocessing';
// @ts-expect-error -- n8ao 1.10.2 does not publish TypeScript declarations.
import { N8AOPostPass } from 'n8ao';
import type { ThreeCamera } from '@taucad/three/camera';

type FullscreenTriangle = { readonly material: ShaderMaterial };

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
  };
  depthTexture: Texture | undefined;
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
};

// Upstream and patched source identities are guarded by n8ao-pass.test.ts.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The untyped dependency constructor is constrained to the fields verified by the installed-source test.
const n8AoConstructor = N8AOPostPass as unknown as new (scene: Scene, camera: ThreeCamera) => N8AoPass;

/** Owns N8AO resources and evaluates transparent model visibility on demand frames. */
export class ManagedN8AoPass extends n8AoConstructor {
  // The base constructor calls detectTransparency before finishing its target setup.
  // Defer detection to the first render to avoid allocating the transparency targets twice.
  private readonly isReady: boolean;
  private isDisposed = false;

  public constructor(scene: Scene, camera: ThreeCamera) {
    super(scene, camera);
    // The composer may reuse the beauty target after another fullscreen pass.
    // Its retained geometry depth must never reject this color-only copy.
    this.copyQuad.material.depthTest = false;
    this.isReady = true;
  }

  // oxlint-disable-next-line eslint/max-params -- Preserve postprocessing Pass.render's upstream signature.
  public override render(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    outputBuffer: WebGLRenderTarget,
    deltaTime?: number,
    stencilTest?: boolean,
  ): void {
    // Native N8AO finishes reading input into its own outputTargetInternal before
    // the final copy. With no swap, that copy can safely overwrite the input.
    super.render(renderer, inputBuffer, this.needsSwap ? outputBuffer : inputBuffer, deltaTime, stencilTest);
  }

  public override detectTransparency(): void {
    if (!this.isReady) {
      return;
    }

    let hasTransparency = false;
    this.scene.traverseVisible((object) => {
      if (!('material' in object) || !(object.material instanceof Material) || !object.material.visible) {
        return;
      }
      if (
        (object.material.transparent && object.userData['treatAsOpaque'] !== true) ||
        object.userData['cannotReceiveAO'] === true
      ) {
        hasTransparency = true;
      }
    });
    // Upstream stops auto-detecting after the first transparent mesh. Isolation changes
    // material transparency in place, so reevaluate on each requested frame, in both directions.
    this.configuration.transparencyAware = hasTransparency;
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
}
