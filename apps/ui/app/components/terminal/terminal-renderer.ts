/**
 * The Terminal pane's renderer (blueprint D18 as amended 2026-10-24T05:39Z): AurigaX `@aurigax-ai/ghostty-web`
 * 0.3.6 behind one small adapter. The pane loads this module lazily, so nothing here reaches a page without a
 * Terminal. Tau carries no patch to AurigaX; every shim below is in how Tau uses it, ported from the S3 harness's
 * `createAurigaxView` (Q3/5 W6 handoff, adapter obligations 1–8).
 *
 * Output is terminal data (I9). It is parsed by the WASM engine and drawn to a canvas; the live region and the
 * screen mirror take only stripped text through `textContent`. OSC 52 clipboard writes stay denied (no handler is
 * installed, and reads are never answered), the window title and desktop notifications are not subscribed, and a
 * link opens only on the person's Ctrl/Cmd+click and only for `http(s)`.
 */

import wasmUrl from '@aurigax-ai/ghostty-web/ghostty-vt.wasm?url';
import type { Terminal as AurigaxTerminal, TerminalTheme } from '#components/terminal/aurigax-ghostty-web';
import { isOpenableTerminalLink, outputLines, outputSlices } from '#components/terminal/terminal-output-text.js';

/** @public */
export type TerminalRendererOptions = {
  readonly host: HTMLElement;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly theme: TerminalTheme;
  /** Lines of scrollback (AurigaX counts lines, as xterm does). */
  readonly scrollback: number;
  readonly screenReaderMode: boolean;
  /** Foreground contrast floor, 1 (off) to 21. */
  readonly minimumContrastRatio: number;
  readonly reducedMotion: boolean;
  /** Receives an `http(s)` link the person Ctrl/Cmd+clicked; the caller applies Tau's navigation policy. */
  readonly onLinkActivate: (uri: string) => void;
  /** The person pressed the documented leave key (Shift+Escape); the caller moves focus out. */
  readonly onLeave: () => void;
};

/** @public */
export type TerminalRendererView = {
  /** The renderer drawing now: `canvas2d` after a WebGL context loss or where WebGL is unavailable. */
  renderer(): 'webgl' | 'canvas2d';
  /** Queue output; `painted` runs once every slice of it has been parsed. */
  write(data: string, painted: () => void): void;
  onData(listener: (data: string) => void): () => void;
  /** Fit the grid to the host and return its size. */
  fit(): { columns: number; rows: number };
  focus(): void;
  /** Find `term` in screen and scrollback, toward older output unless `newer`; returns whether it matched. */
  search(term: string, newer: boolean): boolean;
  clearFind(): void;
  setScreenReaderMode(enabled: boolean): void;
  dispose(): void;
};

/** UTF-16 code units per renderer parse: well under the wire's 64 KiB frame, so typed keys interleave with a flood. */
const writeSliceCharacters = 16_384;

/** Milliseconds between offers of buffered output to the screen-reader live region; the next two bound how much. */
const announceDelay = 100;
const announceMaxLines = 20;
const announceRetainedLines = 100;

/**
 * Whether a key press is the platform's terminal paste chord other than macOS's Cmd+V, which needs no help: Ctrl+Shift+V
 * on Linux and Windows. Plain Ctrl+V is not one; it reaches the program as ^V.
 *
 * @param event - The key press.
 * @param platform - `navigator.platform`.
 * @returns Whether to let the browser paste instead of encoding the key.
 * @public
 */
export const isTerminalPasteChord = (
  event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>,
  platform: string,
): boolean =>
  !platform.startsWith('Mac') &&
  event.code === 'KeyV' &&
  event.ctrlKey &&
  event.shiftKey &&
  !event.altKey &&
  !event.metaKey;

/** Milliseconds between screen-mirror refreshes while output or resizes arrive. */
const mirrorDelay = 150;

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'pre',
} as const;

/** A visually hidden `role=log` region that offers new output, stripped of control sequences, to screen readers. */
const createOutputAnnouncer = (host: HTMLElement): { push: (data: string) => void; dispose: () => void } => {
  const region = document.createElement('div');
  region.setAttribute('role', 'log');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-label', 'Terminal output');
  region.dataset['terminalAnnouncer'] = 'true';
  Object.assign(region.style, visuallyHidden);
  host.append(region);
  let pending = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = (): void => {
    timer = undefined;
    const lines = outputLines(pending, announceMaxLines);
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
    push(data) {
      pending += data;
      /* Only the tail can be announced; drop the rest before stripping so a flood costs no more than a line. */
      if (pending.length > 16_384) {
        pending = pending.slice(-16_384);
      }
      timer ??= setTimeout(flush, announceDelay);
    },
    dispose() {
      clearTimeout(timer);
      region.remove();
    },
  };
};

/**
 * A visually hidden copy of the visible screen inside AurigaX's focusable `role=textbox` element, which closes the
 * NVDA review-mode failure (Q3/5): AurigaX draws to a canvas only, so review found nothing but "graphic". The mirror
 * gives the textbox one text row per screen row, hides the canvases from the accessibility tree and, while the
 * textbox has focus, collapses the DOM caret onto the cursor cell so review starts at the prompt. AurigaX's hidden
 * textarea (a second tab stop) hands focus back to the textbox. The mirror stands still during IME composition.
 */
const createScreenMirror = (
  terminal: AurigaxTerminal,
  container: HTMLElement,
): { schedule: () => void; dispose: () => void } => {
  const mirror = document.createElement('div');
  mirror.dataset['terminalScreenMirror'] = 'true';
  mirror.spellcheck = false;
  Object.assign(mirror.style, { ...visuallyHidden, left: '0', top: '0' });
  container.prepend(mirror);
  const { textarea } = terminal;
  const refocus = (): void => {
    container.focus({ preventScroll: true });
  };
  textarea?.setAttribute('tabindex', '-1');
  textarea?.setAttribute('aria-hidden', 'true');
  textarea?.addEventListener('focus', refocus);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let composing = false;
  /* One row as text: empty cells become spaces, wide-character spacers add nothing, and `caret` is the UTF-16 offset
   * of column `cursorX`. */
  const rowText = (y: number, cursorX: number): { text: string; caret: number } => {
    const line = terminal.buffer.active.getLine(y);
    if (!line) {
      return { text: '', caret: 0 };
    }
    let text = '';
    let caret = 0;
    for (let x = 0; x < line.length; x++) {
      if (x === cursorX) {
        caret = text.length;
      }
      const cell = line.getCell(x);
      if (cell && cell.getWidth() > 0) {
        text += cell.getChars() || ' ';
      }
    }
    const trimmed = text.trimEnd();
    return { text: trimmed, caret: cursorX >= line.length ? trimmed.length : Math.min(caret, trimmed.length) };
  };
  const sync = (): void => {
    timer = undefined;
    if (composing) {
      return;
    }
    for (const canvas of container.querySelectorAll('canvas')) {
      canvas.setAttribute('aria-hidden', 'true');
    }
    const { active } = terminal.buffer;
    const top = active.viewportY;
    const cursorRow = active.baseY + active.cursorY - top;
    while (mirror.childElementCount > terminal.rows) {
      mirror.lastElementChild?.remove();
    }
    while (mirror.childElementCount < terminal.rows) {
      mirror.append(document.createElement('div'));
    }
    let caret: { node: Node; offset: number } | undefined;
    for (const [y, row] of ([...mirror.children] as HTMLElement[]).entries()) {
      const { text, caret: offset } = rowText(top + y, y === cursorRow ? active.cursorX : -1);
      if (row.textContent !== text) {
        row.textContent = text;
      }
      if (y === cursorRow) {
        caret = row.firstChild ? { node: row.firstChild, offset } : { node: row, offset: 0 };
      }
    }
    if (caret && document.activeElement === container) {
      document.getSelection()?.collapse(caret.node, caret.offset);
    }
  };
  const schedule = (): void => {
    timer ??= setTimeout(sync, mirrorDelay);
  };
  const compositionStart = (): void => {
    composing = true;
  };
  const compositionEnd = (): void => {
    composing = false;
    schedule();
  };
  container.addEventListener('compositionstart', compositionStart);
  container.addEventListener('compositionend', compositionEnd);
  return {
    schedule,
    dispose() {
      clearTimeout(timer);
      textarea?.removeEventListener('focus', refocus);
      textarea?.setAttribute('tabindex', '0');
      textarea?.removeAttribute('aria-hidden');
      container.removeEventListener('compositionstart', compositionStart);
      container.removeEventListener('compositionend', compositionEnd);
      mirror.remove();
    },
  };
};

/**
 * Create the Terminal renderer inside `options.host`. One WASM instance per terminal, disposed with it.
 *
 * @param options - Font, theme, scrollback, accessibility and the two trusted callbacks.
 * @returns The adapter.
 * @public
 */
export const createTerminalRenderer = async (options: TerminalRendererOptions): Promise<TerminalRendererView> => {
  const aurigax = await import('#components/terminal/aurigax-ghostty-web');
  /* (1) The selection manager auto-scrolls while a drag is within 30 px of an edge, so a drag along the first rows
   * grows upward. Zero keeps auto-scroll for drags that leave the canvas, as xterm does. */
  Reflect.set(aurigax.SelectionManager, 'AUTO_SCROLL_EDGE_SIZE', 0);
  const terminal = new aurigax.Terminal({
    ghostty: await aurigax.Ghostty.load(wasmUrl),
    fontFamily: options.fontFamily,
    fontSize: options.fontSize,
    theme: options.theme,
    scrollback: options.scrollback,
    renderer: 'webgl',
    cursorBlink: !options.reducedMotion,
    minimumContrastRatio: options.minimumContrastRatio,
    smoothScrollDuration: options.reducedMotion ? 0 : 100,
    /* Always installed: without a handler AurigaX opens a window itself on Ctrl/Cmd+click. */
    linkHandler: {
      activate(event: MouseEvent, uri: string) {
        if (isOpenableTerminalLink(uri, event)) {
          options.onLinkActivate(uri);
        }
      },
    },
  });
  const fitAddon = new aurigax.FitAddon();
  terminal.loadAddon(fitAddon);
  const searchAddon = new aurigax.SearchAddon();
  terminal.loadAddon(searchAddon);

  /* AurigaX turns its parent into the focusable textbox, so it gets its own element and the live region sits beside
   * it. */
  const mount = document.createElement('div');
  mount.style.width = '100%';
  mount.style.height = '100%';
  options.host.append(mount);

  /* (2) The selection manager's anonymous document `mousedown` listener is never removed by `dispose()` (upstream
   * PR #206), which keeps the terminal and its WASM memory reachable. Record what `open()` adds and remove it later. */
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
  // AurigaX owns the visible canvas cursor; its contenteditable host must not draw a second browser caret.
  mount.style.caretColor = 'transparent';
  mount.setAttribute('aria-label', 'Terminal');
  mount.setAttribute('aria-description', 'Press Shift+Escape to leave the terminal.');

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

  /* The documented way out (A15): Shift+Escape leaves the terminal. Captured on the host, before AurigaX sees it. */
  listen(options.host, 'keydown', (event) => {
    if (event.key === 'Escape' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      options.onLeave();
      return;
    }
    /* (9) The platform's terminal paste chord: Ctrl+Shift+V on Linux and Windows. AurigaX never encodes it, and the
     * browser's own paste command on the editable textbox fires the `paste` event below. Cmd+V on macOS already
     * reaches that event through AurigaX, and Ctrl+V stays ^V for the shell, as in xterm.js. */
    if (isTerminalPasteChord(event, navigator.platform)) {
      event.stopImmediatePropagation();
    }
  });

  /* (3) Paste line breaks as CR, as xterm does; `paste()` still applies bracketed paste. */
  listen(mount, 'paste', (event) => {
    const text = event.clipboardData?.getData('text/plain');
    event.preventDefault();
    event.stopImmediatePropagation();
    if (text) {
      terminal.paste(text.replaceAll(/\r?\n/g, '\r'));
    }
  });
  /* (4) Edit → Copy and the copy accelerator copy the terminal's selection. */
  listen(document, 'copy', (event) => {
    if (mount.contains(document.activeElement) && terminal.hasSelection()) {
      event.clipboardData?.setData('text/plain', terminal.getSelection());
      event.preventDefault();
    }
  });

  /* (5) AurigaX reads devicePixelRatio once. On a change (zoom, another display) re-measure, which rebuilds the cell
   * metrics and glyph atlas; a pause/resume pair is the public way to force a full redraw. */
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

  /* (6) After a GPU process restart the Canvas 2D fallback's context comes back blank, and only dirty rows repaint. */
  listen(mount, 'contextrestored' as keyof DocumentEventMap, () => {
    terminal.renderer?.resize(terminal.cols, terminal.rows);
    terminal.setPaused(true);
    terminal.setPaused(false);
  });

  /* (8) Screen-reader mode: the mirror inside the textbox plus the live region beside it. */
  let accessibility: { push: (data: string) => void; dispose: () => void } | undefined;
  const enableAccessibility = (): void => {
    if (accessibility) {
      return;
    }
    const announcer = createOutputAnnouncer(options.host);
    const mirror = createScreenMirror(terminal, mount);
    const subscriptions = [
      terminal.onRender(mirror.schedule),
      terminal.onResize(mirror.schedule),
      /* Scrolling back moves the viewport without dirtying a row, so no render event fires. */
      terminal.onScroll(mirror.schedule),
    ];
    mount.addEventListener('focus', mirror.schedule);
    mirror.schedule();
    accessibility = {
      push: announcer.push,
      dispose() {
        for (const subscription of subscriptions) {
          subscription.dispose();
        }
        mount.removeEventListener('focus', mirror.schedule);
        mirror.dispose();
        announcer.dispose();
      },
    };
  };
  const disableAccessibility = (): void => {
    accessibility?.dispose();
    accessibility = undefined;
  };
  if (options.screenReaderMode) {
    enableAccessibility();
  }

  /* Bounded parse work per task: up to one slice's worth of queued output is parsed, then the queue yields to the event
   * loop so key events are handled between slices of a large backlog (Q3/5: input under CPU starvation). Small writes
   * share a task: a shell printing line by line sends thousands of small frames, and one task each (a nested timer is
   * clamped to 4 ms) left the screen seconds behind the shell. */
  const queue: Array<{ data: string; painted?: () => void }> = [];
  let writing = false;
  let disposed = false;
  let yieldTimer: ReturnType<typeof setTimeout> | undefined;
  const pump = (): void => {
    yieldTimer = undefined;
    if (queue.length === 0 || disposed) {
      writing = false;
      return;
    }
    writing = true;
    const batch = [queue.shift()!];
    let size = batch[0]!.data.length;
    while (queue.length > 0 && size + queue[0]!.data.length <= writeSliceCharacters) {
      const next = queue.shift()!;
      batch.push(next);
      size += next.data.length;
    }
    const data = batch.length === 1 ? batch[0]!.data : batch.map((entry) => entry.data).join('');
    accessibility?.push(data);
    terminal.write(data, () => {
      for (const entry of batch) {
        entry.painted?.();
      }
      if (!disposed) {
        yieldTimer = setTimeout(pump, 0);
      }
    });
  };

  return {
    renderer: () => (terminal.rendererType === 'webgl' ? 'webgl' : 'canvas2d'),
    write(data, painted) {
      const slices = outputSlices(data, writeSliceCharacters);
      if (slices.length === 0) {
        queueMicrotask(painted);
        return;
      }
      for (const [index, slice] of slices.entries()) {
        queue.push(index === slices.length - 1 ? { data: slice, painted } : { data: slice });
      }
      if (!writing) {
        pump();
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
      return { columns: terminal.cols, rows: terminal.rows };
    },
    focus() {
      terminal.focus();
    },
    search: (term, newer) => (newer ? searchAddon.findPrevious(term) : searchAddon.findNext(term)),
    clearFind() {
      searchAddon.clearDecorations();
    },
    setScreenReaderMode(enabled) {
      if (enabled) {
        enableAccessibility();
      } else {
        disableAccessibility();
      }
    },
    dispose() {
      disposed = true;
      clearTimeout(yieldTimer);
      queue.length = 0;
      disableAccessibility();
      for (const dispose of disposers) {
        dispose();
      }
      terminal.dispose();
      for (const [type, listener, listenerOptions] of documentListeners) {
        document.removeEventListener(type, listener, listenerOptions);
      }
      mount.remove();
    },
  };
};
