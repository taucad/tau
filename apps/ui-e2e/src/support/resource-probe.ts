/**
 * A page-realm resource probe for the stability circuits (T7): installed before the app's first script, it keeps weak
 * track of the WebGL and WebGPU contexts, GPU devices, workers, object URLs and window/document listeners the page
 * makes, counts the shared workers it constructs, and stamps the document with a random token so a reload cannot pass
 * for the same session.
 *
 * It wraps the native entry points without changing their results, and it reaches what it tracks only through weak
 * references, so it never keeps a canvas, context or device alive. Its own listeners are added before the wrappers and
 * are not counted. It sees the page realm only: a worker's own contexts, URLs and listeners are not counted.
 */

import * as target from '#support/external-target.js';

/** What the probe counts at one moment. The live counts are budgets; the totals are evidence. */
export type ResourceCounts = Readonly<{
  /** The token stamped on the document when it began; it changes only if the document is replaced. */
  document: string;
  /** Dedicated workers alive now, as the browser enumerates them. */
  liveWorkers: number;
  /** WebGL contexts still reachable and not lost. */
  webglContexts: number;
  /** WebGPU canvas contexts still reachable. */
  webgpuContexts: number;
  /** GPU devices still reachable, neither destroyed nor lost. */
  gpuDevices: number;
  /** Object URLs created and not revoked. */
  objectUrls: number;
  /** Listeners on `window` and `document`, deduplicated as the browser does; `once` listeners are not counted. */
  listeners: number;
  /**
   * Shared workers the page has constructed. A shared worker outlives the page's handle to it and the browser does not
   * enumerate it to the page, so this is a construction count, not a live one: any shared worker made after the
   * baseline counts as growth.
   */
  sharedWorkers: number;
  totals: Readonly<{
    workersConstructed: number;
    workersTerminated: number;
    sharedWorkersConstructed: number;
    webglContextsCreated: number;
    webgpuContextsCreated: number;
    gpuDevicesCreated: number;
    objectUrlsCreated: number;
    objectUrlsRevoked: number;
  }>;
  /**
   * Resource elements (scripts, stylesheets, preloads) that failed to load, and Vite preload failures, since the
   * document began: cumulative, so a reader judges only the entries past the last it read.
   */
  loadErrors: readonly string[];
}>;

type PageCounts = Omit<ResourceCounts, 'liveWorkers'>;

/**
 * The probe itself, serialized into the page as an init script. Self-contained: it may use nothing from this module.
 */
const installProbe = (): void => {
  type Tracked = { readonly reference: WeakRef<WeakKey>; readonly isLive: (value: WeakKey) => boolean };
  const scope = globalThis as typeof globalThis & { __tauResourceProbe?: unknown };
  if (scope.__tauResourceProbe !== undefined) {
    return;
  }
  const totals = {
    workersConstructed: 0,
    workersTerminated: 0,
    sharedWorkersConstructed: 0,
    webglContextsCreated: 0,
    webgpuContextsCreated: 0,
    gpuDevicesCreated: 0,
    objectUrlsCreated: 0,
    objectUrlsRevoked: 0,
  };
  const loadErrors: string[] = [];
  const contexts = { webgl: [] as Tracked[], webgpu: [] as Tracked[], devices: [] as Tracked[] };
  const seenContexts = new WeakSet();
  const endedDevices = new WeakSet();
  const objectUrls = new Set<string>();
  /** `type|capture` to the listeners registered under it, for window and document apart. */
  const listeners = new Map<EventTarget, Map<string, Set<unknown>>>();

  // The probe's own listeners go in before the wrappers, so they are never counted.
  globalThis.addEventListener(
    'error',
    (event) => {
      const element = event.target;
      if (element instanceof HTMLScriptElement || element instanceof HTMLLinkElement) {
        loadErrors.push(
          `${element.tagName.toLowerCase()} ${element instanceof HTMLScriptElement ? element.src : element.href}`,
        );
      }
    },
    true,
  );
  globalThis.addEventListener('vite:preloadError', (event) => {
    loadErrors.push(`vite:preloadError ${String((event as Event & { payload?: unknown }).payload)}`);
  });

  const nativeWorker = globalThis.Worker;
  globalThis.Worker = new Proxy(nativeWorker, {
    construct(constructor, parameters: ConstructorParameters<typeof Worker>, newTarget) {
      totals.workersConstructed += 1;
      return Reflect.construct(constructor, parameters, newTarget) as Worker;
    },
  });
  const nativeTerminate = nativeWorker.prototype.terminate;
  nativeWorker.prototype.terminate = function terminate(this: Worker) {
    totals.workersTerminated += 1;
    nativeTerminate.call(this);
  };
  const nativeSharedWorker = globalThis.SharedWorker as typeof SharedWorker | undefined;
  if (nativeSharedWorker) {
    globalThis.SharedWorker = new Proxy(nativeSharedWorker, {
      construct(constructor, parameters: ConstructorParameters<typeof SharedWorker>, newTarget) {
        totals.sharedWorkersConstructed += 1;
        return Reflect.construct(constructor, parameters, newTarget) as SharedWorker;
      },
    });
  }

  const trackContext = (context: unknown, kind: unknown): void => {
    if (context === null || typeof context !== 'object' || seenContexts.has(context)) {
      return;
    }
    seenContexts.add(context);
    if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') {
      totals.webglContextsCreated += 1;
      contexts.webgl.push({
        reference: new WeakRef(context),
        isLive: (value) => !(value as WebGLRenderingContext).isContextLost(),
      });
    } else if (kind === 'webgpu') {
      totals.webgpuContextsCreated += 1;
      contexts.webgpu.push({ reference: new WeakRef(context), isLive: () => true });
    }
  };
  for (const canvasClass of [globalThis.HTMLCanvasElement, globalThis.OffscreenCanvas]) {
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- OffscreenCanvas is absent in old engines.
    if (!canvasClass) {
      continue;
    }
    const nativeGetContext = canvasClass.prototype.getContext as (
      this: HTMLCanvasElement | OffscreenCanvas,
      ...parameters: unknown[]
    ) => unknown;
    Object.defineProperty(canvasClass.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: function getContext(this: HTMLCanvasElement | OffscreenCanvas, ...parameters: unknown[]): unknown {
        const context = nativeGetContext.apply(this, parameters);
        trackContext(context, parameters[0]);
        return context;
      },
    });
  }

  type Device = { readonly lost: Promise<unknown>; destroy(): void };
  type Adapter = { requestDevice(...parameters: unknown[]): Promise<Device> };
  const gpu = globalThis as typeof globalThis & {
    GPUAdapter?: { prototype: Adapter };
    GPUDevice?: { prototype: Device };
  };
  if (gpu.GPUAdapter && gpu.GPUDevice) {
    const nativeRequestDevice = gpu.GPUAdapter.prototype.requestDevice;
    gpu.GPUAdapter.prototype.requestDevice = async function requestDevice(
      this: Adapter,
      ...parameters: unknown[]
    ): Promise<Device> {
      const device = await nativeRequestDevice.apply(this, parameters);
      totals.gpuDevicesCreated += 1;
      contexts.devices.push({ reference: new WeakRef(device), isLive: (value) => !endedDevices.has(value) });
      // async-iife: bootstrap -- a device is lost whenever the browser says so, and nothing waits on it.
      void (async () => {
        await device.lost;
        endedDevices.add(device);
      })();
      return device;
    };
    const nativeDestroy = gpu.GPUDevice.prototype.destroy;
    gpu.GPUDevice.prototype.destroy = function destroy(this: Device) {
      endedDevices.add(this);
      nativeDestroy.call(this);
    };
  }

  const nativeCreateObjectUrl = URL.createObjectURL.bind(URL);
  const nativeRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (object: Blob | MediaSource): string => {
    const url = nativeCreateObjectUrl(object);
    totals.objectUrlsCreated += 1;
    objectUrls.add(url);
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    if (objectUrls.delete(url)) {
      totals.objectUrlsRevoked += 1;
    }
    nativeRevokeObjectUrl(url);
  };

  const nativeAdd = EventTarget.prototype.addEventListener;
  const nativeRemove = EventTarget.prototype.removeEventListener;
  const captureOf = (options: unknown): boolean =>
    typeof options === 'boolean' ? options : Boolean((options as { capture?: boolean } | undefined)?.capture);
  const registry = (eventTarget: EventTarget, key: string): Set<unknown> => {
    let byKey = listeners.get(eventTarget);
    if (!byKey) {
      byKey = new Map();
      listeners.set(eventTarget, byKey);
    }
    let set = byKey.get(key);
    if (!set) {
      set = new Set();
      byKey.set(key, set);
    }
    return set;
  };
  const forget = (eventTarget: EventTarget, key: string, listener: unknown) => (): void => {
    registry(eventTarget, key).delete(listener);
  };
  EventTarget.prototype.addEventListener = function addEventListener(
    this: EventTarget,
    ...parameters: Parameters<EventTarget['addEventListener']>
  ): void {
    nativeAdd.apply(this, parameters);
    const [type, listener, options] = parameters;
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- only window and document are counted.
    if ((this !== globalThis && this !== document) || !listener) {
      return;
    }
    const settings = typeof options === 'object' ? options : undefined;
    if (settings?.once === true || settings?.signal?.aborted === true) {
      return;
    }
    const key = `${type}|${String(captureOf(options))}`;
    registry(this, key).add(listener);
    settings?.signal?.addEventListener('abort', forget(this, key, listener));
  };
  EventTarget.prototype.removeEventListener = function removeEventListener(
    this: EventTarget,
    ...parameters: Parameters<EventTarget['removeEventListener']>
  ): void {
    nativeRemove.apply(this, parameters);
    const [type, listener, options] = parameters;
    if (this === globalThis || this === document) {
      listeners
        .get(this)
        ?.get(`${type}|${String(captureOf(options))}`)
        ?.delete(listener);
    }
  };

  const live = (tracked: Tracked[]): number =>
    tracked.filter(({ reference, isLive }) => {
      const value = reference.deref();
      return value !== undefined && isLive(value);
    }).length;
  scope.__tauResourceProbe = {
    // The document's own time origin, plus a random tail in case two documents begin in the same millisecond.
    document: `${String(performance.timeOrigin)}-${Math.random().toString(36).slice(2)}`,
    read: () => ({
      webglContexts: live(contexts.webgl),
      webgpuContexts: live(contexts.webgpu),
      gpuDevices: live(contexts.devices),
      objectUrls: objectUrls.size,
      listeners: [...listeners.values()].reduce(
        (sum, byKey) => sum + [...byKey.values()].reduce((count, set) => count + set.size, 0),
        0,
      ),
      sharedWorkers: totals.sharedWorkersConstructed,
      totals: { ...totals },
      loadErrors: [...loadErrors],
    }),
  };
};

/** Install the probe on the target's page; call before the first navigation, after the target opens. */
export const installResourceProbe = async (): Promise<void> => {
  await target.addInitScript(installProbe);
};

/**
 * Read the probe after a garbage collection, so a context or device the page no longer references is not counted.
 *
 * @returns The counts.
 */
export const readResources = async (): Promise<ResourceCounts> => {
  await target.collectGarbage();
  const page = await target.evaluate(() => {
    const probe = (
      globalThis as typeof globalThis & {
        __tauResourceProbe?: { document: string; read: () => Omit<PageCounts, 'document'> };
      }
    ).__tauResourceProbe;
    if (!probe) {
      throw new Error('The resource probe is not installed in this document.');
    }
    return { document: probe.document, ...probe.read() };
  });
  const workers = await target.workers();
  return { ...page, liveWorkers: workers.length };
};

/** The budgeted counts, by name, so a growth check can name what grew. */
export const liveResourceNames = [
  'liveWorkers',
  'webglContexts',
  'webgpuContexts',
  'gpuDevices',
  'objectUrls',
  'listeners',
  'sharedWorkers',
] as const satisfies ReadonlyArray<keyof ResourceCounts>;
