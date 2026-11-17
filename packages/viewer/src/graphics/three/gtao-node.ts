/* oxlint-disable typescript-eslint/ban-ts-comment -- port of three r184 GTAONode; its TSL graph body exhausts tsgo's union budget (TS2590) across dependent programs */
// @ts-nocheck -- port of three r184 GTAONode (see the header below); the TSL graph body is checked by its browser pixel tests, not tsgo

/**
 * Tau's copy of three r184's GTAONode (`examples/jsm/tsl/display/GTAONode.js`, MIT), changed in one place: the hard
 * thickness slab is replaced by XeGTAO's smooth 3D-distance falloff (`falloffEnd`, `falloffRange`; AO profile H2).
 *
 * Temporary. When Tau upgrades three past r184, delete this file and go back to three's own node (`ao()` from
 * `three/addons/tsl/display/GTAONode.js`). Upstream r185–r187 rewrote the node: cosine-weighted integration,
 * quadratic stepping with a sphere falloff, and fixes for half resolution and orthographic cameras. They also removed
 * `distanceFallOff`. Upstream still keeps the hard thickness slab, so set `thickness` high enough that it never cuts
 * a sample. Then re-measure halo, flank and pan against the AO thickness run in Tau Brain
 * (`research/artifacts/viewer-visual-quality-blueprint/runs/2026-11-16-ao-thickness`) and retune before shipping.
 * Tracked in Tau Brain `research/three-upgrade-tech-debt.md` § 2.
 *
 * Two smaller differences from r184, both outside the shader: `dispose()` also releases the per-instance noise
 * texture (r184 leaks it), and the depth-reconstructed normal fallback is gone because Tau always passes normals.
 *
 * Copyright © 2010-2026 three.js authors. MIT License: Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions: The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE
 * AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import {
  DataTexture,
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RedFormat,
  RenderTarget,
  RendererUtils,
  RepeatWrapping,
  TempNode,
  Vector2,
  Vector3,
} from 'three/webgpu';
import type {
  Camera,
  Node,
  NodeBuilder,
  NodeBuilderContext,
  NodeFrame,
  PassNode,
  TextureNode,
  UniformNode,
} from 'three/webgpu';
import {
  Fn,
  Loop,
  PI,
  acos,
  add,
  clamp,
  cos,
  cross,
  div,
  dot,
  float,
  getScreenPosition,
  getViewPosition,
  int,
  logarithmicDepthToViewZ,
  mat3,
  max,
  mix,
  mul,
  normalize,
  passTexture,
  pow,
  reference,
  sin,
  sqrt,
  sub,
  texture,
  textureSize,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewZToPerspectiveDepth,
} from 'three/tsl';

/** A depth or normal input GTAO samples at arbitrary UVs: a `sample()` callback or a texture node. */
export type GtaoInput = Node & { sample(uv: Node): Node };

const quadMesh = /* @__PURE__ */ new QuadMesh();
const drawingBufferSize = /* @__PURE__ */ new Vector2();

// From the Activision GTAO paper: https://www.activision.com/cdn/research/s2016_pbs_activision_occlusion.pptx
const temporalRotations = [60, 300, 180, 240, 120, 0] as const;

let rendererState: RendererUtils.RendererState | undefined;

/**
 * Ground Truth Ambient Occlusion (GTAO) with XeGTAO's smooth 3D-distance falloff. Renders visibility into its own
 * red-channel target once per frame; read it with {@link GtaoNode.getTextureNode}.
 *
 * Reference: [Practical Real-Time Strategies for Accurate Indirect Occlusion](https://www.activision.com/cdn/research/Practical_Real_Time_Strategies_for_Accurate_Indirect_Occlusion_NEW%20VERSION_COLOR.pdf).
 * @internal
 */
export class GtaoNode extends TempNode<'float'> {
  /**
   * The node type name, kept as r184's so texture names and tooling stay unchanged.
   * @returns `GTAONode`.
   */
  public static get type(): string {
    return 'GTAONode';
  }

  /** The scene's depth, in the forward `[0,1)` convention; `>= 1` is background. */
  public depthNode: GtaoInput;
  /** The scene's view-space normals. */
  public normalNode: GtaoInput;
  /** The resolution scale; `0.5` is enough for most scenes. */
  public resolutionScale = 1;
  /** The AO radius in view units. */
  public readonly radius: UniformNode<'float', number> = uniform(0.25);
  /** The effect resolution, `resolutionScale` times the drawing buffer. */
  public readonly resolution: UniformNode<'vec2', Vector2> = uniform(new Vector2());
  /** Unused: the smooth distance falloff (`falloffEnd`, `falloffRange`) replaces r184's thickness slab. */
  public readonly thickness: UniformNode<'float', number> = uniform(1);
  /**
   * Where a horizon sample stops counting, as a multiple of `radius`, measured as the 3D view-space distance from
   * the pixel to the sample. XeGTAO's smooth distance falloff replaces the hard `thickness` slab, which accepted a
   * sample only while its view-depth delta stayed inside the slab and so cut the shading off on a line where an
   * occluder's depth crossed it.
   */
  public readonly falloffEnd: UniformNode<'float', number> = uniform(22);
  /**
   * The fraction of `falloffEnd` over which a sample's weight falls linearly from 1 to 0: weight 1 up to
   * `(1 - falloffRange) * falloffEnd * radius`, 0 from `falloffEnd * radius`. Must lie in `(0,1]`.
   */
  public readonly falloffRange: UniformNode<'float', number> = uniform(0.8);
  /** Step distribution exponent; `[1,2]` attenuates the AO. */
  public readonly distanceExponent: UniformNode<'float', number> = uniform(1);
  /** Horizon fall-off in `[0,1]`; lower values give a larger AO effect. */
  public readonly distanceFallOff: UniformNode<'float', number> = uniform(1);
  /** Exponent applied to the final visibility. */
  public readonly scale: UniformNode<'float', number> = uniform(1);
  /** Sample count; below 30 uses 3 slice directions, otherwise 5. */
  public readonly samples: UniformNode<'float', number> = uniform(16);
  /** Rotate the slices per frame; requires a temporal filter to resolve. */
  public useTemporalFiltering = false;

  private readonly aoRenderTarget = new RenderTarget(1, 1, { depthBuffer: false, format: RedFormat });
  private readonly noiseTexture = generateMagicSquareNoise();
  private readonly noiseNode = texture(this.noiseTexture);
  private readonly cameraProjectionMatrix;
  private readonly cameraProjectionMatrixInverse;
  private readonly cameraNear;
  private readonly cameraFar;
  private readonly temporalDirection: UniformNode<'float', number> = uniform(0);
  private readonly material = new NodeMaterial();
  private readonly textureNode: TextureNode;

  public constructor(depthNode: GtaoInput, normalNode: GtaoInput, camera: Camera) {
    super('float');
    this.depthNode = depthNode;
    this.normalNode = normalNode;
    this.updateBeforeType = NodeUpdateType.FRAME;
    this.aoRenderTarget.texture.name = 'GTAONode.AO';
    this.cameraProjectionMatrix = uniform(camera.projectionMatrix);
    this.cameraProjectionMatrixInverse = uniform(camera.projectionMatrixInverse);
    this.cameraNear = reference('near', 'float', camera);
    this.cameraFar = reference('far', 'float', camera);
    this.material.name = 'GTAO';
    // The passTexture helper only needs a node it can render first; r184's types accept a PassNode alone.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GTAONode passes itself the same way upstream.
    this.textureNode = passTexture(this as unknown as PassNode, this.aoRenderTarget.texture);
  }

  /**
   * The AO visibility, one red channel per pixel.
   * @returns The AO visibility texture.
   */
  public getTextureNode(): TextureNode {
    return this.textureNode;
  }

  /**
   * Sizes the AO target to the drawing buffer times `resolutionScale`.
   * @param width - Drawing buffer width.
   * @param height - Drawing buffer height.
   */
  public setSize(width: number, height: number): void {
    const scaledWidth = Math.round(this.resolutionScale * width);
    const scaledHeight = Math.round(this.resolutionScale * height);
    this.resolution.value.set(scaledWidth, scaledHeight);
    this.aoRenderTarget.setSize(scaledWidth, scaledHeight);
  }

  /**
   * Renders the AO once per frame.
   * @param frame - The current node frame.
   * @returns Nothing; the node always renders.
   */
  public override updateBefore(frame: NodeFrame): undefined {
    const { renderer } = frame;
    if (!renderer) {
      return undefined;
    }
    rendererState = RendererUtils.resetRendererState(
      renderer,
      rendererState ?? RendererUtils.saveRendererState(renderer),
    );
    this.temporalDirection.value = this.useTemporalFiltering ? temporalRotations[frame.frameId % 6]! / 360 : 0;
    const size = renderer.getDrawingBufferSize(drawingBufferSize);
    this.setSize(size.width, size.height);
    quadMesh.material = this.material;
    quadMesh.name = 'AO';
    renderer.setClearColor(0xff_ff_ff, 1);
    renderer.setRenderTarget(this.aoRenderTarget);
    quadMesh.render(renderer);
    RendererUtils.restoreRendererState(renderer, rendererState);
    return undefined;
  }

  /**
   * Builds the AO material's fragment graph.
   * @param builder - The current node builder.
   * @returns The AO visibility texture.
   */
  public override setup(builder: NodeBuilder): TextureNode {
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- TSL fluent builder ported from three r184. */
    const uvNode = uv();

    const sampleDepth = (sampleUv: Node): Node<'float'> => {
      const depth = (this.depthNode.sample(sampleUv) as Node<'vec4'>).r;
      if (builder.renderer.logarithmicDepthBuffer) {
        const viewZ = logarithmicDepthToViewZ(depth, this.cameraNear, this.cameraFar);
        return viewZToPerspectiveDepth(viewZ, this.cameraNear, this.cameraFar);
      }
      return depth;
    };

    const sampleNoise = (sampleUv: Node): Node<'vec4'> => this.noiseNode.sample(sampleUv);
    const sampleNormal = (sampleUv: Node): Node<'vec3'> =>
      (this.normalNode.sample(sampleUv) as Node<'vec4'>).rgb.normalize();

    // oxlint-disable-next-line eslint/new-cap -- Three TSL shader-function factory.
    const estimate = Fn(() => {
      const depth = sampleDepth(uvNode).toVar();

      depth.greaterThanEqual(float(1)).discard();

      const viewPosition = getViewPosition(uvNode, depth, this.cameraProjectionMatrixInverse).toVar();
      const viewNormal = sampleNormal(uvNode).toVar();

      const radiusToUse = this.radius;

      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- textureSize yields an ivec2 TSL converts on division.
      const noiseResolution = textureSize(this.noiseNode, int(0)) as unknown as Node<'vec2'>;
      let noiseUv: Node<'vec2'> = vec2(uvNode.x, uvNode.y.oneMinus());
      noiseUv = noiseUv.mul(this.resolution.div(noiseResolution));

      const noiseTexel = sampleNoise(noiseUv);
      const randomVec = noiseTexel.xyz.mul(2).sub(1);
      const tangent = vec3(randomVec.xy, 0).normalize();
      const bitangent = vec3(tangent.y.mul(-1), tangent.x, 0);
      const kernelMatrix = mat3(tangent, bitangent, vec3(0, 0, 1));

      // Three r184 counts loops in float; the loop builder converts its bound.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Upstream passes the float bound unchanged.
      const directions = this.samples.lessThan(30).select(3, 5).toVar() as unknown as Node<'int'>;
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Upstream passes the float bound unchanged.
      const steps = add(this.samples, directions.sub(1)).div(directions).toVar() as unknown as Node<'int'>;

      const ao = float(0).toVar();

      // Each iteration analyzes one vertical "slice" of the 3D space around the fragment.
      const traceSlice = ({ i }: { readonly i: Node<'int'> }): void => {
        const angle = mul(div(float(i), float(directions)), PI)
          .add(this.temporalDirection)
          .toVar();
        const stepScale: Node<'float'> = add(0.5, mul(0.5, noiseTexel.w));
        const sampleDirection: Node<'vec4'> = vec4(cos(angle), sin(angle), 0, stepScale);
        sampleDirection.xyz.assign(normalize(kernelMatrix.mul(sampleDirection.xyz)));

        const viewDirection = normalize(viewPosition.xyz.negate()).toVar();
        const sliceBitangent = normalize(cross(sampleDirection.xyz, viewDirection)).toVar();
        const sliceTangent = cross(sliceBitangent, viewDirection);
        const normalInSlice = normalize(viewNormal.sub(dot(viewNormal, sliceBitangent).mul(sliceBitangent)));

        const tangentToNormalInSlice = cross(normalInSlice, sliceBitangent).toVar();
        const cosHorizons = vec2(
          dot(viewDirection, tangentToNormalInSlice),
          dot(viewDirection, tangentToNormalInSlice.negate()),
        ).toVar();

        // Tau's change: XeGTAO's smooth distance falloff. Every sample is kept; its horizon cosine is blended toward
        // the tangent-plane horizon by a weight on its 3D distance d from the pixel,
        // weight = saturate(d * falloffMul + falloffAdd): 1 up to (1 - range) * end, 0 from end.
        const tangentPlaneCosHorizons = vec2(
          dot(viewDirection, tangentToNormalInSlice),
          dot(viewDirection, tangentToNormalInSlice.negate()),
        ).toVar();
        const falloffMul = div(float(-1), mul(radiusToUse, mul(this.falloffEnd, this.falloffRange))).toVar();
        const falloffAdd = float(1).div(this.falloffRange).toVar();

        const raiseHorizon = (
          viewDelta: Node<'vec3'>,
          { cosHorizon, tangentPlaneCosHorizon }: { cosHorizon: Node<'float'>; tangentPlaneCosHorizon: Node<'float'> },
          j: Node<'int'>,
        ): void => {
          const sampleDistance: Node<'float'> = sqrt(dot(viewDelta, viewDelta)).toVar();
          const weight: Node<'float'> = clamp(add(mul(sampleDistance, falloffMul), falloffAdd), 0, 1);
          const sampleCosHorizon: Node<'float'> = mix(
            tangentPlaneCosHorizon,
            dot(viewDirection, div(viewDelta, sampleDistance)),
            weight,
          );
          const stepFallOff: Node<'float'> = mix(1, div(float(2), add(float(j), 2)), this.distanceFallOff);
          cosHorizon.addAssign(max(0, mul(sub(sampleCosHorizon, cosHorizon), stepFallOff)));
        };

        // For each slice, the inner loop marches rays to find the horizons.
        // Three r184 names the inner loop variable `j` so it does not shadow the slice index; @types/three omits `name`.
        const march: { start: number; end: Node<'int'>; type: 'int'; name: string; condition: string } = {
          start: 0,
          end: steps,
          type: 'int',
          name: 'j',
          condition: '<',
        };
        // oxlint-disable-next-line eslint/new-cap -- Three TSL loop builder.
        Loop(march, (inputs) => {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The loop passes its variable under `name`.
          const { j } = inputs as unknown as { j: Node<'int'> };
          const stepDistance: Node<'float'> = pow(div(add(float(j), 1), float(steps)), this.distanceExponent);
          const sampleViewOffset: Node<'vec3'> = mul(
            mul(mul(sampleDirection.xyz, radiusToUse), sampleDirection.w),
            stepDistance,
          );

          // The loop marches in two opposite directions (x and y) along the slice's line to find both horizons.

          const sampleScreenPositionX = getScreenPosition(
            viewPosition.add(sampleViewOffset),
            this.cameraProjectionMatrix,
          ).toVar();
          const sampleDepthX = sampleDepth(sampleScreenPositionX).toVar();
          const sampleSceneViewPositionX = getViewPosition(
            sampleScreenPositionX,
            sampleDepthX,
            this.cameraProjectionMatrixInverse,
          ).toVar();
          const viewDeltaX = sampleSceneViewPositionX.sub(viewPosition).toVar();

          raiseHorizon(viewDeltaX, { cosHorizon: cosHorizons.x, tangentPlaneCosHorizon: tangentPlaneCosHorizons.x }, j);

          const sampleScreenPositionY = getScreenPosition(
            viewPosition.sub(sampleViewOffset),
            this.cameraProjectionMatrix,
          ).toVar();
          const sampleDepthY = sampleDepth(sampleScreenPositionY).toVar();
          const sampleSceneViewPositionY = getViewPosition(
            sampleScreenPositionY,
            sampleDepthY,
            this.cameraProjectionMatrixInverse,
          ).toVar();
          const viewDeltaY = sampleSceneViewPositionY.sub(viewPosition).toVar();

          raiseHorizon(viewDeltaY, { cosHorizon: cosHorizons.y, tangentPlaneCosHorizon: tangentPlaneCosHorizons.y }, j);
        });

        // After the horizons of a slice are found, their contribution to the total occlusion is calculated.
        // The @types/three sqrt and sub are scalar-only; TSL applies both per component.
        const sinHorizons =
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Per-component vec2 math, as in r184.
          (sqrt(sub(1, cosHorizons.mul(cosHorizons) as unknown as Node<'float'>)) as unknown as Node<'vec2'>).toVar();
        const nx = dot(normalInSlice, sliceTangent);
        const ny = dot(normalInSlice, viewDirection);
        const nxb = mul(
          0.5,
          add(
            sub(acos(cosHorizons.y), acos(cosHorizons.x)),
            sub(mul(sinHorizons.x, cosHorizons.x), mul(sinHorizons.y, cosHorizons.y)),
          ),
        );
        const nyb = mul(0.5, sub(sub(2, mul(cosHorizons.x, cosHorizons.x)), mul(cosHorizons.y, cosHorizons.y)));
        const occlusion = add(mul(nx, nxb), mul(ny, nyb));
        ao.addAssign(occlusion);
      };
      // oxlint-disable-next-line eslint/new-cap -- Three TSL loop builder.
      Loop<'int'>({ start: int(0), end: directions, type: 'int', condition: '<' }, traceSlice);

      ao.assign(clamp(ao.div(directions), 0, 1));
      ao.assign(pow(ao, this.scale));

      return ao;
    });

    // NodeBuilder.getSharedContext is public in r184 but missing from @types/three.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Present on every r184 NodeBuilder.
    const shared = builder as NodeBuilder & { getSharedContext(): NodeBuilderContext };
    this.material.fragmentNode = estimate().context(shared.getSharedContext());
    this.material.needsUpdate = true;
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */

    return this.textureNode;
  }

  /** Frees the AO target, material and noise texture. Caller-owned depth and normal inputs stay alive. */
  public override dispose(): void {
    this.aoRenderTarget.dispose();
    this.material.dispose();
    this.noiseTexture.dispose();
    super.dispose();
  }
}

/**
 * Creates a GTAO node with the smooth 3D-distance falloff.
 * @internal
 * @param depthNode - The scene's forward depth.
 * @param normalNode - The scene's view-space normals.
 * @param camera - The camera whose projection matches the depth convention.
 * @returns The GTAO node.
 */
export const gtao = (depthNode: GtaoInput, normalNode: GtaoInput, camera: Camera): GtaoNode =>
  new GtaoNode(depthNode, normalNode, camera);

/**
 * Generates GTAO's magic-square rotation noise texture.
 * @param size - The noise size; even sizes round up to the next odd size.
 * @returns The noise texture.
 */
function generateMagicSquareNoise(size = 5): DataTexture {
  const noiseSize = Math.floor(size) % 2 === 0 ? Math.floor(size) + 1 : Math.floor(size);
  const magicSquare = generateMagicSquare(noiseSize);
  const noiseSquareSize = magicSquare.length;
  const data = new Uint8Array(noiseSquareSize * 4);

  for (let index = 0; index < noiseSquareSize; ++index) {
    const angle = (2 * Math.PI * magicSquare[index]!) / noiseSquareSize;
    const randomVec = new Vector3(Math.cos(angle), Math.sin(angle), 0).normalize();
    data[index * 4] = (randomVec.x * 0.5 + 0.5) * 255;
    data[index * 4 + 1] = (randomVec.y * 0.5 + 0.5) * 255;
    data[index * 4 + 2] = 127;
    data[index * 4 + 3] = 255;
  }

  const noiseTexture = new DataTexture(data, noiseSize, noiseSize);
  noiseTexture.wrapS = RepeatWrapping;
  noiseTexture.wrapT = RepeatWrapping;
  noiseTexture.needsUpdate = true;
  return noiseTexture;
}

/**
 * Computes the magic square that orders the noise rotations.
 * @param size - The noise size; even sizes round up to the next odd size.
 * @returns The magic square values, row-major.
 */
function generateMagicSquare(size: number): number[] {
  const noiseSize = Math.floor(size) % 2 === 0 ? Math.floor(size) + 1 : Math.floor(size);
  const noiseSquareSize = noiseSize * noiseSize;
  const magicSquare = Array.from<number>({ length: noiseSquareSize }).fill(0);
  let i = Math.floor(noiseSize / 2);
  let j = noiseSize - 1;

  for (let number_ = 1; number_ <= noiseSquareSize; ) {
    if (i === -1 && j === noiseSize) {
      j = noiseSize - 2;
      i = 0;
    } else {
      if (j === noiseSize) {
        j = 0;
      }
      if (i < 0) {
        i = noiseSize - 1;
      }
    }

    if (magicSquare[i * noiseSize + j] === 0) {
      magicSquare[i * noiseSize + j] = number_++;
    } else {
      j -= 2;
      i++;
      continue;
    }

    j++;
    i--;
  }

  return magicSquare;
}
