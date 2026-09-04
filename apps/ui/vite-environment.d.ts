// oxlint-disable typescript/no-extraneous-class -- Monaco's factory export uses a PascalCase property name
// oxlint-disable max-params -- Monaco's factory export uses a PascalCase property name
declare const tauBuildFrontendUrl: string;
declare const tauBuildId: number;

interface ImportMetaEnv {
  /**
   * Compile-time host seam (charter D2). Substituted by `define` in
   * `vite.config.ts` (`'web'`) and `desktop/vite.config.ts` (`'desktop'`);
   * left undefined under `mode === 'test'` so unit tests can stub it.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Vite env keys are SCREAMING_SNAKE_CASE.
  readonly TAU_TARGET?: 'web' | 'desktop';
}

declare module '*?base64' {
  const value: string;
  export = value;
}

declare module 'qrcode-terminal' {
  type QrcodeTerminalGenerateOptions = {
    small?: boolean | undefined;
  };

  const qrcodeTerminal: {
    generate(
      payload: string,
      optionsOrCallback?: QrcodeTerminalGenerateOptions | ((qr: string) => void),
      callback?: (qr: string) => void,
    ): void;
  };

  export default qrcodeTerminal;
}

declare module 'monaco-editor/esm/vs/language/typescript/languageFeatures.js' {
  import type * as Monaco from 'monaco-editor';

  export class Adapter {
    public constructor(worker: (...uris: Monaco.Uri[]) => Promise<unknown>);
  }

  export class LibFiles {
    public constructor(worker: (...uris: Monaco.Uri[]) => Promise<unknown>);
    public getOrCreateModel(fileName: string): Monaco.editor.ITextModel | undefined;
    public fetchLibFilesIfNecessary(uris: readonly Monaco.Uri[]): Promise<void>;
  }

  export class DefinitionAdapter extends Adapter {
    public constructor(libFiles: LibFiles, worker: (...uris: Monaco.Uri[]) => Promise<unknown>);
    public provideDefinition(
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
      token: Monaco.CancellationToken,
    ): Promise<Monaco.languages.Definition | undefined>;
  }

  export class ReferenceAdapter extends Adapter {
    public constructor(libFiles: LibFiles, worker: (...uris: Monaco.Uri[]) => Promise<unknown>);
    public provideReferences(
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
      context: Monaco.languages.ReferenceContext,
      token: Monaco.CancellationToken,
    ): Promise<Monaco.languages.Location[] | undefined>;
  }

  export class RenameAdapter extends Adapter {
    public constructor(libFiles: LibFiles, worker: (...uris: Monaco.Uri[]) => Promise<unknown>);
    public provideRenameEdits(
      model: Monaco.editor.ITextModel,
      position: Monaco.Position,
      newName: string,
      token: Monaco.CancellationToken,
    ): Promise<(Monaco.languages.WorkspaceEdit & Monaco.languages.Rejection) | undefined>;
  }
}
