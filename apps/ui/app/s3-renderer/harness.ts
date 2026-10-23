/**
 * S3 renderer comparison harness page (Q3, D18). Dev/test only: built by
 * `vite.s3-renderer.config.ts` into `out/s3-renderer/app` and loaded by the
 * desktop fixture under Tau's real `app://` protocol and CSP. The driver
 * (`scripts/s3-renderer/run.mts`) calls `window.s3` through Playwright.
 *
 * The recorded-stream echo stub below stands in for the S2 admitted PTY until
 * Q2 lands it; it is not a shell and never spawns a process.
 */
import '@taucad/ui/styles/tokens.css';
import { createTerminalView } from './terminal-view.js';
import type { RendererKind, TerminalTheme, TerminalView } from './terminal-view.js';

type LatencyKind = 'key' | 'paste' | 'interrupt';
type LatencyRecord = { kind: LatencyKind; t0: number; t1: number; ms: number; found: boolean; underLoad: boolean };
type PendingInput = { kind: LatencyKind; t0: number };
/** `maxBytes` above the fixture size replays it until interrupted or the cap is reached. */
type PlayOptions = { chunkBytes: number; highWater: number; maxBytes?: number };
type PlayResult = {
  bytes: number;
  writtenBytes: number;
  elapsedMs: number;
  interrupted: boolean;
  maxPendingBytes: number;
  longTaskMs: number;
  longTasks: number;
};
type MountOptions = {
  kind: RendererKind;
  /** Reuse the pane element as the terminal host instead of a fresh child per mount. */
  reuseHost?: boolean;
  /** Simulate a machine without WebGL by refusing `webgl`/`webgl2` contexts before the candidate loads. */
  webglUnavailable?: boolean;
  theme: 'light' | 'dark';
  webgl: boolean;
  screenReaderMode: boolean;
  scrollback: number;
  width: number;
  height: number;
};

const pane = document.querySelector<HTMLElement>('#pane')!;
const cadHost = document.querySelector<HTMLElement>('#cad')!;
const fontFamily = "'Geist Mono', ui-monospace, monospace";
const fontSize = 13;
const prompt = 'S3$ ';

/* Count every requestAnimationFrame the page schedules (candidate render loops included) so idle repaint is observable. */
let animationFrameRequests = 0;
const nativeRequestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis);
globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  animationFrameRequests++;
  return nativeRequestAnimationFrame(callback);
};

/* Unclamped macrotask yield: setTimeout(0) clamps to 4 ms after nesting and would cap the stream rate. */
const channel = new MessageChannel();
const yieldQueue: Array<() => void> = [];
channel.port1.addEventListener('message', () => yieldQueue.shift()?.());
channel.port1.start();
const nextTask = async (): Promise<void> =>
  new Promise((resolve) => {
    yieldQueue.push(resolve);
    channel.port2.postMessage(undefined);
  });
const afterPaint = async (): Promise<void> =>
  new Promise((resolve) => {
    nativeRequestAnimationFrame(() => {
      void nextTask().then(resolve);
    });
  });

let longTaskMs = 0;
let longTasks = 0;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    longTaskMs += entry.duration;
    longTasks++;
  }
}).observe({ type: 'longtask', buffered: false });

const securityViolations: string[] = [];
document.addEventListener('securitypolicyviolation', (event) => {
  securityViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
});

const chromeMutations: string[] = [];
new MutationObserver((records) => {
  for (const record of records) {
    if (!pane.contains(record.target) && !cadHost.contains(record.target)) {
      chromeMutations.push(`${record.type} ${record.target.nodeName}`);
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

const colorProbe = document.createElement('canvas').getContext('2d')!;
const tokenColor = (name: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const element = document.createElement('span');
  element.style.color = value;
  document.body.append(element);
  const resolved = getComputedStyle(element).color;
  element.remove();
  /* Canvas normalizes any CSS color (oklch included) to #rrggbb or rgba(), which both candidates parse. */
  colorProbe.fillStyle = '#000';
  colorProbe.fillStyle = resolved;
  return colorProbe.fillStyle;
};
const themeFromTokens = (): TerminalTheme => ({
  background: tokenColor('--background'),
  foreground: tokenColor('--foreground'),
  cursor: tokenColor('--foreground'),
  selectionBackground: tokenColor('--muted'),
});

let view: TerminalView | undefined;
let detachData: (() => void) | undefined;
let pendingInputs: PendingInput[] = [];
let latencies: LatencyRecord[] = [];
let dataLog: string[] = [];
let echoSequence = 0;
let cancelPlay = false;
let playing = false;
let echoEnabled = true;
const fixtures = new Map<string, Uint8Array>();

const tailContains = (marker: string, lines = 400): boolean => {
  if (!view) {
    return false;
  }
  const { length } = view.buffer();
  for (let index = Math.max(0, length - lines); index < length; index++) {
    if (view.lineText(index)?.includes(marker)) {
      return true;
    }
  }
  return false;
};

/* Echo stub: answers input the way a PTY line discipline would, through the same write path the stream uses. */
const echo = (kind: LatencyKind, t0: number, text: string): void => {
  const underLoad = playing;
  const marker = `«${kind[0]}${(echoSequence++).toString(36)}»`;
  view?.write(`${text}${marker}`, () => {
    void afterPaint().then(() => {
      const t1 = performance.now();
      latencies.push({ kind, t0, t1, ms: t1 - t0, found: tailContains(marker, 3000), underLoad });
    });
  });
};

const onTerminalData = (data: string): void => {
  dataLog.push(data);
  if (!echoEnabled) {
    return;
  }
  if (data === '\u0003') {
    cancelPlay = true;
    const input = pendingInputs.findIndex((entry) => entry.kind === 'interrupt');
    const [entry] = input === -1 ? [] : pendingInputs.splice(input, 1);
    echo('interrupt', entry?.t0 ?? performance.now(), `^C\r\n${prompt}`);
    return;
  }
  if (data.startsWith('\u001B[200~') || data.length > 1) {
    const input = pendingInputs.findIndex((entry) => entry.kind === 'paste');
    const [entry] = input === -1 ? [] : pendingInputs.splice(input, 1);
    echo('paste', entry?.t0 ?? performance.now(), data.replace('\u001B[200~', '').replace('\u001B[201~', ''));
    return;
  }
  const input = pendingInputs.findIndex((entry) => entry.kind === 'key');
  const [entry] = input === -1 ? [] : pendingInputs.splice(input, 1);
  if (entry) {
    echo('key', entry.t0, data);
  }
};

globalThis.addEventListener(
  'keydown',
  (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'c') {
      pendingInputs.push({ kind: 'interrupt', t0: event.timeStamp });
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      pendingInputs.push({ kind: 'key', t0: event.timeStamp });
    }
  },
  { capture: true },
);
const pastedTexts: string[] = [];
globalThis.addEventListener(
  'paste',
  (event) => {
    pendingInputs.push({ kind: 'paste', t0: event.timeStamp });
    pastedTexts.push(event.clipboardData?.getData('text/plain') ?? '<no clipboardData>');
  },
  { capture: true },
);

let fontReady: Promise<void> | undefined;
const loadFont = async (): Promise<void> => {
  fontReady ??= (async () => {
    const face = new FontFace('Geist Mono', 'url(./fonts/GeistMono-Variable.woff2)', { weight: '100 900' });
    document.fonts.add(await face.load());
  })();
  return fontReady;
};

let cadStop: (() => { frames: number; intervals: number[] }) | undefined;

const api = {
  async mount(options: MountOptions) {
    await loadFont();
    api.unmount();
    document.documentElement.classList.toggle('dark', options.theme === 'dark');
    document.documentElement.classList.toggle('light', options.theme === 'light');
    pane.style.width = `${options.width}px`;
    pane.style.height = `${options.height}px`;
    pane.style.display = 'block';
    pane.style.background = 'var(--background)';
    if (options.webglUnavailable) {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return type === 'webgl' || type === 'webgl2' ? null : Reflect.apply(getContext, this, [type, ...rest]);
      } as typeof getContext;
    }
    const started = performance.now();
    let host = pane;
    if (!options.reuseHost) {
      host = document.createElement('div');
      host.style.width = '100%';
      host.style.height = '100%';
      pane.append(host);
    }
    view = await createTerminalView({
      kind: options.kind,
      host,
      fontFamily,
      fontSize,
      theme: themeFromTokens(),
      scrollback: options.scrollback,
      webgl: options.webgl,
      screenReaderMode: options.screenReaderMode,
    });
    const size = view.fit();
    detachData = view.onData(onTerminalData);
    view.focus();
    await new Promise<void>((resolve) => {
      view!.write(prompt, resolve);
    });
    await afterPaint();
    return { ...size, renderer: view.renderer(), mountMs: performance.now() - started };
  },
  unmount() {
    detachData?.();
    detachData = undefined;
    view?.dispose();
    view = undefined;
    pane.replaceChildren();
    pendingInputs = [];
    latencies = [];
    dataLog = [];
  },
  async loadFixture(name: string) {
    if (!fixtures.has(name)) {
      const response = await fetch(`./fixtures/${name}.bin`);
      if (!response.ok) {
        throw new Error(`Fixture ${name}: HTTP ${response.status}`);
      }
      fixtures.set(name, new Uint8Array(await response.arrayBuffer()));
    }
    return fixtures.get(name)!.byteLength;
  },
  /** Offer `chunkBytes` per macrotask, gated by `highWater` unacknowledged bytes (xterm's documented flow-control watermark). */
  async play(name: string, options: PlayOptions): Promise<PlayResult> {
    const bytes = fixtures.get(name);
    if (!view || !bytes) {
      throw new Error('Mount and load the fixture first.');
    }
    const target = view;
    const total = Math.max(options.maxBytes ?? bytes.byteLength, bytes.byteLength);
    cancelPlay = false;
    playing = true;
    longTaskMs = 0;
    longTasks = 0;
    let pending = 0;
    let maxPendingBytes = 0;
    let writtenBytes = 0;
    let drained: (() => void) | undefined;
    const started = performance.now();
    for (let offset = 0; offset < total && !cancelPlay; offset += options.chunkBytes) {
      const start = offset % bytes.byteLength;
      const chunk = bytes.subarray(start, Math.min(start + options.chunkBytes, bytes.byteLength));
      pending += chunk.byteLength;
      maxPendingBytes = Math.max(maxPendingBytes, pending);
      writtenBytes += chunk.byteLength;
      target.write(chunk, () => {
        pending -= chunk.byteLength;
        if (pending <= options.highWater / 2) {
          drained?.();
        }
      });
      if (pending > options.highWater) {
        await new Promise<void>((resolve) => {
          drained = resolve;
        });
        drained = undefined;
      }
      await nextTask();
    }
    await new Promise<void>((resolve) => {
      target.write('', resolve);
    });
    await afterPaint();
    playing = false;
    return {
      bytes: bytes.byteLength,
      writtenBytes,
      elapsedMs: performance.now() - started,
      interrupted: cancelPlay,
      maxPendingBytes,
      longTaskMs,
      longTasks,
    };
  },
  async write(text: string) {
    await new Promise<void>((resolve) => {
      view!.write(text, resolve);
    });
    await afterPaint();
  },
  async settle(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await afterPaint();
  },
  setEcho(enabled: boolean) {
    echoEnabled = enabled;
  },
  resetProbe() {
    securityViolations.length = 0;
    chromeMutations.length = 0;
  },
  /** Backing-store pixels per CSS pixel for each candidate canvas, against devicePixelRatio. */
  canvasScales: () => ({
    devicePixelRatio,
    canvases: [...pane.querySelectorAll('canvas')].map((canvas) => ({
      width: canvas.width,
      clientWidth: canvas.clientWidth,
      scale: canvas.clientWidth === 0 ? 0 : canvas.width / canvas.clientWidth,
    })),
  }),
  latencies: () => latencies,
  dataLog: () => dataLog,
  clearLog() {
    latencies = [];
    dataLog = [];
    pendingInputs = [];
  },
  /** Animation-frame requests per second while the page is otherwise idle. */
  async idleFrames(ms: number) {
    const before = animationFrameRequests;
    await new Promise((resolve) => setTimeout(resolve, ms));
    return ((animationFrameRequests - before) * 1000) / ms;
  },
  buffer: () => view?.buffer(),
  lines(start: number, end: number) {
    const lines: string[] = [];
    for (let index = start; index < end; index++) {
      lines.push(view?.lineText(index) ?? '');
    }
    return lines;
  },
  /** The `count` lines ending at the cursor row: where freshly written output lands. */
  aroundCursor(count: number) {
    const snapshot = view?.buffer();
    if (!snapshot) {
      return [];
    }
    const row = snapshot.baseY + snapshot.cursorY;
    return api.lines(Math.max(0, row - count + 1), row + 1);
  },
  paneText: () => pane.innerText,
  tail(count: number) {
    const length = view?.buffer().length ?? 0;
    return api.lines(Math.max(0, length - count), length);
  },
  renderer: () => view?.renderer(),
  fit: () => view?.fit(),
  resize: (cols: number, rows: number) => view?.resize(cols, rows),
  setPaneSize(width: number, height: number) {
    pane.style.width = `${width}px`;
    pane.style.height = `${height}px`;
    return view?.fit();
  },
  focus: () => view?.focus(),
  select: (column: number, row: number, length: number) => view?.select(column, row, length),
  selection: () => view?.selection(),
  setHidden(hidden: boolean) {
    pane.style.display = hidden ? 'none' : 'block';
  },
  activeElementInPane: () => pane.contains(document.activeElement),
  canvasCount: () => pane.querySelectorAll('canvas').length,
  /** Force a WebGL context loss on every WebGL canvas in the pane (R06). */
  loseWebglContexts() {
    let lost = 0;
    for (const canvas of pane.querySelectorAll('canvas')) {
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const extension = context?.getExtension('WEBGL_lose_context');
      if (extension) {
        extension.loseContext();
        lost++;
      }
    }
    return lost;
  },
  paneRect() {
    const rect = pane.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  },
  probe: () => ({
    title: document.title,
    securityViolations: [...securityViolations],
    chromeMutations: [...chromeMutations],
    images: document.querySelectorAll('img').length,
    pastedTexts: [...pastedTexts],
    injected: (globalThis as { s3Injected?: unknown }).s3Injected !== undefined,
    domNodes: document.getElementsByTagName('*').length,
  }),
  heap: () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize,
  async startCad() {
    const three = await import('three');
    const renderer = new three.WebGLRenderer({ antialias: true });
    renderer.setSize(640, 360);
    cadHost.replaceChildren(renderer.domElement);
    const scene = new three.Scene();
    const camera = new three.PerspectiveCamera(45, 640 / 360, 0.1, 100);
    camera.position.z = 6;
    const mesh = new three.Mesh(
      new three.TorusKnotGeometry(1.4, 0.45, 600, 96),
      new three.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.3, roughness: 0.5 }),
    );
    scene.add(mesh, new three.AmbientLight(0xffffff, 0.4));
    const light = new three.DirectionalLight(0xffffff, 1.2);
    light.position.set(3, 4, 5);
    scene.add(light);
    const intervals: number[] = [];
    let last = performance.now();
    let running = true;
    const frame = (now: number): void => {
      if (!running) {
        return;
      }
      intervals.push(now - last);
      last = now;
      mesh.rotation.x += 0.01;
      mesh.rotation.y += 0.013;
      renderer.render(scene, camera);
      nativeRequestAnimationFrame(frame);
    };
    nativeRequestAnimationFrame(frame);
    cadStop = () => {
      running = false;
      renderer.dispose();
      cadHost.replaceChildren();
      return { frames: intervals.length, intervals: intervals.slice(1) };
    };
  },
  stopCad: () => cadStop?.(),
};

Object.assign(globalThis, { s3: api });
document.body.dataset['ready'] = 'true';
