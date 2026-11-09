/**
 * The parts of `@aurigax-ai/ghostty-web` 0.3.6 the Terminal pane's renderer uses. The package ships only TypeScript
 * source, which Tau's compiler settings reject (`erasableSyntaxOnly`, `noPropertyAccessFromIndexSignature`), so the
 * `#` import in package.json gives the type checker this file and the bundler the package.
 */
/* eslint-disable @typescript-eslint/naming-convention -- The package's exported class names. */

export type Ghostty = { readonly __brand: 'Ghostty' };
export declare const Ghostty: { load(wasmPath?: string): Promise<Ghostty> };

export declare const SelectionManager: { readonly AUTO_SCROLL_EDGE_SIZE: number };

export type TerminalTheme = {
  readonly background: string;
  readonly foreground: string;
  readonly cursor: string;
  readonly cursorAccent: string;
  readonly selectionBackground: string;
  readonly selectionForeground: string;
  readonly black: string;
  readonly red: string;
  readonly green: string;
  readonly yellow: string;
  readonly blue: string;
  readonly magenta: string;
  readonly cyan: string;
  readonly white: string;
  readonly brightBlack: string;
  readonly brightRed: string;
  readonly brightGreen: string;
  readonly brightYellow: string;
  readonly brightBlue: string;
  readonly brightMagenta: string;
  readonly brightCyan: string;
  readonly brightWhite: string;
};

export type TerminalOptions = {
  readonly ghostty: Ghostty;
  readonly cols?: number;
  readonly rows?: number;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight?: 'normal' | 'bold' | number;
  readonly theme: TerminalTheme;
  readonly scrollback: number;
  readonly renderer: 'webgl' | 'canvas';
  readonly cursorBlink?: boolean;
  readonly minimumContrastRatio?: number;
  /** Tau's patch (tools/pnpm/patches): how the WebGL renderer blends text, after Ghostty's `alpha-blending`. */
  readonly textBlending?: 'native' | 'linear' | 'linear-corrected';
  /** Tau's patch: exponent on glyph coverage in the WebGL renderer; above 1 thins text. */
  readonly textWeight?: number;
  /** Tau's patch: keep the font's advance as the cell width instead of flooring it to device pixels. */
  readonly exactCellWidth?: boolean;
  /** Tau's patch: line pitch in CSS pixels, overriding lineHeight. */
  readonly cellHeight?: number;
  readonly macOptionIsMeta?: boolean;
  readonly smoothScrollDuration?: number;
  readonly linkHandler?: { activate(event: MouseEvent, uri: string): void };
};

export type TerminalRenderer = {
  remeasureFont(): void;
  resize(cols: number, rows: number): void;
};

export type FitAddon = {
  proposeDimensions(): { cols: number; rows: number } | undefined;
};
export declare const FitAddon: new () => FitAddon;

/** Find in screen and scrollback. "Next" moves toward older output, as in Ghostty. */
export type SearchAddon = {
  findNext(term: string, options?: { incremental?: boolean }): boolean;
  findPrevious(term: string, options?: { incremental?: boolean }): boolean;
  clearDecorations(): void;
};
export declare const SearchAddon: new () => SearchAddon;

export type Terminal = {
  /** Assigning a key applies it to the open terminal and repaints every row. */
  readonly options: {
    theme: TerminalTheme;
    textBlending?: 'native' | 'linear' | 'linear-corrected';
    textWeight?: number;
  };
  readonly cols: number;
  readonly rows: number;
  readonly rendererType: 'webgl' | 'canvas';
  readonly renderer?: TerminalRenderer;
  /** The hidden input textarea inside the opened element. */
  readonly textarea?: HTMLTextAreaElement;
  readonly buffer: {
    readonly active: {
      readonly type: 'normal' | 'alternate';
      readonly length: number;
      readonly cursorX: number;
      readonly cursorY: number;
      readonly baseY: number;
      /** The absolute line at the top of the viewport (baseY unless scrolled back). */
      readonly viewportY: number;
      getLine(index: number):
        | {
            readonly length: number;
            translateToString(trimRight?: boolean): string;
            getCell(x: number): { getChars(): string; getWidth(): number } | undefined;
          }
        | undefined;
    };
  };
  loadAddon(addon: FitAddon | SearchAddon): void;
  open(parent: HTMLElement): void;
  write(data: string | Uint8Array<ArrayBuffer>, callback?: () => void): void;
  paste(text: string): void;
  onData(listener: (data: string) => void): { dispose(): void };
  onRender(listener: (range: { start: number; end: number }) => void): { dispose(): void };
  onScroll(listener: (line: number) => void): { dispose(): void };
  onResize(listener: (size: { cols: number; rows: number }) => void): { dispose(): void };
  hasSelection(): boolean;
  getSelection(): string;
  select(column: number, row: number, length: number): void;
  setPaused(paused: boolean, options?: { releaseRenderer?: boolean }): void;
  wake(): void;
  resize(cols: number, rows: number): void;
  focus(): void;
  dispose(): void;
};
export declare const Terminal: new (options: TerminalOptions) => Terminal;
