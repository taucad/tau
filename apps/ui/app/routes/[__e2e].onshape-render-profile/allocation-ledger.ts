import { CubeTexture, REVISION, WebGLCoordinateSystem } from 'three';
import type { RenderTarget, Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { createNodeFrameGpuTimer } from '#routes/[__e2e].onshape-render-profile/gpu-node-timing.js';

// Calibration-only r184 adapter. Scalar receipts never retain a disposed GPU resource.
type TextureRecord = {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: number;
  type: number;
  format: number;
  mipmaps: boolean;
  trackedBytes: number;
  /** Exact logical RGBA16F cube storage from the allocated descriptor, not physical VRAM. */
  cubeDescriptorBytes?: number;
  live: boolean;
  backendLive: boolean;
  descriptor?: unknown;
  multisample?: { width: number; height: number; layers: number; samples: number; format: string };
  renderbuffers?: Array<Record<string, number | string>>;
  origin: string;
};
type PassContext = {
  // oxlint-disable-next-line typescript/no-restricted-types -- Three uses null for the canvas target.
  textures: Texture[] | null;
  depthTexture?: Texture;
  renderTarget?: RenderTarget;
  width: number;
  height: number;
  sampleCount: number;
  depth: boolean;
  stencil: boolean;
  clearColor: boolean;
  clearDepth: boolean;
  clearStencil: boolean;
};
/** A borrowed color keeps its original name; clears/MRT identify subsequent uses. */
function identifyPass(context: PassContext, names: ReadonlySet<string>): string {
  if (context.textures === null) {
    return 'output';
  }
  if (names.has('output')) {
    if (context.clearDepth || context.textures.length > 1) {
      return 'scene';
    }
    return context.clearColor ? 'surface-filter' : 'overlay';
  }
  if (names.has('GTAONode.AO')) {
    return 'ao';
  }
  if (names.has('Tau composed surface')) {
    return 'materialize';
  }
  if (names.has('Tau surface filter frame')) {
    return context.clearColor ? 'surface-filter' : 'overlay';
  }
  if (names.has('Tau linear frame')) {
    return context.clearColor ? 'compose' : 'overlay';
  }
  return context.width === 1280 && context.height === 720 ? 'filter' : 'other';
}

type ObservedBackend = WebGPURenderer['backend'] & {
  createTexture: (texture: Texture, options?: Record<string, unknown>) => void;
  destroyTexture: (texture: Texture, isDefaultTexture?: boolean) => void;
  get: (texture: Texture | RenderTarget) => unknown;
  beginRender: (context: PassContext) => void;
  finishRender: (context: PassContext) => void;
  draw: (object: { context: PassContext }, ...rest: unknown[]) => void;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Match the private Three method name.
  getTimestampUID: (context: PassContext) => string;
};
type Ledger = {
  revision: string;
  backend: 'webgpu' | 'webgl2-node';
  costStatus?: Record<string, unknown>;
  validationErrors: string[];
  records: Map<string, TextureRecord>;
  events: Array<{ event: string; id: string; at: number; bytes: number }>;
  passes: Map<string, unknown>;
  costs: number[];
  timingEnabled: boolean;
  peak: number;
  disposed: boolean;
  disposedAt?: number;
  retirement?: string;
  retirementObservation?: Promise<void>;
  canvasDepth?: unknown;
};
const ledgers: Ledger[] = [];

/** Exclude compilation and idle startup samples before a controlled workload. */
export function resetAllocationCosts(enabled = true): void {
  for (const ledger of ledgers) {
    if (!ledger.disposed) {
      if (enabled) {
        ledger.costs.length = 0;
      }
      ledger.timingEnabled = enabled;
    }
  }
}

/** Read logical attachment precision once, preserving the caller's GL binding. */
function readMaskRenderbuffers(
  gl: WebGL2RenderingContext,
  color: WebGLRenderbuffer,
  depth: WebGLRenderbuffer | undefined,
): Array<Record<string, number | string>> {
  // oxlint-disable-next-line typescript/no-restricted-types -- WebGL uses null for an unbound renderbuffer.
  const previous = gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null;
  const buffers: Array<Record<string, number | string>> = [];
  try {
    for (const [kind, buffer] of [
      ['color', color],
      ['depth', depth],
    ] as const) {
      if (!buffer) {
        continue;
      }
      gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
      const receipt: Record<string, number | string> = { kind };
      for (const [key, parameter] of Object.entries({
        width: gl.RENDERBUFFER_WIDTH,
        height: gl.RENDERBUFFER_HEIGHT,
        samples: gl.RENDERBUFFER_SAMPLES,
        format: gl.RENDERBUFFER_INTERNAL_FORMAT,
        red: gl.RENDERBUFFER_RED_SIZE,
        green: gl.RENDERBUFFER_GREEN_SIZE,
        blue: gl.RENDERBUFFER_BLUE_SIZE,
        alpha: gl.RENDERBUFFER_ALPHA_SIZE,
        depth: gl.RENDERBUFFER_DEPTH_SIZE,
      })) {
        receipt[key] = gl.getRenderbufferParameter(gl.RENDERBUFFER, parameter) as number;
      }
      buffers.push(receipt);
    }
  } finally {
    gl.bindRenderbuffer(gl.RENDERBUFFER, previous);
  }
  return buffers;
}

/** Snapshot historical allocations without retaining renderer, texture or backend objects. */
export function readAllocationLedgers(): unknown {
  return ledgers.map((ledger) => {
    const trackedLive = [...ledger.records.values()]
      .filter((record) => record.live)
      .reduce((sum, record) => sum + record.trackedBytes, 0);
    // Preserve Three's counter as historical evidence; expose this independently
    // verified omission separately rather than relabelling the counter as VRAM.
    const cubeTrackingAdjustment = [...ledger.records.values()]
      .filter((record) => record.live && record.backendLive && record.cubeDescriptorBytes !== undefined)
      .reduce((sum, record) => sum + record.cubeDescriptorBytes! - record.trackedBytes, 0);
    return {
      revision: ledger.revision,
      backend: ledger.backend,
      costStatus: ledger.costStatus,
      validationErrors: ledger.validationErrors,
      // The backendLive field is the last per-texture event, not proof of surviving a destroyed device/context.
      textures: [...ledger.records.values()].map((record) => ({
        ...record,
        activeBackendAllocation: !ledger.disposed && ledger.retirement === undefined && record.backendLive,
      })),
      canvasDepth: ledger.canvasDepth,
      disposedAt: ledger.disposedAt,
      retirement: ledger.retirement,
      events: ledger.events,
      passes: [...ledger.passes.values()],
      costs: ledger.costs,
      trackedLive,
      cubeTrackingAdjustment,
      trackedWithCubeCorrection: trackedLive + cubeTrackingAdjustment,
      peak: ledger.peak,
      disposed: ledger.disposed,
    };
  });
}

/** Track device retirement without treating historical texture events as live allocations. */
async function observeDeviceRetirement(lost: Promise<{ reason: string }>, ledger: Ledger): Promise<void> {
  const { reason } = await lost;
  ledger.retirement = `device-${reason}`;
}

/** Install only before first use, only in the separate calibration build. */
export function installAllocationLedger(renderer: WebGPURenderer, passCost?: string): void {
  if (REVISION !== '184') {
    throw new Error('Allocation adapter requires Three r184 source review');
  }
  const ledger: Ledger = {
    revision: REVISION,
    backend: renderer.coordinateSystem === WebGLCoordinateSystem ? 'webgl2-node' : 'webgpu',
    validationErrors: [],
    records: new Map(),
    events: [],
    passes: new Map(),
    costs: [],
    timingEnabled: false,
    peak: 0,
    disposed: false,
  };
  ledgers.push(ledger);
  const backend = renderer.backend as ObservedBackend;
  let removeValidationListener: (() => void) | undefined;
  if (ledger.backend === 'webgpu' && 'device' in backend && backend.device) {
    const device = backend.device as {
      lost: Promise<{ reason: string }>;
      addEventListener: (type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void) => void;
      removeEventListener: (type: 'uncapturederror', listener: (event: GPUUncapturedErrorEvent) => void) => void;
    };
    ledger.retirementObservation = observeDeviceRetirement(device.lost, ledger);
    const onValidationError = (error: GPUUncapturedErrorEvent): void => {
      const { message } = error.error;
      if (ledger.validationErrors.length < 20 && !ledger.validationErrors.includes(message)) {
        ledger.validationErrors.push(message);
      }
    };
    device.addEventListener('uncapturederror', onValidationError);
    removeValidationListener = () => {
      device.removeEventListener('uncapturederror', onValidationError);
    };
  }
  const { info } = renderer;
  const started = performance.now();
  const recordTexture = (texture: Texture): TextureRecord => {
    let record = ledger.records.get(texture.uuid);
    if (!record) {
      record = {
        id: texture.uuid,
        name: texture.name,
        width: texture.width,
        height: texture.height,
        layers: texture instanceof CubeTexture ? 6 : texture.depth,
        type: texture.type,
        format: texture.format,
        mipmaps: texture.generateMipmaps,
        trackedBytes: 0,
        live: false,
        backendLive: false,
        origin: new Error('Allocation origin').stack?.split('\n').slice(2, 14).join('\n') ?? '',
      };
      ledger.records.set(texture.uuid, record);
    }
    record.name = texture.name;
    record.format = texture.format;
    record.type = texture.type;
    record.width = texture.width;
    record.height = texture.height;
    return record;
  };
  const event = (kind: string, record: TextureRecord): void => {
    ledger.events.push({
      event: kind,
      id: record.id,
      at: performance.now() - started,
      bytes: info.memory.texturesSize,
    });
    ledger.peak = Math.max(ledger.peak, info.memory.texturesSize);
  };
  const create = info.createTexture.bind(info);
  info.createTexture = (texture) => {
    const before = info.memory.texturesSize;
    create(texture);
    const record = recordTexture(texture);
    record.trackedBytes = info.memory.texturesSize - before;
    record.live = true;
    event('track', record);
  };
  const destroy = info.destroyTexture.bind(info);
  info.destroyTexture = (texture) => {
    destroy(texture);
    const record = recordTexture(texture);
    record.live = false;
    event('untrack', record);
  };
  const allocate = backend.createTexture.bind(backend);
  backend.createTexture = (texture, options) => {
    allocate(texture, options);
    const record = recordTexture(texture);
    const data = backend.get(texture) as {
      textureDescriptorGPU?: unknown;
      glInternalFormat?: number;
      glType?: number;
      glFormat?: number;
      msaaTexture?: GPUTexture;
    };
    record.descriptor = (data.textureDescriptorGPU ? structuredClone(data.textureDescriptorGPU) : undefined) ?? {
      width: options?.['width'],
      height: options?.['height'],
      depth: options?.['depth'],
      levels: options?.['levels'],
      sampleCount: options?.['sampleCount'],
      internalFormat: data.glInternalFormat,
      type: data.glType,
      format: data.glFormat,
    };
    // Three r184 Info reads dimensions from the cube's image array (undefined),
    // while Textures allocates using its first face. Reconcile the observed
    // RGBA16F environment only; unknown formats remain explicitly uncorrected.
    record.cubeDescriptorBytes = undefined;
    const descriptor = data.textureDescriptorGPU as { format?: string } | undefined;
    if (texture instanceof CubeTexture && (descriptor?.format === 'rgba16float' || data.glInternalFormat === 34_842)) {
      const width = Number(options?.['width']);
      const height = Number(options?.['height']);
      const layers = Number(options?.['depth']);
      const levels = Number(options?.['levels'] ?? 1);
      const samples = Number(options?.['sampleCount'] ?? 1);
      if (
        [width, height, levels].every((value) => Number.isInteger(value) && value > 0) &&
        layers === 6 &&
        samples === 1
      ) {
        let bytes = 0;
        for (let level = 0; level < levels; level++) {
          bytes += Math.max(1, Math.floor(width / 2 ** level)) * Math.max(1, Math.floor(height / 2 ** level)) * 6 * 8;
        }
        record.cubeDescriptorBytes = bytes;
      }
    }
    if (data.msaaTexture) {
      const msaa = data.msaaTexture;
      record.multisample = {
        width: msaa.width,
        height: msaa.height,
        layers: msaa.depthOrArrayLayers,
        samples: msaa.sampleCount,
        format: msaa.format,
      };
    }
    record.backendLive = true;
    event('allocate', record);
  };
  const release = backend.destroyTexture.bind(backend);
  backend.destroyTexture = (texture, isDefaultTexture) => {
    release(texture, isDefaultTexture);
    const record = recordTexture(texture);
    record.backendLive = false;
    event('release', record);
  };
  const timer = passCost ? createNodeFrameGpuTimer(renderer) : undefined;
  const costScope =
    passCost === 'empty'
      ? 'WebGL empty end-of-frame query control; no draw commands'
      : 'Instrumented pass interval; not additive or exclusive GPU utilization';
  if (passCost) {
    ledger.costStatus = { stage: passCost, scope: costScope, support: timer?.support ?? 'unavailable' };
  }
  const glBackend = renderer.coordinateSystem === WebGLCoordinateSystem;
  const passNames = new WeakMap<PassContext, string>();
  const inspectedBuffers = new WeakSet<WebGLRenderbuffer>();
  let timedContext: PassContext | undefined;
  let timedUid = '';
  const begin = backend.beginRender.bind(backend);
  backend.beginRender = (context) => {
    const textures = context.textures ?? [];
    const names = new Set(textures.map((texture) => texture.name));
    const name = identifyPass(context, names);
    passNames.set(context, name);
    const uid = backend.getTimestampUID(context);
    ledger.passes.set(`${name}:${textures.map((texture) => texture.uuid).join(',')}`, {
      uid,
      name,
      width: context.width,
      height: context.height,
      samples: context.sampleCount,
      color: textures.map((texture) => texture.uuid),
      depth: context.depthTexture?.uuid,
      depthEnabled: context.depth,
      stencilEnabled: context.stencil,
      clearColor: context.clearColor,
      clearDepth: context.clearDepth,
      clearStencil: context.clearStencil,
    });
    if (timer) {
      const completed = timer.poll();
      ledger.costStatus = {
        stage: passCost,
        scope: costScope,
        support: timer.support,
        pending: completed.pending,
        failedSamples: completed.failedSamples,
        disjointDiscarded: completed.disjointDiscarded,
      };
      if (completed.passRanges?.length) {
        const completedUid = timedUid;
        for (const ranges of completed.passRanges) {
          const selected = ranges.find((range) => range.uid === completedUid);
          if (selected) {
            ledger.costs.push(selected.end - selected.start);
          }
        }
      } else {
        ledger.costs.push(...completed.milliseconds);
      }
      if (!glBackend && ledger.timingEnabled && name === passCost && timer.begin()) {
        timedContext = context;
        timedUid = uid;
      }
    }
    begin(context);
    if (context.textures === null) {
      if (glBackend) {
        // Context attributes are stable; do not add a synchronous query to each frame.
        ledger.canvasDepth ??= (renderer.getContext() as WebGL2RenderingContext).getContextAttributes();
      } else {
        const canvasDepth = renderer.getCanvasTarget().depthTexture;
        const data = backend.get(canvasDepth) as { textureDescriptorGPU?: unknown };
        ledger.canvasDepth = data.textureDescriptorGPU
          ? structuredClone(data.textureDescriptorGPU)
          : { allocated: false };
      }
    }
    // One synchronous inspection per mask allocation, before warmed timing. Never retain
    // live renderbuffers in the scalar ledger or query them on ordinary timed frames.
    if (glBackend && names.has('tau-emphasis-mask') && context.renderTarget) {
      const data = backend.get(context.renderTarget) as {
        msaaRenderbuffers?: WebGLRenderbuffer[];
        depthRenderbuffer?: WebGLRenderbuffer;
      };
      const color = data.msaaRenderbuffers?.[0];
      if (color && !inspectedBuffers.has(color)) {
        inspectedBuffers.add(color);
        const gl = renderer.getContext() as WebGL2RenderingContext;
        recordTexture(textures[0]!).renderbuffers = readMaskRenderbuffers(gl, color, data.depthRenderbuffer);
      }
    }
  };
  const draw = backend.draw.bind(backend);
  backend.draw = (object, ...rest) => {
    // GL elapsed queries start after nested dependency passes, immediately before this pass's first draw.
    if (
      glBackend &&
      ledger.timingEnabled &&
      passNames.get(object.context) === passCost &&
      !timedContext &&
      timer?.begin()
    ) {
      timedContext = object.context;
    }
    draw(object, ...rest);
  };
  const finish = backend.finishRender.bind(backend);
  backend.finishRender = (context) => {
    finish(context);
    // Empty end-of-frame control: a nonzero result exposes timer scope/driver batching,
    // not shader work. Never flush or wait to manufacture an isolated pass measurement.
    if (glBackend && ledger.timingEnabled && passCost === 'empty' && context.textures === null && timer?.begin()) {
      timer.end();
    }
    if (context === timedContext) {
      timer?.end();
      timedContext = undefined;
    }
  };
  const dispose = renderer.dispose.bind(renderer);
  renderer.dispose = () => {
    timer?.dispose();
    removeValidationListener?.();
    dispose();
    ledger.disposed = true;
    ledger.disposedAt = performance.now() - started;
    if (glBackend) {
      ledger.retirement = (renderer.getContext() as WebGL2RenderingContext).isContextLost()
        ? 'context-lost'
        : 'dispose-without-context-loss';
    }
  };
}
