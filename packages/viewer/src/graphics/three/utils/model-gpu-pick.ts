import * as THREE from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  applyModelPickId,
  createModelPickMaterial,
  setModelPickId,
} from '#graphics/three/materials/model-pick.material.js';
import type { ModelPickMaterial } from '#graphics/three/materials/model-pick.material.js';
import { createModelPickNodeMaterial } from '#graphics/three/materials/model-pick.node.js';
import { installSectionClip } from '#graphics/three/materials/section-clip.js';
import type { SectionClip } from '#graphics/three/materials/section-clip.js';
import { getGltfOccurrenceLayers } from '#graphics/three/utils/gltf-surface-batches.js';
import { recordRendererSpan } from '#lib/renderer-telemetry.js';

/** How long the camera must stay still before a pick pass is drawn, in milliseconds. */
export const modelPickSettleMilliseconds = 100;

/** Floats per pick record: the pick ID, then the world position. */
const recordFloats = 4;
/** Cache nearby pointer requests without retaining a full-viewport position buffer. */
const regionExtent = 128;

type PickRegion = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

/**
 * The answer to one model ray. `pending` means the pick buffer does not show the scene as it is now: the caller treats
 * it as "not yet", never as a miss. `unavailable` means this ray is not one the buffer can answer (it does not leave
 * the camera through a pixel) or the renderer cannot pick on the GPU; the caller asks the trees instead.
 */
export type ModelPickResult =
  | Readonly<{ status: 'hit'; intersection: THREE.Intersection<THREE.Mesh> }>
  | Readonly<{ status: 'miss' }>
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'unavailable' }>;

/** What one frame drew: the camera, the canvas size in CSS pixels and the meshes a pointer may pick. */
export type ModelGpuPickerFrame = Readonly<{
  camera: THREE.Camera;
  width: number;
  height: number;
  meshes: readonly THREE.Mesh[];
}>;

/** Lifecycle and cached answers owned by one viewer canvas. */
export type ModelGpuPicker = Readonly<{
  /** Whether this renderer picks on the GPU; when not, every pick is `unavailable`. */
  readonly supported: boolean;
  /** Called after each drawn frame: notices changed inputs and schedules a pass once the camera is still. */
  frame(input: ModelGpuPickerFrame): void;
  /** Answers a ray synchronously from the last pass read back. */
  pick(raycaster: THREE.Raycaster): ModelPickResult;
  /** Refreshes the last requested pointer region, if stale; does nothing before the first camera-ray request. */
  refresh(): Promise<void>;
  dispose(): void;
}>;

/** Renderer and clipping authority supplied by the viewer. */
export type ModelGpuPickerOptions = Readonly<{
  renderer: unknown;
  /** The viewer's section clip, compiled into the pick materials so the pass removes what the model draw removes. */
  sectionClip: SectionClip | undefined;
  /** Called once when a pass lands after a pick answered `pending`, so the pointer is resolved again. */
  onLanded?: () => void;
  settleMilliseconds?: number;
}>;

type PickRenderTarget = THREE.WebGLRenderTarget | THREE.RenderTarget;

/** The renderer's current target: a render target, or the canvas. */
type CurrentRenderTarget = ReturnType<THREE.WebGLRenderer['getRenderTarget']> | PickRenderTarget;

type ReadablePickRenderer = Readonly<{
  isWebGLRenderer?: boolean;
  isWebGPURenderer?: boolean;
  backend?: { isWebGPUBackend?: boolean };
  coordinateSystem?: THREE.CoordinateSystem;
  reversedDepthBuffer?: boolean;
  getRenderTarget(): CurrentRenderTarget;
  setRenderTarget(target: CurrentRenderTarget): void;
  getClearColor(target: THREE.Color): THREE.Color;
  getClearAlpha(): number;
  setClearColor(color: THREE.ColorRepresentation, alpha?: number): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): unknown;
  readRenderTargetPixelsAsync(
    target: PickRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer?: Float32Array,
  ): Promise<THREE.TypedArray>;
}> & {
  /** Written for the pass and restored after it. */
  autoClear: boolean;
};

/** One pass read back: its records and what they were drawn from. */
type PickCopy = Readonly<{
  revision: number;
  data: Float32Array;
  region: PickRegion;
  /** Floats between the starts of two rows; WebGPU pads each row to 256 bytes. */
  rowFloats: number;
  /** Whether the first row read back is the top of the view (WebGPU) rather than the bottom (WebGL). */
  topRowFirst: boolean;
  meshes: readonly THREE.Mesh[];
  camera: THREE.Camera;
  /** The camera's world and projection matrices at the pass, which a ray is checked against. */
  cameraState: Float64Array;
}>;

const isWorldVisible = (object: THREE.Object3D): boolean => {
  for (let current: THREE.Object3D | undefined = object; current; current = current.parent ?? undefined) {
    if (!current.visible) {
      return false;
    }
  }
  return true;
};

const sideOf = (mesh: THREE.Mesh): THREE.Side => (Array.isArray(mesh.material) ? THREE.DoubleSide : mesh.material.side);

const versionOf = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): number =>
  attribute === undefined
    ? -1
    : attribute instanceof THREE.BufferAttribute
      ? attribute.version
      : attribute.data.version;

/** A growable list of numbers compared against the previous frame's, so unchanged input does no work. */
class InputState {
  private values = new Float64Array(256);
  private previous = new Float64Array(256);
  private length = 0;
  private previousLength = -1;

  public begin(): void {
    [this.values, this.previous] = [this.previous, this.values];
    this.previousLength = this.length;
    this.length = 0;
  }

  public push(value: number): void {
    if (this.length === this.values.length) {
      const grown = new Float64Array(this.values.length * 2);
      grown.set(this.values);
      this.values = grown;
    }
    this.values[this.length++] = value;
  }

  public pushMatrix(matrix: THREE.Matrix4): void {
    for (const value of matrix.elements) {
      this.push(value);
    }
  }

  /** Whether the values pushed since `begin` differ from the previous run's. */
  public changed(): boolean {
    if (this.length !== this.previousLength) {
      return true;
    }
    for (let index = 0; index < this.length; index++) {
      if (!Object.is(this.values[index], this.previous[index])) {
        return true;
      }
    }
    return false;
  }
}

const sameValues = (left: Float64Array, right: Float64Array): boolean =>
  left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

const cameraValues = (camera: THREE.Camera): Float64Array => {
  const values = new Float64Array(32);
  values.set(camera.matrixWorld.elements);
  values.set(camera.projectionMatrix.elements, 16);
  return values;
};

const rayPoint = new THREE.Vector3();
const rayClip = new THREE.Vector4();
const cameraOrigin = new THREE.Vector3();
const cameraForward = new THREE.Vector3();
const recordPoint = new THREE.Vector3();

/** Whether `ray` leaves `camera` through a pixel: from its eye, or, orthographic, along its view direction. */
const isCameraRay = (ray: THREE.Ray, camera: THREE.Camera): boolean => {
  const { elements } = camera.matrixWorld;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    cameraOrigin.set(elements[12], elements[13], elements[14]);
    return ray.origin.distanceTo(cameraOrigin) <= 1e-9 * Math.max(1, cameraOrigin.length());
  }
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    cameraForward.set(-elements[8], -elements[9], -elements[10]).normalize();
    return ray.direction.dot(cameraForward) >= 1 - 1e-9;
  }
  return false;
};

/** Full-viewport CSS pixel of a camera ray; the crop never changes this sampling grid. */
const rayPixel = (
  camera: THREE.Camera,
  ray: THREE.Ray,
  { width, height }: { width: number; height: number },
): THREE.Vector2 | undefined => {
  rayClip.set(ray.origin.x + ray.direction.x, ray.origin.y + ray.direction.y, ray.origin.z + ray.direction.z, 1);
  rayClip.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  if (rayClip.w <= 0) {
    return undefined;
  }
  const column = Math.floor(((rayClip.x / rayClip.w + 1) / 2) * width);
  const row = Math.floor(((1 - rayClip.y / rayClip.w) / 2) * height);
  return column < 0 || column >= width || row < 0 || row >= height ? undefined : new THREE.Vector2(column, row);
};

const containsPixel = (region: PickRegion, pixel: THREE.Vector2): boolean =>
  pixel.x >= region.left &&
  pixel.x < region.left + region.width &&
  pixel.y >= region.top &&
  pixel.y < region.top + region.height;

/**
 * GPU ID picking for the model's surfaces. A pass draws every pickable mesh, as the viewport draws it (world
 * transform, visibility, layers, face side and the section clip), into a bounded float target on the original CSS-pixel grid: per
 * pixel the mesh's pick ID and the world position under it. The pass runs only when its inputs changed and the camera
 * is still and a pointer has requested a region, and is read back asynchronously into one CPU copy stamped with the input revision it shows. A ray is then
 * answered synchronously from the copy while the revision is current, and is `pending` otherwise.
 */
export const createModelGpuPicker = ({
  renderer: rendererInput,
  sectionClip,
  onLanded,
  settleMilliseconds = modelPickSettleMilliseconds,
}: ModelGpuPickerOptions): ModelGpuPicker => {
  const renderer = rendererInput as Partial<ReadablePickRenderer> | undefined;
  const isWebGl = renderer?.isWebGLRenderer === true;
  const isNode = renderer?.isWebGPURenderer === true;
  let supported =
    (isWebGl || isNode) &&
    typeof renderer.readRenderTargetPixelsAsync === 'function' &&
    (sectionClip === undefined || sectionClip.backend === (isWebGl ? 'webgl' : 'webgpu'));
  const pickRenderer = renderer as ReadablePickRenderer;
  const topRowFirst = isNode && renderer.backend?.isWebGPUBackend === true;

  const scene = new THREE.Scene();
  scene.matrixWorldAutoUpdate = false;
  const materials = new Map<THREE.Side, ModelPickMaterial | MeshBasicNodeMaterial>();
  let proxies = new Map<THREE.Mesh, THREE.Mesh>();
  let target: PickRenderTarget | undefined;
  let region: PickRegion | undefined;
  let cropCamera: THREE.Camera | undefined;
  let cameraOwner: THREE.Camera | undefined;
  const cropProjection = new THREE.Matrix4();
  const buffers: Float32Array[] = [];
  const cameraInput = new InputState();
  const sceneInput = new InputState();
  const previousClearColor = new THREE.Color();

  let latest: ModelGpuPickerFrame | undefined;
  let revision = 0;
  let copy: PickCopy | undefined;
  let inFlight: Promise<void> | undefined;
  let lastMotionAt = Number.NEGATIVE_INFINITY;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let passFrame: number | undefined;
  let replayArmed = false;
  let disposed = false;

  const materialFor = (side: THREE.Side): ModelPickMaterial | MeshBasicNodeMaterial => {
    let material = materials.get(side);
    if (!material) {
      material = isWebGl ? createModelPickMaterial(side) : createModelPickNodeMaterial(side);
      if (sectionClip) {
        installSectionClip(material, sectionClip);
      }
      materials.set(side, material);
    }
    return material;
  };

  const isDrawn = (mesh: THREE.Mesh, camera: THREE.Camera): boolean =>
    isWorldVisible(mesh) && camera.layers.test(getGltfOccurrenceLayers(mesh));

  /** Everything the pass draws apart from the camera: size, meshes and their state, and the clip's cuts. */
  const writeSceneInput = ({ camera, width, height, meshes }: ModelGpuPickerFrame): void => {
    sceneInput.begin();
    sceneInput.push(width);
    sceneInput.push(height);
    sceneInput.push(meshes.length);
    for (const mesh of meshes) {
      const drawn = isDrawn(mesh, camera);
      sceneInput.push(drawn ? 1 : 0);
      if (!drawn) {
        continue;
      }
      const { geometry } = mesh;
      sceneInput.push(mesh.id);
      sceneInput.push(geometry.id);
      sceneInput.push(versionOf(geometry.getAttribute('position')));
      sceneInput.push(geometry.index?.version ?? -1);
      sceneInput.push(sideOf(mesh));
      sceneInput.pushMatrix(mesh.matrixWorld);
    }
    if (sectionClip) {
      const count = sectionClip.settings.x;
      sceneInput.push(count);
      sceneInput.push(sectionClip.settings.y);
      for (let index = 0; index < count; index++) {
        sceneInput.push(sectionClip.first[index]!.x);
        sceneInput.push(sectionClip.first[index]!.y);
        sceneInput.push(sectionClip.first[index]!.z);
        sceneInput.push(sectionClip.first[index]!.w);
        sceneInput.push(sectionClip.second[index]!.x);
        sceneInput.push(sectionClip.second[index]!.y);
        sceneInput.push(sectionClip.second[index]!.z);
        sceneInput.push(sectionClip.second[index]!.w);
      }
    }
  };

  const ensureTarget = (width: number, height: number): PickRenderTarget => {
    if (target && target.width === width && target.height === height) {
      return target;
    }
    target?.dispose();
    const options = {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    } as const;
    // WebGL reads back only from its own target type; the node renderer from the common one.
    target = isWebGl
      ? new THREE.WebGLRenderTarget(width, height, options)
      : new THREE.RenderTarget(width, height, options);
    buffers.length = 0;
    return target;
  };

  /** One of two read-back buffers, the one the current copy does not hold, for WebGL, which fills one it is given. */
  const freeBuffer = (length: number): Float32Array => {
    const slot = buffers[0] !== undefined && buffers[0] === copy?.data ? 1 : 0;
    if (buffers[slot]?.length !== length) {
      buffers[slot] = new Float32Array(length);
    }
    return buffers[slot];
  };

  /** Draws the pass now, in the caller's turn, then waits for its read-back to land. */
  const drawPass = async (input: ModelGpuPickerFrame): Promise<void> => {
    const startedAt = performance.now();
    const passRevision = revision;
    const passRegion = region!;
    const { width, height, left, top, viewportWidth, viewportHeight } = passRegion;
    const pickTarget = ensureTarget(width, height);
    const { camera } = input;
    const drawn: THREE.Mesh[] = [];
    const nextProxies = new Map<THREE.Mesh, THREE.Mesh>();
    scene.clear();
    for (const mesh of input.meshes) {
      if (!isDrawn(mesh, camera)) {
        continue;
      }
      drawn.push(mesh);
      let proxy = proxies.get(mesh);
      if (!proxy) {
        proxy = new THREE.Mesh();
        proxy.matrixAutoUpdate = false;
        proxy.layers.enableAll();
        if (isWebGl) {
          const owner = proxy;
          owner.onBeforeRender = () => {
            applyModelPickId(owner.material as ModelPickMaterial, owner);
          };
        }
      }
      proxy.geometry = mesh.geometry;
      proxy.material = materialFor(sideOf(mesh));
      proxy.matrix.copy(mesh.matrixWorld);
      proxy.matrixWorld.copy(mesh.matrixWorld);
      setModelPickId(proxy, drawn.length);
      nextProxies.set(mesh, proxy);
      scene.add(proxy);
    }
    proxies = nextProxies;

    // A detached clone retains the resolved camera-rig transform, view offset and depth precision.
    if (cameraOwner !== camera) {
      cropCamera = camera.clone();
      cameraOwner = camera;
    }
    const cropped = cropCamera!;
    cropped.copy(camera, false);
    cropped.matrixAutoUpdate = false;
    cropped.matrixWorldAutoUpdate = false;
    // Three r184 Camera.copy omits this getter-only flag. Set it before the renderer can
    // rebuild the projection and erase the XY crop; installed-source tests guard this seam.
    const reversedDepth = pickRenderer.reversedDepthBuffer === true || camera.reversedDepth;
    const coordinateSystem = pickRenderer.coordinateSystem ?? camera.coordinateSystem;
    Object.assign(cropped, { _reversedDepth: reversedDepth });
    cropped.coordinateSystem = coordinateSystem;
    if (
      (reversedDepth !== camera.reversedDepth || coordinateSystem !== camera.coordinateSystem) &&
      (cropped instanceof THREE.PerspectiveCamera || cropped instanceof THREE.OrthographicCamera)
    ) {
      cropped.updateProjectionMatrix();
    }
    cropProjection.set(
      viewportWidth / width,
      0,
      0,
      (viewportWidth - 2 * left - width) / width,
      0,
      viewportHeight / height,
      0,
      (2 * top + height - viewportHeight) / height,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      1,
    );
    cropped.projectionMatrix.premultiply(cropProjection);
    cropped.projectionMatrixInverse.copy(cropped.projectionMatrix).invert();
    const previousTarget = pickRenderer.getRenderTarget();
    const previousClearAlpha = pickRenderer.getClearAlpha();
    pickRenderer.getClearColor(previousClearColor);
    const previousAutoClear = pickRenderer.autoClear;
    try {
      pickRenderer.setRenderTarget(pickTarget);
      pickRenderer.setClearColor(0x00_00_00, 0);
      pickRenderer.autoClear = true;
      pickRenderer.render(scene, cropped);
    } finally {
      pickRenderer.setRenderTarget(previousTarget);
      pickRenderer.setClearColor(previousClearColor, previousClearAlpha);
      pickRenderer.autoClear = previousAutoClear;
    }
    // Stamp the original camera, which the picker never mutates.
    const cameraState = cameraValues(camera);
    const submittedAt = performance.now();
    const read = isWebGl
      ? pickRenderer.readRenderTargetPixelsAsync(pickTarget, 0, 0, width, height, freeBuffer(width * height * 4))
      : pickRenderer.readRenderTargetPixelsAsync(pickTarget, 0, 0, width, height);
    const attributes = {
      backend: isWebGl ? 'webgl' : topRowFirst ? 'webgpu' : 'webgl-fallback',
      width,
      height,
      meshes: drawn.length,
      submitMilliseconds: submittedAt - startedAt,
    };
    let data: THREE.TypedArray;
    try {
      data = await read;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      recordRendererSpan('renderer.pick', {
        startTime: startedAt,
        duration: performance.now() - startedAt,
        attributes: { ...attributes, outcome: 'failed', reason },
      });
      // A renderer that cannot read the pass back answers through the trees from now on.
      supported = false;
      return;
    }
    recordRendererSpan('renderer.pick', {
      startTime: startedAt,
      duration: performance.now() - startedAt,
      attributes: {
        ...attributes,
        readbackMilliseconds: performance.now() - submittedAt,
        outcome: 'ready',
      },
    });
    if (disposed) {
      return;
    }
    const rowFloats = topRowFirst ? (Math.ceil((width * recordFloats * 4) / 256) * 256) / 4 : width * recordFloats;
    copy = {
      revision: passRevision,
      data: data as Float32Array,
      region: passRegion,
      rowFloats,
      topRowFirst,
      meshes: drawn,
      camera,
      cameraState,
    };
  };

  /** One pass from draw to landing, then a newer pass if the inputs moved on, or the armed replay. */
  const settlePass = async (input: ModelGpuPickerFrame): Promise<void> => {
    try {
      await drawPass(input);
    } catch (error) {
      recordRendererSpan('renderer.pick', {
        startTime: performance.now(),
        duration: 0,
        attributes: {
          outcome: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        },
      });
      supported = false;
    }
    inFlight = undefined;
    if (disposed) {
      return;
    }
    if (supported && copy?.revision !== revision) {
      // The inputs changed while this pass was out: the copy is already stale.
      requestPass();
    } else if (replayArmed) {
      replayArmed = false;
      onLanded?.();
    }
  };

  const runPass = async (): Promise<void> => {
    if (inFlight) {
      return inFlight;
    }
    const input = latest;
    if (disposed || !supported || !input || !region || copy?.revision === revision) {
      return;
    }
    inFlight = settlePass(input);
    return inFlight;
  };

  /** Asks again once the camera has been still for the settle time; a newer motion restarts the wait. */
  function armSettle(restart: boolean): void {
    if (settleTimer !== undefined && !restart) {
      return;
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(
      () => {
        settleTimer = undefined;
        requestPass();
      },
      Math.max(0, lastMotionAt + settleMilliseconds - performance.now()),
    );
  }

  function requestPass(): void {
    if (
      disposed ||
      !supported ||
      latest === undefined ||
      region === undefined ||
      inFlight !== undefined ||
      passFrame !== undefined ||
      copy?.revision === revision
    ) {
      return;
    }
    if (performance.now() - lastMotionAt < settleMilliseconds) {
      armSettle(false);
      return;
    }
    passFrame = requestAnimationFrame(() => {
      passFrame = undefined;
      void runPass();
    });
  }

  const pending = (): ModelPickResult => {
    replayArmed = true;
    requestPass();
    return { status: 'pending' };
  };

  return {
    get supported() {
      return supported;
    },
    frame(input) {
      if (disposed || !supported) {
        return;
      }
      latest = input;
      if (
        region &&
        (region.viewportWidth !== Math.max(1, Math.round(input.width)) ||
          region.viewportHeight !== Math.max(1, Math.round(input.height)))
      ) {
        region = undefined;
        revision += 1;
      }
      input.camera.updateMatrixWorld();
      cameraInput.begin();
      cameraInput.push(input.camera.id);
      cameraInput.pushMatrix(input.camera.matrixWorld);
      cameraInput.pushMatrix(input.camera.projectionMatrix);
      if (cameraInput.changed()) {
        revision += 1;
        lastMotionAt = performance.now();
        if (region) {
          armSettle(true);
        }
        return;
      }
      writeSceneInput(input);
      if (sceneInput.changed()) {
        revision += 1;
      }
      requestPass();
    },
    pick(raycaster) {
      if (disposed || !supported) {
        return { status: 'unavailable' };
      }
      if (!latest) {
        return pending();
      }
      const { camera } = latest;
      if (!isCameraRay(raycaster.ray, camera)) {
        return { status: 'unavailable' };
      }
      const width = Math.max(1, Math.round(latest.width));
      const height = Math.max(1, Math.round(latest.height));
      const pixel = rayPixel(camera, raycaster.ray, { width, height });
      if (!pixel) {
        return { status: 'miss' };
      }
      if (!region || !containsPixel(region, pixel)) {
        const regionWidth = Math.min(regionExtent, width);
        const regionHeight = Math.min(regionExtent, height);
        region = {
          left: Math.max(0, Math.min(width - regionWidth, pixel.x - Math.floor(regionWidth / 2))),
          top: Math.max(0, Math.min(height - regionHeight, pixel.y - Math.floor(regionHeight / 2))),
          width: regionWidth,
          height: regionHeight,
          viewportWidth: width,
          viewportHeight: height,
        };
        revision += 1;
      }
      if (
        !copy ||
        copy.revision !== revision ||
        copy.camera !== camera ||
        !sameValues(copy.cameraState, cameraValues(camera))
      ) {
        return pending();
      }
      const { ray } = raycaster;
      const column = pixel.x - copy.region.left;
      const rowFromTop = pixel.y - copy.region.top;
      const row = copy.topRowFirst ? rowFromTop : copy.region.height - 1 - rowFromTop;
      const offset = row * copy.rowFloats + column * recordFloats;
      const id = copy.data[offset]!;
      if (id === 0) {
        return { status: 'miss' };
      }
      const mesh = copy.meshes[Math.round(id) - 1];
      if (!mesh || !isWorldVisible(mesh)) {
        // Hidden since the pass, before a frame noticed: what lies behind it is not in the copy.
        revision += 1;
        return pending();
      }
      if (!raycaster.layers.test(getGltfOccurrenceLayers(mesh))) {
        return { status: 'miss' };
      }
      recordPoint.set(copy.data[offset + 1]!, copy.data[offset + 2]!, copy.data[offset + 3]!);
      // The surface depth under the pixel, taken along this ray: the point lies on the ray, as a raycast hit does.
      const distance = rayPoint.copy(recordPoint).sub(ray.origin).dot(ray.direction);
      if (distance < raycaster.near || distance > raycaster.far) {
        return { status: 'miss' };
      }
      return {
        status: 'hit',
        intersection: {
          distance,
          point: ray.at(distance, new THREE.Vector3()),
          object: mesh,
        },
      };
    },
    async refresh() {
      clearTimeout(settleTimer);
      settleTimer = undefined;
      if (passFrame !== undefined) {
        cancelAnimationFrame(passFrame);
        passFrame = undefined;
      }
      return runPass();
    },
    dispose() {
      disposed = true;
      clearTimeout(settleTimer);
      if (passFrame !== undefined) {
        cancelAnimationFrame(passFrame);
      }
      scene.clear();
      proxies.clear();
      for (const material of materials.values()) {
        material.dispose();
      }
      materials.clear();
      target?.dispose();
      target = undefined;
      buffers.length = 0;
      copy = undefined;
      latest = undefined;
      region = undefined;
      cropCamera = undefined;
      cameraOwner = undefined;
    },
  };
};
