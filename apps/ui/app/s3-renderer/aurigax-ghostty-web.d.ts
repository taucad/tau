/**
 * The parts of `@aurigax-ai/ghostty-web` 0.3.6 the S3 adapter uses. The package ships only TypeScript source, which
 * Tau's compiler settings reject (`erasableSyntaxOnly`, `noPropertyAccessFromIndexSignature`), so the `#` import
 * in package.json gives the type checker this file and the bundler the package.
 */
/* eslint-disable @typescript-eslint/naming-convention -- The package's exported class names. */

export type Ghostty = { readonly __brand: 'Ghostty' };
export declare const Ghostty: { load(wasmPath?: string): Promise<Ghostty> };

export declare const SelectionManager: { readonly AUTO_SCROLL_EDGE_SIZE: number };

export type TerminalOptions = {
  readonly ghostty: Ghostty;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly theme: Readonly<Record<string, string>>;
  readonly scrollback: number;
  readonly renderer: 'webgl' | 'canvas';
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

export type Terminal = {
  readonly cols: number;
  readonly rows: number;
  readonly rendererType: 'webgl' | 'canvas';
  readonly renderer?: TerminalRenderer;
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
  loadAddon(addon: FitAddon): void;
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
