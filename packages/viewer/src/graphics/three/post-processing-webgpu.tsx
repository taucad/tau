import { Line2NodeMaterial } from '#graphics/three/materials/line2.material.js';
import { createSurfaceReuse } from '#graphics/three/surface-reuse.js';
import { createViewportFxaa } from '#graphics/three/fxaa.js';
import { scheduleCameraPreparation } from '#graphics/three/camera-preparation.js';
import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { NodeMaterial, QuadMesh, RenderTarget, RendererUtils, UnsignedByteType, NodeUpdateType } from 'three/webgpu';
import type { Node, WebGPURenderer } from 'three/webgpu';
import {
  colorToDirection,
  directionToColor,
  float,
  mix,
  mrt,
  normalView,
  output,
  pass,
  renderOutput,
  rtt,
  sample,
  screenUV,
  select,
  texture,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { encodeAoNormal, sampleAoNormal } from '#graphics/three/ao-normal.js';
import { createAoDenoise } from '#graphics/three/ao-denoise.js';
import {
  Mesh,
  AlwaysDepth,
  WebGLCoordinateSystem,
  HalfFloatType,
  RedFormat,
  RGFormat,
  RGBAFormat,
  LinearSRGBColorSpace,
  NoToneMapping,
  NeutralToneMapping,
  SRGBColorSpace,
  DepthTexture,
  UnsignedInt248Type,
  DepthStencilFormat,
  Vector2,
  Vector3,
} from 'three';
import type { Camera, Texture, ToneMapping, WebGLRenderTarget, Scene } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import type { ThreeCamera } from '@taucad/three/camera';
import { toThreeRenderPoint } from '@taucad/three/spatial';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.jsx';
import { pixelsToWorldUnits } from '#graphics/three/utils/spatial.utils.js';
import { useOverlayDepthRestore } from '#graphics/three/scene-overlay.jsx';
import { defaultPostProcessingSettings, resolveAoRadiusCssPixels } from '#graphics/three/post-processing-settings.js';
import type { PostProcessingSettings } from '#graphics/three/post-processing-settings.js';
import { retireTransmissionCopy } from '#graphics/three/transmission-retirement.js';
import { createGtaoCameraAdapter } from '#graphics/three/gtao-depth-camera.js';
import { createLogDepthAoAdapter } from '#graphics/three/gtao-log-depth.js';

type PostProcessingPipelineResources = Readonly<{
  camera: ThreeCamera;
  setCamera: (camera: ThreeCamera) => void;
  frame: LinearFrame;
  outputQuad: QuadMesh;
  renderEdges: () => void;
  prepareSurfaceReuse?: (width: number, height: number) => void;
  disposeSurfaceReuse?: () => void;
  aoNode?: ReturnType<typeof ao>;
  denoiseNode?: ReturnType<typeof createAoDenoise>;
  denoiseInput?: ReturnType<typeof rtt>;
  depthRestore: QuadMesh;
  depthRestoreMaterial: NodeMaterial;
  scenePass: ReturnType<typeof pass>;
  displayMode: { value: number };
  compositeStage: { value: number };
  updateAoCamera?: (camera: ThreeCamera) => void;
}>;

/** One linear, single-sample frame survives all CAD draws; only the final quad encodes output. */
type LinearFrame = {
  target: RenderTarget;
  output: QuadMesh;
  depth: QuadMesh;
  previousTarget: ReturnType<WebGPURenderer['getRenderTarget']>;
  pending: boolean;
  sharedDepth: boolean;
  depthPrepared: boolean;
};

// Preserve the tuned GTAO depth acceptance while making both values derive from one screen-space contract.
const gtaoThicknessToRadiusRatio = 1 / 0.09;
const aoDisplayModes = { combined: 0, ao: 1, 'no-ao': 2 } as const;

const updateGtaoSpatialScale = ({
  at,
  resources,
  size,
  viewport,
  radiusCssPixels,
}: {
  readonly at: Vector3;
  readonly resources: readonly PostProcessingPipelineResources[];
  readonly size: { readonly width: number; readonly height: number };
  readonly viewport: unknown;
  readonly radiusCssPixels: number;
}): void => {
  for (const resource of resources) {
    const radius = pixelsToWorldUnits({
      at,
      camera: resource.camera,
      pixels: radiusCssPixels,
      size,
      viewport,
    });
    if (resource.aoNode) {
      resource.aoNode.radius.value = radius;
      resource.aoNode.thickness.value = radius * gtaoThicknessToRadiusRatio;
      if (resource.denoiseNode) {
        resource.denoiseNode.depthPhi.value = radius * 0.1;
      }
    }
  }
};

const createOutputQuad = (fragmentNode: NodeMaterial['fragmentNode'], depthMaterial?: NodeMaterial): QuadMesh => {
  const material = new NodeMaterial();
  material.fragmentNode = fragmentNode;
  material.depthTest = false;
  material.depthWrite = false;
  if (depthMaterial) {
    material.depthNode = depthMaterial.depthNode;
    material.depthTest = depthMaterial.depthTest;
    material.depthFunc = AlwaysDepth;
    material.depthWrite = true;
  }
  return new QuadMesh(material);
};

/**
 * Release the RTT resources omitted by Three r184's inherited Node.dispose.
 * @param input - Owned low-resolution AO intermediate, if this graph includes AO.
 */
const disposeOwnedRtt = (input: ReturnType<typeof rtt> | undefined): void => {
  if (!input) {
    return;
  }
  // Backport upstream RTTNode.dispose (Three 0978e2b62). A source-hash test guards
  // this private seam; remove the backport when upgrading to the upstream fix.
  // The quad geometry is shared by Three and must not be disposed here.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exact installed RTTNode source is fingerprinted in the adjacent test.
  const owned = input as typeof input & {
    _quadMesh: { material: NodeMaterial };
  };
  input.renderTarget?.dispose();
  owned._quadMesh.material.dispose();
  input.dispose();
};

/**
 * Release the per-instance noise texture omitted by Three r184's GTAONode.dispose.
 * @param node - Owned AO estimator, if this graph includes AO.
 */
const disposeAoNode = (node: ReturnType<typeof ao> | undefined): void => {
  if (!node) {
    return;
  }
  // Upstream now releases this texture. Keep borrowed depth/normal inputs alive.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exact installed GTAONode source is fingerprinted in the adjacent test.
  const owned = node as typeof node & {
    _noiseNode: { value: Texture };
  };
  owned._noiseNode.value.dispose();
  node.dispose();
};

const createLinearFrame = (renderer: WebGPURenderer, toneMapping: ToneMapping): LinearFrame => {
  // Neutral tone mapping has already bounded the scene to display range. Hardware
  // sRGB storage preserves linear-light blending with half the color bandwidth.
  // Keep HDR storage for unbounded/other tone mappings until separately qualified.
  const compactFrame = toneMapping === NeutralToneMapping;
  const target = new RenderTarget(1, 1, {
    type: compactFrame ? UnsignedByteType : HalfFloatType,
    samples: 0,
    stencilBuffer: true,
  });
  target.texture.colorSpace = compactFrame ? SRGBColorSpace : LinearSRGBColorSpace;
  target.texture.name = 'Tau linear frame';
  target.depthTexture = new DepthTexture(1, 1, UnsignedInt248Type);
  target.depthTexture.format = DepthStencilFormat;
  const finalOutput = createOutputQuad(renderOutput(texture(target.texture), NoToneMapping, renderer.outputColorSpace));
  finalOutput.name = 'Tau final output';
  const depthMaterial = new NodeMaterial();
  depthMaterial.colorWrite = false;
  depthMaterial.depthTest = renderer.coordinateSystem === WebGLCoordinateSystem;
  depthMaterial.depthFunc = AlwaysDepth;
  depthMaterial.depthWrite = true;
  depthMaterial.depthNode = texture(target.depthTexture, screenUV);
  const frame: LinearFrame = {
    target,
    output: finalOutput,
    depth: new QuadMesh(depthMaterial),
    previousTarget: null,
    pending: false,
    sharedDepth: false,
    depthPrepared: false,
  };
  return frame;
};

const disposeLinearFrame = (frame: LinearFrame, renderer: WebGPURenderer): void => {
  if (frame.pending) {
    renderer.setRenderTarget(frame.previousTarget);
    frame.pending = false;
  }
  frame.target.dispose();
  (frame.output.material as NodeMaterial).dispose();
  (frame.depth.material as NodeMaterial).dispose();
};

/** Reacquire camera-dependent inputs once per composition, including same-frame preparation and capture. */
const updatePerComposition = (
  quad: QuadMesh,
  nodes: ReadonlyArray<ReturnType<typeof pass> | ReturnType<typeof ao>>,
): void => {
  const composition = { value: 0 };
  for (const node of nodes) {
    const update = node.updateBefore.bind(node);
    let acquired = -1;
    node.updateBeforeType = NodeUpdateType.OBJECT;
    node.updateBefore = (frame) => {
      if (acquired === composition.value) {
        return;
      }
      const previous = acquired;
      acquired = composition.value;
      try {
        return update(frame);
      } catch (error) {
        acquired = previous;
        throw error;
      }
    };
  }
  const render = quad.render.bind(quad);
  quad.render = (renderer) => {
    composition.value++;
    render(renderer);
  };
};

const createPipelineResources = ({
  camera,
  gpuRenderer,
  scene,
  toneMapping,
  withAo,
  antialias,
}: {
  readonly camera: ThreeCamera;
  readonly gpuRenderer: WebGPURenderer;
  readonly scene: Scene;
  readonly toneMapping: ToneMapping;
  readonly withAo: boolean;
  /** Filter the beauty-only output with FXAA; off draws the tone-mapped scene pass as it is. */
  readonly antialias: boolean;
}): PostProcessingPipelineResources => {
  // Four decoded normal taps save memory on native GPU, but cost more than
  // hardware filtering on node WebGL2 in the matched 5K comparison.
  const compactNormals = gpuRenderer.coordinateSystem !== WebGLCoordinateSystem;
  const scenePass = pass(scene, camera, { samples: 0 });
  // One scene, two draw phases: CAD coverage is not input to AO or surface AA.
  // Preserve the renderer owner's depth-bias hook and restore it even after errors.
  let delegate: ReturnType<WebGPURenderer['getRenderObjectFunction']> = null;
  // oxlint-disable-next-line max-params -- Three's supported draw callback, without per-draw rest-array allocations.
  const surfaces: NonNullable<ReturnType<WebGPURenderer['getRenderObjectFunction']>> = (
    object,
    root,
    view,
    geometry,
    material,
    group,
    lights,
    clipping,
    passId,
  ) => {
    if (!(material instanceof Line2NodeMaterial)) {
      if (delegate) {
        delegate(object, root, view, geometry, material, group, lights, clipping, passId);
      } else {
        gpuRenderer.renderObject(object, root, view, geometry, material, group, lights, clipping, passId);
      }
    }
  };
  // oxlint-disable-next-line max-params -- Three's supported draw callback, without per-draw rest-array allocations.
  const edges: NonNullable<ReturnType<WebGPURenderer['getRenderObjectFunction']>> = (
    object,
    root,
    view,
    geometry,
    material,
    group,
    lights,
    clipping,
    passId,
  ) => {
    if (material instanceof Line2NodeMaterial) {
      if (delegate) {
        delegate(object, root, view, geometry, material, group, lights, clipping, passId);
      } else {
        gpuRenderer.renderObject(object, root, view, geometry, material, group, lights, clipping, passId);
      }
    }
  };
  const acquireSurfaces = scenePass.updateBefore.bind(scenePass);
  scenePass.updateBefore = (nodeFrame) => {
    delegate = gpuRenderer.getRenderObjectFunction();
    gpuRenderer.setRenderObjectFunction(surfaces);
    try {
      return acquireSurfaces(nodeFrame);
    } finally {
      gpuRenderer.setRenderObjectFunction(delegate);
      delegate = null;
    }
  };
  const renderEdges = (): void => {
    delegate = gpuRenderer.getRenderObjectFunction();
    const { background } = scene;
    const { autoClear } = gpuRenderer;
    const mapping = gpuRenderer.toneMapping;
    scene.background = null;
    gpuRenderer.autoClear = false;
    gpuRenderer.toneMapping = NoToneMapping;
    gpuRenderer.setRenderObjectFunction(edges);
    try {
      gpuRenderer.render(scene, scenePass.camera);
    } finally {
      gpuRenderer.setRenderObjectFunction(delegate);
      delegate = null;
      scene.background = background;
      gpuRenderer.autoClear = autoClear;
      gpuRenderer.toneMapping = mapping;
    }
  };
  let frame: LinearFrame | undefined;
  let aoNode: ReturnType<typeof ao> | undefined;
  let denoiseNode: ReturnType<typeof createAoDenoise> | undefined;
  let denoiseInput: ReturnType<typeof rtt> | undefined;
  let outputQuad: QuadMesh | undefined;
  let disposeSurfaceReuse: (() => void) | undefined;
  let prepareSurfaceReuse: ((width: number, height: number) => void) | undefined;
  let depthRestoreMaterial: NodeMaterial | undefined;
  try {
    frame = createLinearFrame(gpuRenderer, toneMapping);
    // Three r184 specializes positionViewDirection by projection but omits that kind
    // from the render-object key. Two bounded MRT identities give it distinct
    // shader contexts without duplicating any framebuffer attachment.
    const withNormal = withAo;
    const projectionOutputs = new Map<boolean, ReturnType<typeof mrt>>();
    const setCamera = (next: ThreeCamera): void => {
      const orthographic = 'isOrthographicCamera' in next && next.isOrthographicCamera;
      let outputs = projectionOutputs.get(orthographic);
      if (!outputs) {
        outputs = mrt(
          withNormal
            ? {
                output,
                normal: compactNormals ? encodeAoNormal(normalView) : directionToColor(normalView),
              }
            : { output },
        );
        projectionOutputs.set(orthographic, outputs);
      }
      scenePass.camera = next;
      scenePass.setMRT(outputs);
    };
    setCamera(camera);

    // Retain the existing node WebGL2 D24S8 ownership. A copied-depth control
    // also reproduces the packaged cap-rim history defect, so duplicating this
    // attachment is not an established repair. Native keeps independent depth.
    frame.sharedDepth = gpuRenderer.coordinateSystem === WebGLCoordinateSystem;
    if (frame.sharedDepth) {
      scenePass.renderTarget.stencilBuffer = true;
      const depth = scenePass.getTexture('depth');
      depth.format = DepthStencilFormat;
      depth.type = UnsignedInt248Type;
      frame.target.depthTexture = depth as DepthTexture;
      (frame.depth.material as NodeMaterial).depthNode = texture(depth, screenUV);
      const acquire = scenePass.updateBefore.bind(scenePass);
      scenePass.updateBefore = (nodeFrame) => {
        const previousDepth = gpuRenderer.autoClearDepth;
        const previousStencil = gpuRenderer.autoClearStencil;
        gpuRenderer.autoClearDepth = true;
        gpuRenderer.autoClearStencil = true;
        try {
          return acquire(nodeFrame);
        } finally {
          gpuRenderer.autoClearDepth = previousDepth;
          gpuRenderer.autoClearStencil = previousStencil;
        }
      };
    }

    const scenePassColor = scenePass.getTextureNode('output');
    const scenePassDepth = scenePass.getTextureNode('depth');

    depthRestoreMaterial = new NodeMaterial();
    depthRestoreMaterial.colorWrite = false;
    // GL suppresses writes when its depth test is disabled; enable AlwaysDepth there.
    // Native GPU uses compare-always with depthTest=false, avoiding reversed-Z
    // remapping of explicit AlwaysDepth in Three r184.
    depthRestoreMaterial.depthTest = gpuRenderer.coordinateSystem === WebGLCoordinateSystem;
    depthRestoreMaterial.depthFunc = AlwaysDepth;
    depthRestoreMaterial.depthWrite = true;
    /* oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TSL texture node fluent API */
    depthRestoreMaterial.depthNode = scenePassDepth.sample(screenUV);
    const depthRestore = new QuadMesh(depthRestoreMaterial);

    const displayMode = uniform(0);
    const compositeStage = uniform(0);
    if (!withAo) {
      const toneMapped = (uv: Node<'vec2'>): Node<'vec4'> =>
        renderOutput(scenePassColor.sample(uv), toneMapping, LinearSRGBColorSpace) as Node<'vec4'>;
      outputQuad = createOutputQuad(
        antialias ? createViewportFxaa(scenePassColor, toneMapped) : toneMapped(screenUV),
        frame.sharedDepth ? undefined : depthRestoreMaterial,
      );
      updatePerComposition(outputQuad, [scenePass]);
      return {
        get camera() {
          return scenePass.camera as ThreeCamera;
        },
        setCamera,
        frame,
        outputQuad,
        renderEdges,
        depthRestore,
        depthRestoreMaterial,
        scenePass,
        displayMode,
        compositeStage,
      };
    }
    scenePass.getTexture('normal').type = UnsignedByteType;
    scenePass.getTexture('normal').format = compactNormals ? RGFormat : RGBAFormat;
    const scenePassNormal = sample((uv) =>
      compactNormals
        ? sampleAoNormal(scenePass.getTextureNode('normal'), uv)
        : colorToDirection(scenePass.getTextureNode('normal').sample(uv)),
    );

    // GTAONode rejects forward depth >= 1 as background. Pair 1-depth with
    // forward projection matrices; changing only the samples corrupts positions.
    const logDepth = gpuRenderer.logarithmicDepthBuffer
      ? createLogDepthAoAdapter(
          camera,
          sample((uv) => scenePassDepth.sample(uv).r),
        )
      : undefined;
    const aoCamera = logDepth ?? createGtaoCameraAdapter(camera, gpuRenderer.reversedDepthBuffer);
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- TSL texture node fluent API.
    const aoDepth =
      logDepth?.forwardDepth ??
      sample((uv) =>
        gpuRenderer.reversedDepthBuffer ? scenePassDepth.sample(uv).r.oneMinus() : scenePassDepth.sample(uv).r,
      );
    aoNode = ao(logDepth?.gtaoDepth ?? aoDepth, scenePassNormal, aoCamera.camera as Camera);
    aoNode.resolutionScale = 0.5;
    // Temporal direction rotation shimmers under `frameloop='demand'` because the
    // viewport never accumulates frame-to-frame.
    aoNode.useTemporalFiltering = false;
    aoNode.samples.value = 16;
    aoNode.distanceFallOff.value = defaultPostProcessingSettings.gtaoDistanceFalloff;

    const aoTexture = aoNode.getTextureNode();
    // GTAO is a stochastic estimate, not a finished visibility image. FXAA cannot
    // remove its interior noise. Filter with the same forward depth/camera pair,
    // reusing the scene MRT instead of rasterising geometry again.
    denoiseNode = createAoDenoise({
      texture: aoTexture,
      depth: aoDepth,
      normal: scenePassNormal,
      camera: aoCamera.camera as Camera,
    });
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- TSL fluent builder (`.mul`, `.sample`) is typed as `any` in `@types/three`; the runtime shape is verified via the unit + snapshot tests. */
    const denoiseTargetOptions = {
      type: HalfFloatType,
      format: RedFormat,
      depthBuffer: false,
      stencilBuffer: false,
    };
    denoiseInput = rtt(denoiseNode.visibility(screenUV), 1, 1, denoiseTargetOptions);
    // Performance candidate: filter at the AO budget, then bilinearly reconstruct.
    // This avoids native-resolution depth/normal gathers; boundary halos remain a visual gate.
    const composedSample = (uv: Node<'vec2'>): Node<'vec4'> => {
      // Materialize tone-mapped surface/AO once before filtering the stored color.
      // CAD line color never enters surface composition or its filter.
      const color = scenePassColor.sample(uv);
      const aoFactor = select<'float'>(aoNode!.scale.greaterThan(0), denoiseInput!.sample(uv).r, float(1));
      const visibility = select<'float'>(displayMode.equal(2), float(1), aoFactor);
      const beforeTone = select<'float'>(compositeStage.equal(0), visibility, float(1));
      const afterTone = select<'float'>(compositeStage.equal(1), visibility, float(1));
      const beauty = renderOutput(color.mul(vec4(vec3(beforeTone), 1)), toneMapping, LinearSRGBColorSpace).mul(
        vec4(vec3(afterTone), 1),
      );
      return mix(beauty, vec4(vec3(aoFactor), color.a), select<'float'>(displayMode.equal(1), float(1), float(0)));
    };
    outputQuad = createOutputQuad(composedSample(screenUV), frame.sharedDepth ? undefined : depthRestoreMaterial);
    const composedTarget = frame.target;
    composedTarget.texture.name = 'Tau composed surface';
    const reuse = createSurfaceReuse({
      renderer: gpuRenderer,
      scene: scenePass.renderTarget,
      composed: composedTarget,
    });
    const reuseTarget = reuse.target;
    frame.target = reuseTarget;
    (frame.output.material as NodeMaterial).fragmentNode = renderOutput(
      texture(reuseTarget.texture),
      NoToneMapping,
      gpuRenderer.outputColorSpace,
    );
    const filtered = createOutputQuad(createViewportFxaa(texture(composedTarget.texture)));
    filtered.name = 'Tau reused surface FXAA';
    const compose = outputQuad.render.bind(outputQuad);
    outputQuad.render = (renderer) => {
      reuse.render(
        () => {
          compose(renderer);
        },
        () => {
          filtered.render(renderer);
        },
      );
    };
    prepareSurfaceReuse = (width, height) => {
      reuse.prepare(width, height);
      frame!.depthPrepared = true;
    };
    disposeSurfaceReuse = () => {
      composedTarget.dispose();
      (filtered.material as NodeMaterial).dispose();
    };
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
    // Camera preparation can reuse this graph within Three's current animation
    // frame. Reused scene color needs fresh inputs for the next camera;
    // nested AO/filter draws still share a single scene acquisition.
    updatePerComposition(outputQuad, [scenePass, aoNode]);

    return {
      get camera() {
        return scenePass.camera as ThreeCamera;
      },
      setCamera,
      frame,
      outputQuad,
      renderEdges,
      aoNode,
      denoiseNode,
      denoiseInput,
      depthRestore,
      depthRestoreMaterial,
      scenePass,
      displayMode,
      compositeStage,
      updateAoCamera: aoCamera.update,
      prepareSurfaceReuse,
      disposeSurfaceReuse,
    };
  } catch (error) {
    if (frame) {
      disposeLinearFrame(frame, gpuRenderer);
    }
    disposeSurfaceReuse?.();
    depthRestoreMaterial?.dispose();
    (outputQuad?.material as NodeMaterial | undefined)?.dispose();
    disposeOwnedRtt(denoiseInput);
    disposeAoNode(aoNode);
    retireTransmissionCopy(scenePass.renderTarget);
    scenePass.dispose();
    throw error;
  }
};

const disposePipelineResources = (
  resources: readonly PostProcessingPipelineResources[],
  renderer: WebGPURenderer,
): void => {
  for (const resource of resources) {
    disposeLinearFrame(resource.frame, renderer);
    resource.disposeSurfaceReuse?.();
    (resource.outputQuad.material as NodeMaterial).dispose();
    disposeOwnedRtt(resource.denoiseInput);
    disposeAoNode(resource.aoNode);
    resource.depthRestoreMaterial.dispose();
    retireTransmissionCopy(resource.scenePass.renderTarget);
    resource.scenePass.dispose();
  }
};

type PostProcessingWebGpuProperties = Readonly<{
  settings?: Partial<PostProcessingSettings>;
  /** Off keeps the tone-mapped scene pass and drops AO (a software adapter cannot afford it). */
  aoAllowed: boolean;
  /** Render the alternate projection once after a quiet frame, so the first camera switch is warm. Default on. */
  speculativePreparation?: boolean;
  /**
   * Filter the beauty-only output with FXAA. Default on. Off for a software rasterizer: the filter's unrolled taps,
   * each tone-mapping its sample, take a software adapter tens of seconds to compile before the first frame shows.
   */
  antialiasAllowed?: boolean;
  toneMapping: ToneMapping;
}>;

function PostProcessingWebGpuActive({
  settings,
  aoAllowed,
  speculativePreparation = true,
  antialiasAllowed = true,
  toneMapping,
}: PostProcessingWebGpuProperties): ReactNode {
  const { gl, scene, invalidate, size, viewport } = useThree();
  const { aoEnabled, aoCompositeStage, radiusCssPixels, gtaoIntensity, gtaoDistanceFalloff, displayMode } = {
    ...defaultPostProcessingSettings,
    ...settings,
  };
  const cameraRig = useCameraRig();
  const resourcesRef = useRef(new Map<Camera, PostProcessingPipelineResources>());
  const selectedCameraRef = useRef<ThreeCamera>(cameraRig.activeCamera);
  const targetRef = useRef(new Vector3());
  const frameRef = useRef<LinearFrame | undefined>(undefined);
  const drawingSize = useRef(new Vector2());
  const preparationRef = useRef<ReturnType<typeof scheduleCameraPreparation> | undefined>(undefined);
  const withAo = aoAllowed && aoEnabled && displayMode !== 'no-ao';

  // Only the current endpoint is needed now. The other projection is created on its first frame.
  // AO changes replace the endpoint resources, so beauty-only scenes own no normal attachment or GTAO graph.
  useLayoutEffect(() => {
    const resources = resourcesRef.current;
    try {
      const camera = selectedCameraRef.current;
      resources.set(
        camera,
        createPipelineResources({
          camera,
          gpuRenderer: gl as unknown as WebGPURenderer,
          scene,
          toneMapping,
          withAo,
          antialias: antialiasAllowed,
        }),
      );
      invalidate();
    } catch (error) {
      console.error('Failed to create WebGPU post-processing pipeline', error);
    }
    return () => {
      disposePipelineResources([...resources.values()], gl as unknown as WebGPURenderer);
      frameRef.current = undefined;
      resources.clear();
    };
  }, [antialiasAllowed, gl, invalidate, scene, toneMapping, withAo]);

  const updateAoSettings = useCallback(
    (selected: PostProcessingPipelineResources): void => {
      if (!selected.aoNode) {
        return;
      }
      selected.aoNode.resolutionScale = 0.5;
      if (selected.denoiseNode) {
        // One AO texel per tap, matching the half drawing-buffer estimate.
        selected.denoiseNode.step.value.set(2 / (size.width * viewport.dpr), 2 / (size.height * viewport.dpr));
      }
      if (selected.denoiseInput) {
        // Estimate and smooth at half drawing-buffer resolution, including on Retina displays.
        // r184 RTTNode has no resolutionScale. Own physical dimensions explicitly;
        // its pixelRatio stays 1 and ordinary frames never resize the allocation.
        const width = Math.max(1, Math.ceil(size.width * viewport.dpr * 0.5));
        const height = Math.max(1, Math.ceil(size.height * viewport.dpr * 0.5));
        if (selected.denoiseInput.width !== width || selected.denoiseInput.height !== height) {
          selected.denoiseInput.setSize(width, height);
        }
      }
      selected.aoNode.scale.value = gtaoIntensity;
      selected.aoNode.distanceFallOff.value = gtaoDistanceFalloff;
      selected.displayMode.value = aoDisplayModes[displayMode];
      selected.compositeStage.value = aoCompositeStage === 'display' ? 1 : 0;
      updateGtaoSpatialScale({
        at: targetRef.current,
        resources: [selected],
        size,
        viewport,
        radiusCssPixels: resolveAoRadiusCssPixels(radiusCssPixels, {
          ...size,
          dpr: viewport.dpr,
        }),
      });
      selected.updateAoCamera?.(selected.camera);
    },
    [aoCompositeStage, displayMode, gtaoDistanceFalloff, gtaoIntensity, radiusCssPixels, size, viewport],
  );

  useLayoutEffect(() => {
    const selected = resourcesRef.current.get(selectedCameraRef.current);
    if (selected) {
      updateAoSettings(selected);
    }
    invalidate();
  }, [invalidate, updateAoSettings]);

  useLayoutEffect(() => {
    const renderer = gl as unknown as WebGPURenderer;
    if (!speculativePreparation || !(renderer.domElement instanceof HTMLCanvasElement)) {
      return;
    }
    const preparation = scheduleCameraPreparation(renderer.domElement, () => {
      const selected = resourcesRef.current.get(selectedCameraRef.current);
      if (!selected || selected.frame.pending) {
        return false;
      }
      // Bound speculative work to a small opaque scene. Transmission can retain
      // per-camera resources; it remains demand-only until separately qualified.
      const eligibility = { surfaces: 0, transmission: false };
      scene.traverseVisible((object) => {
        if (object instanceof Mesh && !(object instanceof QuadMesh)) {
          eligibility.surfaces++;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          eligibility.transmission ||= materials.some(
            (material) => 'transmission' in material && Number(material.transmission) > 0,
          );
        }
      });
      if (eligibility.surfaces === 0) {
        return false;
      }
      if (eligibility.surfaces > 128 || eligibility.transmission) {
        return true;
      }
      const active = selected.camera;
      const alternate =
        active === cameraRig.orthographicCamera ? cameraRig.perspectiveCamera : cameraRig.orthographicCamera;
      const saved = RendererUtils.saveRendererState(renderer);
      const clearDepth = renderer.autoClearDepth;
      const clearStencil = renderer.autoClearStencil;
      const clearColor = renderer.autoClearColor;
      try {
        selected.setCamera(alternate);
        selected.updateAoCamera?.(alternate);
        renderer.setRenderTarget(selected.frame.target);
        renderer.autoClear = true;
        // Exact live pass context, with no second graph or final canvas draw.
        selected.outputQuad.render(renderer);
      } finally {
        selected.setCamera(active);
        selected.updateAoCamera?.(active);
        RendererUtils.restoreRendererState(renderer, saved);
        renderer.autoClearDepth = clearDepth;
        renderer.autoClearStencil = clearStencil;
        renderer.autoClearColor = clearColor;
        invalidate();
      }
      return true;
    });
    preparationRef.current = preparation;
    return () => {
      preparation.dispose();
      preparationRef.current = undefined;
    };
  }, [cameraRig, gl, invalidate, scene, speculativePreparation, toneMapping, withAo]);

  const retarget = useCallback(
    (camera: ThreeCamera, snapshot: CameraDriverSnapshot): void => {
      if (selectedCameraRef.current !== camera) {
        const previous = resourcesRef.current.get(selectedCameraRef.current);
        if (previous) {
          // Keep the complete live graph: no target disposal or second
          // 5K endpoint. AO reads stable matrices updated from this scene camera.
          previous.setCamera(camera);
          resourcesRef.current.delete(selectedCameraRef.current);
          resourcesRef.current.set(camera, previous);
        }
      }
      selectedCameraRef.current = camera;
      const target = toThreeRenderPoint({
        renderFrame: cameraRig.renderFrame,
        pointMeters: snapshot.view.target,
      });
      targetRef.current.set(target.x, target.y, target.z);
      invalidate();
    },
    [cameraRig, gl, invalidate],
  );
  useCameraRetarget(retarget);

  const restoreDepth = useCallback(
    (target?: WebGLRenderTarget): void => {
      const selected = resourcesRef.current.get(selectedCameraRef.current);
      if (!selected) {
        return;
      }
      const renderer = gl as unknown as WebGPURenderer;
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      const frame = frameRef.current;
      // The composite already installed scene depth. Do not overwrite later cap writes.
      if (!target && frame?.pending) {
        return;
      }
      renderer.autoClear = false;
      renderer.setRenderTarget(target ?? null);
      try {
        (frame?.pending ? frame.depth : selected.depthRestore).render(renderer);
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.autoClear = previousAutoClear;
      }
    },
    [gl],
  );
  useOverlayDepthRestore(restoreDepth);

  useFrame((state) => {
    const camera = selectedCameraRef.current;
    let selected = resourcesRef.current.get(camera);
    if (!selected) {
      selected = createPipelineResources({
        camera,
        gpuRenderer: state.gl as unknown as WebGPURenderer,
        scene,
        toneMapping,
        withAo,
        antialias: antialiasAllowed,
      });
      resourcesRef.current.set(camera, selected);
    }
    updateAoSettings(selected);
    const renderer = state.gl as unknown as WebGPURenderer;
    const { frame } = selected;
    frameRef.current = frame;
    // Recover the destination if a later subscriber aborted the preceding frame.
    if (frame.pending) {
      renderer.setRenderTarget(frame.previousTarget);
    }
    frame.previousTarget = renderer.getRenderTarget();
    renderer.getDrawingBufferSize(drawingSize.current);
    selected.prepareSurfaceReuse?.(drawingSize.current.x, drawingSize.current.y);
    if (frame.sharedDepth) {
      if (
        !frame.depthPrepared ||
        frame.target.width !== drawingSize.current.x ||
        frame.target.height !== drawingSize.current.y
      ) {
        // Both targets belong to this graph. Retire both before reinitializing
        // either: r184 initialization dirties depth, so it must precede scene writes.
        selected.scenePass.renderTarget.setSize(drawingSize.current.x, drawingSize.current.y);
        frame.target.setSize(drawingSize.current.x, drawingSize.current.y);
        renderer.initRenderTarget(selected.scenePass.renderTarget);
        renderer.initRenderTarget(frame.target);
        frame.depthPrepared = true;
      }
    } else {
      frame.target.setSize(drawingSize.current.x, drawingSize.current.y);
    }
    frame.pending = true;
    renderer.setRenderTarget(frame.target);
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    const previousAutoClearDepth = renderer.autoClearDepth;
    const previousAutoClearStencil = renderer.autoClearStencil;
    if (frame.sharedDepth) {
      // The scene clears its authoritative attachment; composition preserves it.
      renderer.autoClearDepth = false;
      renderer.autoClearStencil = false;
    }
    try {
      selected.outputQuad.render(renderer);
    } catch (error) {
      renderer.setRenderTarget(frame.previousTarget);
      frame.pending = false;
      throw error;
    } finally {
      renderer.autoClear = previousAutoClear;
      renderer.autoClearDepth = previousAutoClearDepth;
      renderer.autoClearStencil = previousAutoClearStencil;
    }
  }, 1);

  // Caps write depth at 1.2. Analytic CAD edges consume that depth after surface AO/AA,
  // before emphasis at 1.4/1.5. All still blend in the one linear frame target.
  useFrame(() => {
    const selected = resourcesRef.current.get(selectedCameraRef.current);
    if (selected?.frame.pending) {
      selected.renderEdges();
    }
  }, 1.3);

  // Emphasis, grid, handles and gizmo also avoid the surface AA filter.
  useFrame(() => {
    const frame = frameRef.current;
    if (!frame?.pending) {
      return;
    }
    const renderer = gl as unknown as WebGPURenderer;
    const previousColorSpace = renderer.outputColorSpace;
    const previousToneMapping = renderer.toneMapping;
    const previousAutoClear = renderer.autoClear;
    try {
      renderer.setRenderTarget(frame.previousTarget);
      renderer.outputColorSpace = LinearSRGBColorSpace;
      renderer.toneMapping = NoToneMapping;
      renderer.autoClear = true;
      frame.output.render(renderer);
    } finally {
      renderer.setRenderTarget(frame.previousTarget);
      renderer.outputColorSpace = previousColorSpace;
      renderer.toneMapping = previousToneMapping;
      renderer.autoClear = previousAutoClear;
      frame.pending = false;
    }
    preparationRef.current?.onFrame();
  }, 3.5);
  return null;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- WebGPU acronym matches three.js / browser API naming
export function PostProcessingWebGPU(properties: PostProcessingWebGpuProperties): ReactNode {
  const { gl } = useThree();

  if (!('isWebGPURenderer' in gl) || !gl.isWebGPURenderer) {
    return null;
  }

  return <PostProcessingWebGpuActive {...properties} />;
}
