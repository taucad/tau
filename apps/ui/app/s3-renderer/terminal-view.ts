/**
 * S3 comparison adapter (Q3, D18): one small surface over the two candidate
 * terminal renderers so the harness drives both identically. Dev/test only;
 * nothing under `app/routes` imports it and no production selector exists.
 */
import type * as GhosttyWeb from 'ghostty-web';

/** `ghostty131` is ghostty-web's own code with a WASM rebuilt on Ghostty v1.3.1 (`scripts/s3-renderer/build-ghostty-wasm.sh`). */
export type RendererKind = 'xterm' | 'ghostty' | 'ghostty131' | 'aurigax';

export type TerminalTheme = {
  readonly background: string;
  readonly foreground: string;
  readonly cursor: string;
  readonly selectionBackground: string;
};

export type TerminalViewOptions = {
  readonly kind: RendererKind;
  readonly host: HTMLElement;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly theme: TerminalTheme;
  readonly scrollback: number;
  /** Request WebGL (xterm's addon, AurigaX's renderer); ghostty-web always draws with Canvas 2D. */
  readonly webgl: boolean;
  readonly screenReaderMode: boolean;
  /** Receives link activations instead of the renderer opening a window; the host applies Tau's link policy. */
  readonly onLinkActivate?: (uri: string, event: MouseEvent) => void;
};

export type BufferSnapshot = {
  readonly type: 'normal' | 'alternate';
  readonly length: number;
  readonly cursorX: number;
  readonly cursorY: number;
  readonly baseY: number;
};

export type TerminalView = {
  readonly kind: RendererKind;
  /** The renderer currently drawing: changes from `webgl` to `dom` after a context loss fallback. */
  renderer(): 'webgl' | 'dom' | 'canvas2d';
  write(data: Uint8Array<ArrayBuffer> | string, done?: () => void): void;
  onData(listener: (data: string) => void): () => void;
  fit(): { cols: number; rows: number };
  resize(cols: number, rows: number): void;
  focus(): void;
  buffer(): BufferSnapshot;
  lineText(index: number): string | undefined;
  select(column: number, row: number, length: number): void;
  selection(): string;
  dispose(): void;
};

type BufferLike = {
  readonly active: {
    readonly type: 'normal' | 'alternate';
    readonly length: number;
    readonly cursorX: number;
    readonly cursorY: number;
    readonly baseY: number;
    getLine(index: number): { translateToString(trimRight?: boolean): string } | undefined;
  };
};

const snapshotOf = (buffer: BufferLike): BufferSnapshot => {
  const { type, length, cursorX, cursorY, baseY } = buffer.active;
  return { type, length, cursorX, cursorY, baseY };
};

const createXtermView = async (options: TerminalViewOptions): Promise<TerminalView> => {
  const [xterm, xtermFit] = await Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]);
  await import('@xterm/xterm/css/xterm.css');
  const terminal = new xterm.Terminal({
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    theme: options.theme,
    scrollback: options.scrollback,
    screenReaderMode: options.screenReaderMode,
    allowProposedApi: true,
    ...(options.onLinkActivate && {
      linkHandler: {
        activate: (event: MouseEvent, uri: string) => {
          options.onLinkActivate?.(uri, event);
        },
      },
    }),
  });
  const fitAddon = new xtermFit.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(options.host);
  let renderer: 'webgl' | 'dom' = 'dom';
  if (options.webgl) {
    const xtermWebgl = await import('@xterm/addon-webgl');
    try {
      const webgl = new xtermWebgl.WebglAddon();
      // The supported xterm fallback: drop the WebGL addon on context loss and keep the DOM renderer drawing.
      webgl.onContextLoss(() => {
        webgl.dispose();
        renderer = 'dom';
      });
      terminal.loadAddon(webgl);
      renderer = 'webgl';
    } catch {
      renderer = 'dom';
    }
  }
  return {
    kind: 'xterm',
    renderer: () => renderer,
    write: (data, done) => {
      terminal.write(data, done);
    },
    onData(listener) {
      const subscription = terminal.onData(listener);
      return () => {
        subscription.dispose();
      };
    },
    fit() {
      fitAddon.fit();
      return { cols: terminal.cols, rows: terminal.rows };
    },
    resize: (cols, rows) => {
      terminal.resize(cols, rows);
    },
    focus: () => {
      terminal.focus();
    },
    buffer: () => snapshotOf(terminal.buffer),
    lineText: (index) => terminal.buffer.active.getLine(index)?.translateToString(true),
    select: (column, row, length) => {
      terminal.select(column, row, length);
    },
    selection: () => terminal.getSelection(),
    dispose: () => {
      terminal.dispose();
    },
  };
};

/**
 * The ghostty-web package forwards `scrollback` to Ghostty's byte limit, not xterm's line count (upstream PR #177 would change
 * that). Measured on the R01 stream at 118 columns, 16,000,000 bytes retained 9,374 lines, so lines map to bytes at
 * 1,750 each to give both candidates the same retained history.
 */
const ghosttyScrollbackBytesPerLine = 1750;

/** Milliseconds the render loop keeps running after the last write or interaction before it parks. */
const ghosttyRenderBurst = 250;

/** Milliseconds between offers of buffered output to the screen-reader live region; the next two bound how much. */
const announceDelay = 100;
const announceMaxLines = 20;
const announceRetainedLines = 100;

/* ESC sequences (CSI, OSC, DCS/SOS/PM/APC, two-byte) and C0 controls other than line feed. */
const controlSequences =
  // oxlint-disable-next-line no-control-regex -- Stripping terminal control sequences is the point of this pattern.
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|][^\u0007\u001B]*(?:\u0007|\u001B\\)?|[PX^_][^\u001B]*(?:\u001B\\)?|[@-Z\\-_])|[\u0000-\u0009\u000B-\u001F\u007F]/g;

/**
 * The ghostty-web members the adapter reaches past the public API, all present in 0.4.0 and next.20. Each use is a
 * Tau-side shim for an upstream gap, listed in the S3 report with the issue or PR that would retire it.
 */
type GhosttyInternals = {
  readonly viewportY: number;
  readonly scrollbarOpacity: number;
  readonly wasmTerm?: unknown;
  readonly renderer?: {
    devicePixelRatio: number;
    getCanvas(): HTMLCanvasElement;
    resize(cols: number, rows: number): void;
    render(buffer: unknown, forceAll: boolean, viewportY: number, provider: unknown, scrollbarOpacity: number): void;
  };
  readonly inputHandler?: { readonly encoder: { setOption(option: number, value: boolean): void } };
  readonly linkDetector?: { providers: GhosttyWeb.ILinkProvider[] };
  startRenderLoop(): void;
  cancelRenderLoop(): void;
};

/** The parts of ghostty-web's WASM terminal the per-frame viewport read uses. */
type GhosttyRenderable = {
  // oxlint-disable-next-line typescript/no-restricted-types -- Mirrors the ghostty-web method it replaces.
  getLine(y: number): GhosttyWeb.GhosttyCell[] | null;
  getViewport(): readonly GhosttyWeb.GhosttyCell[];
  getDimensions(): { cols: number; rows: number };
  update(): number;
};

/** A visually hidden `role=log` region that offers new output, stripped of control sequences, to screen readers. */
const createOutputAnnouncer = (host: HTMLElement) => {
  const region = document.createElement('div');
  region.setAttribute('role', 'log');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-label', 'Terminal output');
  Object.assign(region.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'pre',
  });
  host.append(region);
  const decoder = new TextDecoder();
  let pending = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = (): void => {
    timer = undefined;
    const lines = pending
      .replaceAll(controlSequences, '')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
      .slice(-announceMaxLines);
    pending = '';
    for (const line of lines) {
      const row = document.createElement('div');
      row.textContent = line;
      region.append(row);
    }
    while (region.childElementCount > announceRetainedLines) {
      region.firstElementChild?.remove();
    }
  };
  return {
    push(data: Uint8Array<ArrayBuffer> | string): void {
      pending += typeof data === 'string' ? data : decoder.decode(data, { stream: true });
      /* Only the tail can be announced; drop the rest before stripping so a flood costs no more than a line. */
      if (pending.length > 16_384) {
        pending = pending.slice(-16_384);
      }
      timer ??= setTimeout(flush, announceDelay);
    },
    dispose(): void {
      clearTimeout(timer);
      region.remove();
    },
  };
};

const createGhosttyView = async (options: TerminalViewOptions): Promise<TerminalView> => {
  const ghostty = await import('ghostty-web');
  /* The selection manager auto-scrolls while a drag is within 30 px of the top or bottom edge, so a drag along the
   * first two rows grows upward every 50 ms. Zero keeps auto-scroll for drags that leave the canvas, as xterm does. */
  Reflect.set(ghostty.SelectionManager, 'AUTO_SCROLL_EDGE_SIZE', 0);
  /* One WASM instance per terminal. Freeing a terminal that drew multi-codepoint graphemes leaves the shared
   * instance's allocator corrupt, so the next terminal on it traps (R03). Disposing the instance with its terminal
   * avoids that; `Terminal.reset()` hits the same fault and is never called (write RIS instead). */
  const terminal = new ghostty.Terminal({
    ghostty: await ghostty.Ghostty.load(options.kind === 'ghostty131' ? './ghostty-vt-1.3.1.wasm' : undefined),
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    theme: options.theme,
    scrollback: Math.round(options.scrollback * ghosttyScrollbackBytesPerLine),
  });
  const internals = terminal as unknown as GhosttyInternals;
  const fitAddon = new ghostty.FitAddon();
  terminal.loadAddon(fitAddon);

  /* The ghostty-web package turns its parent into the focusable textbox, so it gets its own element and the live region sits
   * beside it. */
  const mount = document.createElement('div');
  mount.style.width = '100%';
  mount.style.height = '100%';
  options.host.append(mount);
  const announcer = options.screenReaderMode ? createOutputAnnouncer(options.host) : undefined;

  /* `SelectionManager` adds an anonymous document `mousedown` listener that `dispose()` never removes, which keeps the
   * whole terminal and its WASM memory reachable (upstream PR #206). Record what `open()` adds and remove it later. */
  const documentListeners: Array<Parameters<Document['addEventListener']>> = [];
  const { addEventListener } = document;
  document.addEventListener = function (this: Document, ...arguments_: Parameters<Document['addEventListener']>) {
    documentListeners.push(arguments_);
    Reflect.apply(addEventListener, this, arguments_);
  } as Document['addEventListener'];
  try {
    terminal.open(mount);
  } finally {
    Reflect.deleteProperty(document, 'addEventListener');
  }
  const { renderer } = internals;
  const wasmTerm = internals.wasmTerm as GhosttyRenderable | undefined;
  if (renderer && wasmTerm) {
    /* `getLine()` re-reads and re-parses the whole viewport for every row it returns, so a full frame costs one
     * viewport read per row. Read it once per frame instead, as upstream PR #191 does inside the renderer. */
    const { getLine } = wasmTerm;
    const render = renderer.render.bind(renderer);
    renderer.render = (...arguments_) => {
      let viewport: readonly GhosttyWeb.GhosttyCell[] | undefined;
      wasmTerm.getLine = (y) => {
        const { cols, rows } = wasmTerm.getDimensions();
        if (y < 0 || y >= rows) {
          return null;
        }
        if (!viewport) {
          wasmTerm.update();
          viewport = wasmTerm.getViewport();
        }
        return viewport.slice(y * cols, (y + 1) * cols).map((cell) => ({ ...cell }));
      };
      try {
        render(...arguments_);
      } finally {
        wasmTerm.getLine = getLine;
      }
    };
  }
  const disposers: Array<() => void> = [];
  const listen = <K extends keyof DocumentEventMap>(
    target: Document | HTMLElement,
    type: K,
    listener: (event: DocumentEventMap[K]) => void,
  ): void => {
    target.addEventListener(type, listener as EventListener, {
      capture: true,
      passive: type !== 'copy' && type !== 'paste',
    });
    disposers.push(() => {
      target.removeEventListener(type, listener as EventListener, { capture: true });
    });
  };

  /* The ghostty-web package redraws from an unconditional requestAnimationFrame loop, so an idle terminal paints every frame.
   * Run the loop only while output or input is arriving, then park it; ghostty's own scrollbar fades draw directly. */
  const startRenderLoop = internals.startRenderLoop.bind(terminal);
  let parkTimer: ReturnType<typeof setTimeout> | undefined;
  const wake = (): void => {
    startRenderLoop();
    clearTimeout(parkTimer);
    parkTimer = setTimeout(() => {
      internals.cancelRenderLoop();
    }, ghosttyRenderBurst);
  };
  internals.startRenderLoop = wake;
  wake();
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'keydown', 'focusin', 'focusout'] as const) {
    listen(mount, type, wake);
  }
  /* A drag selection keeps tracking once the pointer leaves the canvas. */
  listen(document, 'pointermove', (event) => {
    if (event.buttons !== 0) {
      wake();
    }
  });

  /* Alt+key should send ESC+key (DEC 1036, xterm's default); ghostty's encoder supports it but nothing enables it. */
  internals.inputHandler?.encoder.setOption(ghostty.KeyEncoderOption.ALT_ESC_PREFIX, true);

  /* Paste the way xterm does: line breaks become CR, which raw-mode programs read as Enter. The ghostty-web package
   * forwards LF unchanged; `paste()` still applies bracketed paste. */
  listen(mount, 'paste', (event) => {
    const text = event.clipboardData?.getData('text/plain');
    event.preventDefault();
    event.stopImmediatePropagation();
    if (text) {
      terminal.paste(text.replaceAll(/\r?\n/g, '\r'));
    }
  });

  /* Edit→Copy and the copy accelerator: ghostty-web has no `copy` listener, so the native command copies nothing. */
  listen(document, 'copy', (event) => {
    if (mount.contains(document.activeElement) && terminal.hasSelection()) {
      event.clipboardData?.setData('text/plain', terminal.getSelection());
      event.preventDefault();
    }
  });

  if (renderer) {
    /* The renderer reads devicePixelRatio once; it resizes its backing store itself once the ratio changes. */
    let resolution: MediaQueryList | undefined;
    const onResolutionChange = (): void => {
      renderer.devicePixelRatio = globalThis.devicePixelRatio;
      wake();
      watchResolution();
    };
    const watchResolution = (): void => {
      resolution?.removeEventListener('change', onResolutionChange);
      resolution = globalThis.matchMedia(`(resolution: ${globalThis.devicePixelRatio}dppx)`);
      resolution.addEventListener('change', onResolutionChange);
    };
    watchResolution();
    disposers.push(() => {
      resolution?.removeEventListener('change', onResolutionChange);
    });

    /* A restored 2D context comes back blank and unscaled, and ghostty only repaints dirty rows. */
    listen(renderer.getCanvas() as unknown as HTMLElement, 'contextrestored' as keyof DocumentEventMap, () => {
      renderer.resize(terminal.cols, terminal.rows);
      renderer.render(internals.wasmTerm, true, internals.viewportY, terminal, internals.scrollbarOpacity);
      wake();
    });
  }

  /* The built-in OSC 8 and URL providers call window.open on Ctrl/Cmd-click for any scheme; route http(s) links to
   * the host's policy, as xterm's `linkHandler` does, and drop the rest. */
  const { linkDetector } = internals;
  if (linkDetector && options.onLinkActivate) {
    const { onLinkActivate } = options;
    linkDetector.providers = linkDetector.providers.map((provider) => ({
      provideLinks(y, callback) {
        provider.provideLinks(y, (links) => {
          callback(
            links?.map((link) => ({
              ...link,
              activate(event: MouseEvent) {
                if ((event.ctrlKey || event.metaKey) && /^https?:/i.test(link.text)) {
                  onLinkActivate(link.text, event);
                }
              },
            })),
          );
        });
      },
      dispose: () => provider.dispose?.(),
    }));
  }

  /* The ghostty-web package reports `baseY` as 0; xterm's is the first viewport row, which the harness relies on. */
  const ghosttyBaseY = (): number =>
    terminal.buffer.active.type === 'alternate' ? 0 : Math.max(0, terminal.buffer.active.length - terminal.rows);
  return {
    kind: options.kind,
    renderer: () => 'canvas2d',
    write(data, done) {
      /* The ghostty-web package parses synchronously but defers the callback to the next animation frame, and a zero-length write
       * throws a RangeError from its WASM allocator. Acknowledge at parse completion, as xterm does, so flow control
       * and paint timing mean the same thing for both candidates. */
      if (data.length > 0) {
        terminal.write(data);
        announcer?.push(data);
        wake();
      }
      if (done) {
        queueMicrotask(done);
      }
    },
    onData(listener) {
      const subscription = terminal.onData(listener);
      return () => {
        subscription.dispose();
      };
    },
    fit() {
      /* FitAddon.fit() drops calls within 50 ms of its last resize and never retries, so a burst of resizes can end
       * at a stale size. Terminal.resize() is synchronous and safe to call directly. */
      const proposed = fitAddon.proposeDimensions();
      if (proposed && (proposed.cols !== terminal.cols || proposed.rows !== terminal.rows)) {
        terminal.resize(proposed.cols, proposed.rows);
      }
      return { cols: terminal.cols, rows: terminal.rows };
    },
    resize: (cols, rows) => {
      terminal.resize(cols, rows);
    },
    focus: () => {
      terminal.focus();
      wake();
    },
    buffer: () => ({ ...snapshotOf(terminal.buffer), baseY: ghosttyBaseY() }),
    lineText: (index) => terminal.buffer.active.getLine(index)?.translateToString(true),
    /* The ghostty-web package selects by viewport row; the adapter takes an absolute buffer row like xterm. */
    select: (column, row, length) => {
      terminal.select(column, row - ghosttyBaseY(), length);
      wake();
    },
    selection: () => terminal.getSelection(),
    dispose: () => {
      clearTimeout(parkTimer);
      for (const dispose of disposers) {
        dispose();
      }
      announcer?.dispose();
      terminal.dispose();
      for (const [type, listener, listenerOptions] of documentListeners) {
        document.removeEventListener(type, listener, listenerOptions);
      }
      mount.remove();
    },
  };
};

/**
 * The AurigaX fork of ghostty-web (`@aurigax-ai/ghostty-web`) builds Ghostty's official libghostty-vt rather than
 * ghostty-web's patched Ghostty, so it lacks the scrollback page leak fixed upstream in Ghostty PR #10251. It already
 * acknowledges writes at parse completion, parks its render loop when idle, sends the Alt prefix, counts scrollback in
 * lines and routes links through `linkHandler`; the shims below cover what it still lacks.
 */
const createAurigaxView = async (options: TerminalViewOptions): Promise<TerminalView> => {
  const aurigax = await import('#s3-renderer/aurigax-ghostty-web');
  /* Same edge auto-scroll as ghostty-web's selection manager (see createGhosttyView). */
  Reflect.set(aurigax.SelectionManager, 'AUTO_SCROLL_EDGE_SIZE', 0);
  const terminal = new aurigax.Terminal({
    ghostty: await aurigax.Ghostty.load(),
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    theme: options.theme,
    scrollback: options.scrollback,
    renderer: options.webgl ? 'webgl' : 'canvas',
    ...(options.onLinkActivate && {
      linkHandler: {
        activate(event: MouseEvent, uri: string) {
          if (/^https?:/i.test(uri)) {
            options.onLinkActivate?.(uri, event);
          }
        },
      },
    }),
  });
  const fitAddon = new aurigax.FitAddon();
  terminal.loadAddon(fitAddon);

  const mount = document.createElement('div');
  mount.style.width = '100%';
  mount.style.height = '100%';
  options.host.append(mount);
  const announcer = options.screenReaderMode ? createOutputAnnouncer(options.host) : undefined;

  /* The selection manager's anonymous document `mousedown` listener is still never removed (upstream PR #206). */
  const documentListeners: Array<Parameters<Document['addEventListener']>> = [];
  const { addEventListener } = document;
  document.addEventListener = function (this: Document, ...arguments_: Parameters<Document['addEventListener']>) {
    documentListeners.push(arguments_);
    Reflect.apply(addEventListener, this, arguments_);
  } as Document['addEventListener'];
  try {
    terminal.open(mount);
  } finally {
    Reflect.deleteProperty(document, 'addEventListener');
  }
  const disposers: Array<() => void> = [];
  const listen = <K extends keyof DocumentEventMap>(
    target: Document | HTMLElement,
    type: K,
    listener: (event: DocumentEventMap[K]) => void,
  ): void => {
    target.addEventListener(type, listener as EventListener, { capture: true, passive: false });
    disposers.push(() => {
      target.removeEventListener(type, listener as EventListener, { capture: true });
    });
  };

  /* Paste line breaks as CR, as xterm does; `paste()` still applies bracketed paste. */
  listen(mount, 'paste', (event) => {
    const text = event.clipboardData?.getData('text/plain');
    event.preventDefault();
    event.stopImmediatePropagation();
    if (text) {
      terminal.paste(text.replaceAll(/\r?\n/g, '\r'));
    }
  });
  listen(document, 'copy', (event) => {
    if (mount.contains(document.activeElement) && terminal.hasSelection()) {
      event.clipboardData?.setData('text/plain', terminal.getSelection());
      event.preventDefault();
    }
  });

  /* Both renderers read devicePixelRatio once, as ghostty-web's does. Re-measuring rebuilds the
   * cell metrics and glyph atlas; a pause/resume pair is the public way to force a full redraw. */
  let resolution: MediaQueryList | undefined;
  const onResolutionChange = (): void => {
    const { renderer } = terminal;
    if (renderer) {
      Reflect.set(renderer, 'devicePixelRatio', globalThis.devicePixelRatio);
      renderer.remeasureFont();
      renderer.resize(terminal.cols, terminal.rows);
      terminal.setPaused(true);
      terminal.setPaused(false);
    }
    watchResolution();
  };
  const watchResolution = (): void => {
    resolution?.removeEventListener('change', onResolutionChange);
    resolution = globalThis.matchMedia(`(resolution: ${globalThis.devicePixelRatio}dppx)`);
    resolution.addEventListener('change', onResolutionChange);
  };
  watchResolution();
  disposers.push(() => {
    resolution?.removeEventListener('change', onResolutionChange);
  });

  /* After a GPU process restart the Canvas 2D fallback's context comes back blank, and only dirty rows repaint. */
  listen(mount, 'contextrestored' as keyof DocumentEventMap, () => {
    terminal.renderer?.resize(terminal.cols, terminal.rows);
    terminal.setPaused(true);
    terminal.setPaused(false);
  });

  return {
    kind: 'aurigax',
    renderer: () => (terminal.rendererType === 'webgl' ? 'webgl' : 'canvas2d'),
    write(data, done) {
      if (data.length > 0) {
        terminal.write(data, done);
        announcer?.push(data);
      } else if (done) {
        queueMicrotask(done);
      }
    },
    onData(listener) {
      const subscription = terminal.onData(listener);
      return () => {
        subscription.dispose();
      };
    },
    fit() {
      const proposed = fitAddon.proposeDimensions();
      if (proposed && (proposed.cols !== terminal.cols || proposed.rows !== terminal.rows)) {
        terminal.resize(proposed.cols, proposed.rows);
      }
      return { cols: terminal.cols, rows: terminal.rows };
    },
    resize: (cols, rows) => {
      terminal.resize(cols, rows);
    },
    focus: () => {
      terminal.focus();
    },
    buffer: () => snapshotOf(terminal.buffer),
    lineText: (index) => terminal.buffer.active.getLine(index)?.translateToString(true),
    /* Selection rows are viewport rows; the adapter takes an absolute buffer row like xterm. */
    select: (column, row, length) => {
      terminal.select(column, row - terminal.buffer.active.baseY, length);
      terminal.wake();
    },
    selection: () => terminal.getSelection(),
    dispose: () => {
      for (const dispose of disposers) {
        dispose();
      }
      announcer?.dispose();
      terminal.dispose();
      for (const [type, listener, listenerOptions] of documentListeners) {
        document.removeEventListener(type, listener, listenerOptions);
      }
      mount.remove();
    },
  };
};

/**
 * Create one candidate terminal inside `options.host`.
 *
 * @param options - Identical font, theme, scrollback and renderer request for either candidate.
 * @returns The adapter for the chosen candidate.
 */
export const createTerminalView = async (options: TerminalViewOptions): Promise<TerminalView> => {
  switch (options.kind) {
    case 'xterm': {
      return createXtermView(options);
    }
    case 'ghostty':
    case 'ghostty131': {
      return createGhosttyView(options);
    }
    case 'aurigax': {
      return createAurigaxView(options);
    }
  }
};
