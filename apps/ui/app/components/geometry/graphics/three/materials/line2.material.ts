/* oxlint-disable typescript-eslint/ban-ts-comment -- verbatim port of three.js Line2NodeMaterial.setup; TS cannot type the TSL graph body */
// @ts-nocheck -- verbatim port of three r184 Line2NodeMaterial.setup; @types/three collapses TSL generics to never

/* oxlint-disable eslint(new-cap) -- three/tsl `Fn`/`If`/`ElseIf`/`Else` are shader graph factories */
/* oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- verbatim three.js Line2NodeMaterial.setup port; three/tsl node graph is loosely typed vs strict Oxlint inference */
/* oxlint-disable unicorn-js/no-zero-fractions -- numeric literals match upstream Line2NodeMaterial.js */
/* oxlint-disable unicorn-js/prevent-abbreviations -- identifiers match upstream Line2NodeMaterial.js */

import type { Line2NodeMaterialParameters as ThreeLine2NodeMaterialParameters } from 'three/webgpu';
import { Line2NodeMaterial as ThreeLine2NodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  dashSize,
  depth,
  float,
  Fn,
  gapSize,
  If,
  materialColor,
  materialLineDashOffset,
  materialLineDashSize,
  materialLineGapSize,
  materialLineScale,
  materialLineWidth,
  materialOpacity,
  mix,
  modelViewMatrix,
  positionGeometry,
  positionView,
  screenDPR,
  screenUV,
  smoothstep,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  uv,
  vec2,
  vec3,
  vec4,
  varyingProperty,
  viewport,
  viewportTexture,
  viewZToLogarithmicDepth,
  viewZToPerspectiveDepth,
  viewZToReversedPerspectiveDepth,
} from 'three/tsl';

/**
 * Tau-owned non-mip viewport texture singleton for the CB-4 gamma-space blend below
 * (Divergence 4). Mirrors the structure of three.js's stock
 * `viewportOpaqueMipTexture` (`node_modules/three/src/nodes/display/ViewportTextureNode.js`
 * line 242) but swaps the underlying `viewportMipTexture()` (`generateMipmaps: true`) for
 * `viewportTexture()` (`generateMipmaps: false`).
 *
 * The CB-4 blend samples at level 0 (no explicit `level` argument), so the entire mip
 * pyramid that the upstream singleton regenerates every frame is pure waste — each
 * `WebGPUBackend.copyFramebufferToTexture` call performs a pass split and a `Load`
 * restart around the mid-frame `generateMipmaps`, then runs ~10 blit passes at 1080p to
 * fill levels we never read. A non-mip singleton skips the entire chain for identical
 * sampled colour at level 0. See `docs/research/webgpu-axes-hover-pipeline-stall.md`
 * (Performance section) for the measurement.
 *
 * The singleton wrapper is essential: every `Line2NodeMaterial` instance — three scene
 * axes × two halves each (six meshes), plus gizmo cube axes, plus any future fat-line
 * consumer — shares a single framebuffer copy per render rather than each allocating
 * its own. Calling `.sample(uv, level)` on the singleton produces a derived sample node
 * for each call site without duplicating the underlying framebuffer texture.
 */
// oxlint-disable-next-line @typescript-eslint/no-unsafe-call -- nodeProxy factory returns a loosely-typed Node singleton
const tauOpaqueViewportTextureSingleton = viewportTexture();

/**
 * Public sample factory that mirrors the upstream `viewportOpaqueMipTexture(uv, level)`
 * signature so call sites and tests reference the Tau singleton identically.
 *
 * Defaults `uv` to `screenUV` (matching the upstream default) and `level` to `null`
 * (the only level the CB-4 blend ever samples).
 */
export const tauOpaqueViewportTexture = (uv: typeof screenUV = screenUV, level: unknown = null): unknown =>
  // oxlint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TSL `.sample(uv, level)` returns a loosely-typed Node
  (tauOpaqueViewportTextureSingleton as { sample: (uv: unknown, level: unknown) => unknown }).sample(uv, level);

/**
 * Fat-line node material for overlays on the WebGPU viewport (`reversedDepthBuffer: true`).
 *
 * **Divergence 1 — reversed-Z near trim.** three.js `Line2NodeMaterial` estimates the
 * camera near plane as `projectionMatrix[3][2] * -0.5 / projectionMatrix[2][2]`, which
 * collapses to `-far/2` under reversed-Z perspective. Long segments with an endpoint behind
 * the camera then get an invalid trim `alpha` and `mix()` flips the line into the opposite
 * hemisphere (viewport axes at `size ≈ 50_000`, typical CAD camera distances). This subclass
 * uses TSL **`cameraNear`** so the near estimate stays **`-camera.near`** in camera space for
 * both standard and reversed depth buffers.
 *
 * **Divergence 2 — section-view clipping.** `NodeMaterial.setupHardwareClipping` activates
 * vertex-stage `gl_ClipDistance` for every WebGPU NodeMaterial whenever the device exposes
 * the `clip-distances` feature. The hardware-clipping node references `positionView`, which
 * — in the vertex stage — falls through to **`modelViewMatrix * positionLocal`**. For a
 * `LineSegmentsGeometry` instance, `positionLocal` is the static unit-quad attribute reused
 * across every instanced segment via `instanceStart`/`instanceEnd`; the per-vertex clip
 * distance therefore depends only on the line mesh's local origin (not each segment's actual
 * world position) and uniformly keeps or culls every segment. With the mesh origin on the
 * kept side, every segment passes hardware clipping and edge lines bleed onto the
 * sectioned-off half of the model. WebGL is immune because the upstream `LineMaterial`
 * `ShaderMaterial` performs an explicit `mvPosition = (position.y < 0.5) ? start : end;`
 * fixup before `<clipping_planes_vertex>`. We disable hardware clipping so the framework
 * routes through the **software fragment-stage path** (`ClippingNode.setupDefault` /
 * `setupAlphaToCoverage`), which reconstructs `positionView` per fragment from
 * `cameraProjectionMatrixInverse * v_clipSpace` — perspective-correctly interpolated across
 * the line quad and aligned with the line's actual world position.
 *
 * **Divergence 3 — renderer-aware depth encoding.** Tau instantiates three different WebGPU
 * renderer presets in `apps/ui/app/components/geometry/graphics/three/renderer.ts`:
 * `viewport` runs with `reversedDepthBuffer: true` (closer = larger clip-z, GTAO benefit);
 * `screenshot` and `offscreen` run with `logarithmicDepthBuffer: true` (uniform precision
 * across large CAD models). Surface materials fall through to `NodeMaterial.setupDepth` and
 * automatically pick `viewZToLogarithmicDepth` under the log-depth path, but a fat-line
 * material that hardcodes `material.depthNode = viewZToReversedPerspectiveDepth(...)` from
 * the factory emits reversed `[1..0]` values into a forward-Z log-depth buffer. The depth
 * comparison breaks: every occluded line fragment produces a smaller depth than the surface
 * in front of it and leaks through. The same material instance can be consumed by several
 * renderers in one frame budget (live viewport plus an out-of-band screenshot capture), so
 * the encoder must be picked per `builder` rather than locked at construction time. We
 * override `setupDepth(builder)` and dispatch on `builder.renderer.reversedDepthBuffer` /
 * `builder.renderer.logarithmicDepthBuffer`, mirroring the exact pattern three.js itself
 * uses in `PointShadowNode` and `NodeMaterial.setupDepth`. The coplanar bias is exposed via
 * the {@link depthBias} field (default `1.0` = no bias) so the gltf-edges factory can pull
 * the line forward in view-space without re-implementing the dispatch.
 *
 * **Divergence 4 — gamma-space alpha blend for backend parity.** The transparent-branch
 * `outputNode` below performs an explicit manual composition against the Tau-owned
 * non-mip viewport singleton {@link tauOpaqueViewportTexture} rather than letting the
 * standard GPU blender mix on the WebGPU `LinearSRGBColorSpace` `frameBufferTarget`.
 * Doing that mix on linear-float texels (WebGPU's `rgba16f` `frameBufferTarget`, see
 * `graphics-backend-policy.md` S6/S7) produces visibly over-saturated overlay colors
 * compared to WebGL, which blends in gamma space (either on the sRGB-encoded canvas
 * drawing buffer or via browser CSS composite of the alpha channel). For saturated
 * overlay tints at `α = 0.6` over a dark CAD background the per-channel divergence is
 * >40 sRGB units — substantially larger than the ~10-15 unit residual that the policy's
 * CB-3 entry quotes. We close the seam for line materials by transferring both operands
 * into sRGB space via `sRGBTransferOETF`, mixing, and converting the result back to
 * working color space with `sRGBTransferEOTF` before assigning `outputNode.rgb`. The
 * grid material still blends in linear space and remains the only overlay surface on
 * the deferred CB-3 path until a similar treatment lands there.
 *
 * The viewport sample uses {@link tauOpaqueViewportTexture} (a non-mip singleton over
 * `viewportTexture()`) rather than upstream `viewportOpaqueMipTexture` because the
 * blend samples at level 0 and the mip pyramid is pure waste — see the singleton
 * definition above and `docs/research/webgpu-axes-hover-pipeline-stall.md` for the
 * perf measurement.
 *
 * @see `docs/policy/webgpu-rendering-pipeline.md`
 * @see `docs/policy/graphics-backend-policy.md` (CB-3 / S7)
 * @see `docs/research/webgpu-line2-reversed-z-trim.md`
 * @see `docs/research/webgpu-fat-line-hardware-clipping-bug.md`
 * @see `docs/research/webgpu-fat-line-renderer-aware-depth.md`
 * @see `docs/research/webgpu-axes-srgb-blend-parity.md`
 */
export class Line2NodeMaterial extends ThreeLine2NodeMaterial {
  /** @inheritdoc */
  public static override get type(): string {
    return 'Line2NodeMaterial';
  }

  /**
   * Multiplicative bias applied to `positionView.z` inside {@link setupDepth}. `1.0` is the
   * identity (no bias). Values in `(0, 1)` pull the line forward in view-space (smaller
   * `|z|` because view-space Z is negative for objects in front of the camera) so the line
   * wins coplanar Z-fights against the surface it overlays; values `> 1` push the line
   * backwards. The factory layer in `gltf-edges.ts` owns the chosen value so the bias stays
   * tunable without re-implementing the renderer-aware dispatch.
   */
  public depthBias = 1;

  public constructor(parameters?: ThreeLine2NodeMaterialParameters) {
    super(parameters);
  }

  /**
   * Forces software fragment-stage clipping (`positionView` reconstructed from `clipSpace`
   * per fragment) instead of vertex-stage hardware `gl_ClipDistance`. See class JSDoc
   * "Divergence 2" for the smoking-gun chain. Bulk surface meshes elsewhere in the scene
   * keep hardware clipping; this override is line-material-local.
   *
   * The `builder` parameter mirrors the upstream signature so this stays a true override
   * even though the body ignores it.
   */
  // oxlint-disable-next-line unused-vars(no-unused-vars) -- preserves override parity with NodeMaterial.setupHardwareClipping
  public override setupHardwareClipping(builder: unknown): void {
    (this as { hardwareClipping: boolean }).hardwareClipping = false;
  }

  /**
   * Renderer-aware depth encoding (Divergence 3). Picks the matching `viewZTo*Depth`
   * encoder from `builder.renderer` flags so the line emits depth in the same space as
   * the surrounding surface rasterizer:
   *
   * - `reversedDepthBuffer` viewport          → `viewZToReversedPerspectiveDepth`
   * - `logarithmicDepthBuffer` screenshot path → `viewZToLogarithmicDepth`
   * - Standard perspective fallback           → `viewZToPerspectiveDepth`
   *
   * Orthographic cameras, MRT depth attachments, and call sites that have manually
   * assigned `material.depthNode` delegate to `super.setupDepth(builder)` so the upstream
   * decision tree (including the ortho-log branch) stays authoritative.
   *
   * The {@link depthBias} multiplier is applied to `positionView.z` before encoding so
   * coplanar edges win the depth comparison consistently across all three encodings.
   */
  public override setupDepth(builder: unknown): void {
    const { renderer, camera } = builder as {
      readonly renderer: {
        readonly reversedDepthBuffer?: boolean;
        readonly logarithmicDepthBuffer?: boolean;
        // Three.js's runtime returns `null` from `getMRT()` when no MRT is configured, but the
        // workspace lint rule (`typescript-eslint(no-restricted-types)`) bans `null` as a type
        // annotation. The optional-chain reader (`mrt?.has('depth')`) treats null and undefined
        // identically at runtime, so the typing stays lossless.
        // eslint-disable-next-line @typescript-eslint/naming-convention -- `getMRT` mirrors three.js's external Renderer API name
        getMRT?: () => { has(name: string): boolean } | undefined;
      };
      readonly camera: { readonly isPerspectiveCamera?: boolean };
    };

    const mrt = typeof renderer.getMRT === 'function' ? renderer.getMRT() : undefined;

    if (this.depthNode !== null || mrt?.has('depth') === true || camera.isPerspectiveCamera !== true) {
      super.setupDepth(builder);
      return;
    }

    const biasedZ = positionView.z.mul(this.depthBias);

    const depthNode = renderer.reversedDepthBuffer
      ? viewZToReversedPerspectiveDepth(biasedZ, cameraNear, cameraFar)
      : renderer.logarithmicDepthBuffer
        ? viewZToLogarithmicDepth(biasedZ, cameraNear, cameraFar)
        : viewZToPerspectiveDepth(biasedZ, cameraNear, cameraFar);

    depth.assign(depthNode).toStack();
  }

  /** @inheritdoc */
  public override setup(builder: unknown): void {
    const self = this as any;
    const { renderer } = builder as { readonly renderer: { readonly currentSamples: number } };

    const useAlphaToCoverage = self._useAlphaToCoverage as boolean;
    const vertexColors = self.vertexColors as boolean | undefined;
    const useDash = self._useDash as boolean;
    const useWorldUnits = self._useWorldUnits as boolean;

    const trimSegment = Fn(({ start, end }: { readonly start: any; readonly end: any }) => {
      const nearEstimate = cameraNear.negate();
      const alpha = nearEstimate.sub(start.z).div(end.z.sub(start.z));
      return vec4(mix(start.xyz, end.xyz, alpha), end.w);
    }).setLayout({
      name: 'trimSegmentCameraNear',
      type: 'vec4',
      inputs: [
        { name: 'start', type: 'vec4' },
        { name: 'end', type: 'vec4' },
      ],
    });

    self.vertexNode = Fn(() => {
      const instanceStart = attribute('instanceStart');
      const instanceEnd = attribute('instanceEnd');

      const start = vec4(modelViewMatrix.mul(vec4(instanceStart, 1.0))).toVar('start');
      const end = vec4(modelViewMatrix.mul(vec4(instanceEnd, 1.0))).toVar('end');

      if (useDash) {
        const dashScaleNode = self.dashScaleNode ? float(self.dashScaleNode) : materialLineScale;
        const offsetNode = self.offsetNode ? float(self.offsetNode) : materialLineDashOffset;

        const instanceDistanceStart = attribute('instanceDistanceStart');
        const instanceDistanceEnd = attribute('instanceDistanceEnd');

        let lineDistance = positionGeometry.y
          .lessThan(0.5)
          .select(dashScaleNode.mul(instanceDistanceStart), dashScaleNode.mul(instanceDistanceEnd));
        lineDistance = lineDistance.add(offsetNode);

        varyingProperty('float', 'lineDistance').assign(lineDistance);
      }

      if (useWorldUnits) {
        varyingProperty('vec3', 'worldStart').assign(start.xyz);
        varyingProperty('vec3', 'worldEnd').assign(end.xyz);
      }

      const aspect = viewport.z.div(viewport.w);

      const perspective = cameraProjectionMatrix.element(2).element(3).equal(-1.0);

      If(perspective, () => {
        If(start.z.lessThan(0.0).and(end.z.greaterThan(0.0)), () => {
          end.assign(trimSegment({ start, end }));
        }).ElseIf(end.z.lessThan(0.0).and(start.z.greaterThanEqual(0.0)), () => {
          start.assign(trimSegment({ start: end, end: start }));
        });
      });

      const clipStart = cameraProjectionMatrix.mul(start);
      const clipEnd = cameraProjectionMatrix.mul(end);

      const ndcStart = clipStart.xyz.div(clipStart.w);
      const ndcEnd = clipEnd.xyz.div(clipEnd.w);

      const dir = ndcEnd.xy.sub(ndcStart.xy).toVar();

      dir.x.assign(dir.x.mul(aspect));
      dir.assign(dir.normalize());

      const clip = vec4().toVar();

      if (useWorldUnits) {
        const worldDir = end.xyz.sub(start.xyz).normalize();
        const tmpFwd = mix(start.xyz, end.xyz, 0.5).normalize();
        const worldUp = worldDir.cross(tmpFwd).normalize();
        const worldFwd = worldDir.cross(worldUp);

        const worldPos = varyingProperty('vec4', 'worldPos');

        worldPos.assign(positionGeometry.y.lessThan(0.5).select(start, end));

        const hw = materialLineWidth.mul(0.5);
        worldPos.addAssign(vec4(positionGeometry.x.lessThan(0.0).select(worldUp.mul(hw), worldUp.mul(hw).negate()), 0));

        if (!useDash) {
          worldPos.addAssign(
            vec4(positionGeometry.y.lessThan(0.5).select(worldDir.mul(hw).negate(), worldDir.mul(hw)), 0),
          );

          worldPos.addAssign(vec4(worldFwd.mul(hw), 0));

          If(positionGeometry.y.greaterThan(1.0).or(positionGeometry.y.lessThan(0.0)), () => {
            worldPos.subAssign(vec4(worldFwd.mul(2.0).mul(hw), 0));
          });
        }

        clip.assign(cameraProjectionMatrix.mul(worldPos));

        const clipPose = vec3().toVar();

        clipPose.assign(positionGeometry.y.lessThan(0.5).select(ndcStart, ndcEnd));
        clip.z.assign(clipPose.z.mul(clip.w));
      } else {
        const offset = vec2(dir.y, dir.x.negate()).toVar('offset');

        dir.x.assign(dir.x.div(aspect));
        offset.x.assign(offset.x.div(aspect));

        offset.assign(positionGeometry.x.lessThan(0.0).select(offset.negate(), offset));

        If(positionGeometry.y.lessThan(0.0), () => {
          offset.assign(offset.sub(dir));
        }).ElseIf(positionGeometry.y.greaterThan(1.0), () => {
          offset.assign(offset.add(dir));
        });

        offset.assign(offset.mul(materialLineWidth));

        offset.assign(offset.div(viewport.w.div(screenDPR)));

        clip.assign(positionGeometry.y.lessThan(0.5).select(clipStart, clipEnd));

        offset.assign(offset.mul(clip.w));

        clip.assign(clip.add(vec4(offset, 0, 0)));
      }

      return clip;
    })();

    const closestLineToLine = Fn(
      ({ p1, p2, p3, p4 }: { readonly p1: any; readonly p2: any; readonly p3: any; readonly p4: any }) => {
        const p13 = p1.sub(p3);
        const p43 = p4.sub(p3);

        const p21 = p2.sub(p1);

        const d1343 = p13.dot(p43);
        const d4321 = p43.dot(p21);
        const d1321 = p13.dot(p21);
        const d4343 = p43.dot(p43);
        const d2121 = p21.dot(p21);

        const denom = d2121.mul(d4343).sub(d4321.mul(d4321));
        const numer = d1343.mul(d4321).sub(d1321.mul(d4343));

        const mua = numer.div(denom).clamp();
        const mub = d1343.add(d4321.mul(mua)).div(d4343).clamp();

        return vec2(mua, mub);
      },
    );

    self.colorNode = Fn(() => {
      const vUv = uv();

      if (useDash) {
        const dashSizeNode = self.dashSizeNode ? float(self.dashSizeNode) : materialLineDashSize;
        const gapSizeNode = self.gapSizeNode ? float(self.gapSizeNode) : materialLineGapSize;

        dashSize.assign(dashSizeNode);
        gapSize.assign(gapSizeNode);

        const vLineDistance = varyingProperty('float', 'lineDistance');

        vUv.y.lessThan(-1.0).or(vUv.y.greaterThan(1.0)).discard();

        vLineDistance.mod(dashSize.add(gapSize)).greaterThan(dashSize).discard();
      }

      const alpha = float(1).toVar('alpha');

      if (useWorldUnits) {
        const worldStart = varyingProperty('vec3', 'worldStart');
        const worldEnd = varyingProperty('vec3', 'worldEnd');

        const rayEnd = varyingProperty('vec4', 'worldPos').xyz.normalize().mul(1e5);
        const lineDir = worldEnd.sub(worldStart);
        const params = closestLineToLine({ p1: worldStart, p2: worldEnd, p3: vec3(0.0, 0.0, 0.0), p4: rayEnd });

        const pPoint1 = worldStart.add(lineDir.mul(params.x));
        const pPoint2 = rayEnd.mul(params.y);
        const delta = pPoint1.sub(pPoint2);
        const len = delta.length();
        const norm = len.div(materialLineWidth);

        if (!useDash) {
          if (useAlphaToCoverage && renderer.currentSamples > 0) {
            const dnorm = norm.fwidth();
            alpha.assign(smoothstep(dnorm.negate().add(0.5), dnorm.add(0.5), norm).oneMinus());
          } else {
            norm.greaterThan(0.5).discard();
          }
        }
      } else if (useAlphaToCoverage && renderer.currentSamples > 0) {
        const aUv = vUv.x;
        const bUv = vUv.y.greaterThan(0.0).select(vUv.y.sub(1.0), vUv.y.add(1.0));

        const len2 = aUv.mul(aUv).add(bUv.mul(bUv));

        const dlen = float(len2.fwidth()).toVar('dlen');

        If(vUv.y.abs().greaterThan(1.0), () => {
          alpha.assign(smoothstep(dlen.oneMinus(), dlen.add(1), len2).oneMinus());
        });
      } else {
        If(vUv.y.abs().greaterThan(1.0), () => {
          const rcA = vUv.x;
          const rcB = vUv.y.greaterThan(0.0).select(vUv.y.sub(1.0), vUv.y.add(1.0));
          const rcLen2 = rcA.mul(rcA).add(rcB.mul(rcB));

          rcLen2.greaterThan(1.0).discard();
        });
      }

      let lineColorNode;

      if (self.lineColorNode) {
        lineColorNode = self.lineColorNode;
      } else if (vertexColors) {
        const instanceColorStart = attribute('instanceColorStart');
        const instanceColorEnd = attribute('instanceColorEnd');

        const instanceColor = positionGeometry.y.lessThan(0.5).select(instanceColorStart, instanceColorEnd);

        lineColorNode = instanceColor.mul(materialColor);
      } else {
        lineColorNode = materialColor;
      }

      return vec4(lineColorNode, alpha);
    })();

    if (self.transparent) {
      const opacityNode = self.opacityNode ? float(self.opacityNode) : materialOpacity;

      // Divergence 4: perform the line-vs-background alpha mix in sRGB (gamma) space
      // so saturated overlay tints match WebGL's gamma-space framebuffer blend instead
      // of the raw linear-RGB blend that the WebGPU `frameBufferTarget` (rgba16f,
      // `LinearSRGBColorSpace`) would otherwise produce. Source for the viewport is the
      // Tau-owned non-mip singleton (see `tauOpaqueViewportTexture` above) — the mip
      // chain that upstream `viewportOpaqueMipTexture` generates every frame is never
      // read by this blend.
      const colorSrgb = sRGBTransferOETF(self.colorNode.rgb);
      const viewportSrgb = sRGBTransferOETF(tauOpaqueViewportTexture().rgb);
      const blendedSrgb = colorSrgb.mul(opacityNode).add(viewportSrgb.mul(opacityNode.oneMinus()));

      self.outputNode = vec4(sRGBTransferEOTF(blendedSrgb), self.colorNode.a);
    }

    // Skip `ThreeLine2NodeMaterial.setup` (which would rebuild `vertexNode`/`colorNode`/`outputNode`
    // with the upstream broken `nearEstimate = b * -0.5 / a` trim — wiping the corrected graph)
    // and call the grandparent `NodeMaterial.setup` directly to wire the vertex/fragment stages.
    // Use `ThreeLine2NodeMaterial`'s prototype chain (not a fresh `NodeMaterial` import binding) so a
    // duplicate `three/webgpu` graph cannot desynchronise `.prototype` identity across modules.
    Reflect.apply(Object.getPrototypeOf(ThreeLine2NodeMaterial.prototype).setup, this, [builder]);
  }
}
