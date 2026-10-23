/**
 * S3 comparison adapter (Q3, D18): one small surface over the two candidate
 * terminal renderers so the harness drives both identically. Dev/test only;
 * nothing under `app/routes` imports it and no production selector exists.
 */
import type * as GhosttyWeb from 'ghostty-web';

export type RendererKind = 'xterm' | 'ghostty';

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
  /** Request xterm's WebGL renderer; ghostty-web always draws with Canvas 2D. */
  readonly webgl: boolean;
  readonly screenReaderMode: boolean;
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
 * The ghostty-web 0.4.0 package forwards `scrollback` to Ghostty's byte limit, not xterm's line count. Measured on the
 * R01 stream at 118 columns, 16,000,000 bytes retained 9,374 lines, so lines map to bytes at 1,750 each to
 * give both candidates the same retained history.
 */
const ghosttyScrollbackBytesPerLine = 1750;

let ghosttyReady: Promise<typeof GhosttyWeb> | undefined;

const createGhosttyView = async (options: TerminalViewOptions): Promise<TerminalView> => {
  /* Instantiate the WASM module once per page, as a product adapter would. */
  // oxlint-disable-next-line promise/prefer-await-to-then -- Cache one shared init promise exactly as measured; an async wrapper would add microtask hops to the timed mount.
  ghosttyReady ??= import('ghostty-web').then(async (module) => {
    await module.init();
    return module;
  });
  const ghostty = await ghosttyReady;
  const terminal = new ghostty.Terminal({
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    theme: options.theme,
    scrollback: Math.round(options.scrollback * ghosttyScrollbackBytesPerLine),
  });
  const fitAddon = new ghostty.FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(options.host);
  /* The ghostty-web 0.4.0 package reports `baseY` as 0; xterm's is the first viewport row, which the harness relies on. */
  const ghosttyBaseY = (): number =>
    terminal.buffer.active.type === 'alternate' ? 0 : Math.max(0, terminal.buffer.active.length - terminal.rows);
  return {
    kind: 'ghostty',
    renderer: () => 'canvas2d',
    write(data, done) {
      /* The ghostty-web 0.4.0 package parses synchronously but defers the callback to the next animation frame, and a
       * zero-length write throws a RangeError from its WASM allocator. Acknowledge at parse completion, as
       * xterm does, so flow control and paint timing mean the same thing for both candidates. */
      if (data.length > 0) {
        terminal.write(data);
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
      fitAddon.fit();
      return { cols: terminal.cols, rows: terminal.rows };
    },
    resize: (cols, rows) => {
      terminal.resize(cols, rows);
    },
    focus: () => {
      terminal.focus();
    },
    buffer: () => ({ ...snapshotOf(terminal.buffer), baseY: ghosttyBaseY() }),
    lineText: (index) => terminal.buffer.active.getLine(index)?.translateToString(true),
    /* The ghostty-web package selects by viewport row; the adapter takes an absolute buffer row like xterm. */
    select: (column, row, length) => {
      terminal.select(column, row - ghosttyBaseY(), length);
    },
    selection: () => terminal.getSelection(),
    dispose: () => {
      terminal.dispose();
    },
  };
};

/**
 * Create one candidate terminal inside `options.host`.
 *
 * @param options - Identical font, theme, scrollback and renderer request for either candidate.
 * @returns The adapter for the chosen candidate.
 */
export const createTerminalView = async (options: TerminalViewOptions): Promise<TerminalView> =>
  options.kind === 'xterm' ? createXtermView(options) : createGhosttyView(options);
