/* eslint-disable @typescript-eslint/naming-convention -- CONSTANT_CASE is expected for environment variables */
import { readFile } from 'node:fs/promises';
// oxlint-disable-next-line import-x/no-unassigned-import -- this is a side effect
import '@testing-library/jest-dom';

// Vite rewrites package-owned WASM/font assets to /@fs/ URLs. Jsdom has no Vite
// HTTP server, so load those same real bytes directly while preserving normal fetches.
const networkFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  // `location` is absent in `@vitest-environment node` files (server.test.ts); their URLs are already absolute.
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the DOM lib types `location` as always present.
  const url = new URL(input instanceof Request ? input.url : input.toString(), globalThis.location?.href);
  const isLocalAsset = url.pathname.startsWith('/@fs/') && /\.(?:ttf|wasm)$/u.test(url.pathname);
  if (!isLocalAsset) {
    return networkFetch(input, init);
  }
  const bytes = await readFile(decodeURIComponent(url.pathname.slice('/@fs'.length)));
  const contentType = url.pathname.endsWith('.wasm') ? 'application/wasm' : 'font/ttf';
  return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': contentType } });
};

// Mock window.ENV for testing - required since the app uses window.ENV in browser environments
const mockEnv = {
  TAU_API_URL: 'http://localhost:4000',
  TAU_WEBSOCKET_URL: 'ws://localhost:4001',
  TAU_FRONTEND_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
};

Object.defineProperty(globalThis, 'ENV', {
  writable: true,
  value: mockEnv,
});

// ESBuild-wasm checks that TextEncoder returns this realm's Uint8Array.
// Jsdom can mix Node's TextEncoder with jsdom's typed-array constructors,
// which fails that invariant before browser-side GeoSpec tests can bundle.
const NativeTextEncoder = globalThis.TextEncoder;
if (typeof NativeTextEncoder === 'function' && !(new NativeTextEncoder().encode('') instanceof Uint8Array)) {
  class RealmSafeTextEncoder extends NativeTextEncoder {
    public override encode(input?: string): Uint8Array<ArrayBuffer> {
      return new Uint8Array(super.encode(input));
    }
  }

  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    writable: true,
    value: RealmSafeTextEncoder,
  });
}

// Monaco 0.55+ evaluates `document.queryCommandSupported('paste')` at module load
// (see monaco-editor clipboard contribution). jsdom does not implement it.
// oxlint-disable-next-line @typescript-eslint/no-deprecated -- Monaco still probes the deprecated DOM API; jsdom needs the stub to load
if (typeof document !== 'undefined' && typeof document.queryCommandSupported !== 'function') {
  Object.defineProperty(document, 'queryCommandSupported', {
    configurable: true,
    writable: true,
    value: () => false,
  });
}

const g = globalThis as typeof globalThis & {
  MonacoEnvironment?: { getWorkerUrl?: (moduleId: string, label: string) => string };
};
g.MonacoEnvironment ??= {
  getWorkerUrl(): string {
    const source = 'self.onmessage=function(){};';
    return `data:application/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  },
};

// Jsdom does not define the Web `Worker` global; Monaco still constructs one for TS diagnostics.
// oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- DOM types claim Worker is always defined; jsdom omits it
globalThis.Worker ??= class Worker {
  public postMessage(_message: unknown): void {
    /* Noop stub for jsdom */
  }

  public terminate(): void {
    /* Noop stub for jsdom */
  }

  public addEventListener(): void {
    /* Noop stub for jsdom */
  }

  public removeEventListener(): void {
    /* Noop stub for jsdom */
  }

  public dispatchEvent(): boolean {
    return true;
  }
} as unknown as typeof Worker;

// Mock common browser APIs for testing
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {
      // No-op
    },
    removeListener() {
      // No-op
    },
    addEventListener() {
      // No-op
    },
    removeEventListener() {
      // No-op
    },
    dispatchEvent() {
      // No-op
    },
  }),
});

// Mock IntersectionObserver
globalThis.IntersectionObserver = class IntersectionObserver {
  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/root) */

  public get root() {
    return null;
  }

  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/rootMargin) */
  public get rootMargin() {
    return '0px';
  }

  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/scrollMargin) */
  public get scrollMargin() {
    return '0px';
  }

  /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/IntersectionObserver/thresholds) */
  public readonly thresholds: readonly number[] = [0];

  public observe() {
    // No-op
  }

  public unobserve() {
    // No-op
  }

  public disconnect() {
    // No-op
  }

  public takeRecords() {
    return [];
  }
};

// Mock ResizeObserver
globalThis.ResizeObserver = class ResizeObserver {
  public observe() {
    // No-op
  }

  public unobserve() {
    // No-op
  }

  public disconnect() {
    // No-op
  }
};

// Polyfill User Timing API Level 3 for jsdom.
// jsdom's performance.measure() doesn't support the options-object form
// (PerformanceMeasureOptions with { start, detail }), which causes
// "Invalid target origin '[object Object]'" errors. Replace with no-op stubs
// that return minimal PerformanceEntry-shaped objects.
const stubEntry = {
  name: '',
  startTime: 0,
  duration: 0,
  entryType: '',
  detail: undefined,
  toJSON: () => ({}),
};
globalThis.performance.mark = (() => stubEntry) as typeof globalThis.performance.mark;
globalThis.performance.measure = (() => stubEntry) as typeof globalThis.performance.measure;

// Jsdom returns null from HTMLCanvasElement.getContext('2d'), which crashes
// `three/addons` modules that call `ctx.fillStyle = …` at module load time
// (e.g. `lottie_canvas.module.js`'s ImagePreloader). Stub a minimal 2d context
// shape so test files importing from `three/addons` don't fail to load.
// oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- jsdom only ships HTMLCanvasElement when canvas package is installed
if (typeof HTMLCanvasElement !== 'undefined') {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(
    this: HTMLCanvasElement,
    contextId: string,
    options?: unknown,
  ): unknown {
    if (contextId === '2d') {
      return {
        canvas: this,
        fillStyle: '',
        strokeStyle: '',
        globalAlpha: 1,
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        fillRect() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        clearRect() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        putImageData() {},
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        setTransform() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        translate() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        scale() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        save() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        restore() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        beginPath() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        closePath() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        moveTo() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        lineTo() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        stroke() {},
        // oxlint-disable-next-line no-empty-function -- noop stub for jsdom
        fill() {},
        measureText: () => ({ width: 0 }),
      };
    }
    return (originalGetContext as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(
      this,
      contextId,
      options,
    );
  } as typeof HTMLCanvasElement.prototype.getContext;
}

// PerformanceObserver is not available in jsdom -- stub it for telemetry code
// oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/consistent-type-assertions -- jsdom doesn't provide PerformanceObserver despite type declarations; class assignment to globalThis requires cast
globalThis.PerformanceObserver ??= class PerformanceObserver {
  public observe() {
    // No-op
  }

  public disconnect() {
    // No-op
  }

  public takeRecords() {
    return [];
  }
} as unknown as typeof globalThis.PerformanceObserver;
