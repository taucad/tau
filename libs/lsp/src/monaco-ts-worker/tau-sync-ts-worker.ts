import type { SyncFsClient } from '@taucad/lsp-fs/sync';
import { TypeScriptWorker } from 'monaco-editor/esm/vs/language/typescript/ts.worker.js';

import type { LspDiagnostic, LspProbeOutcome } from '#monaco-ts-worker/lsp-diagnostic.js';

type TsCtorParams = ConstructorParameters<typeof TypeScriptWorker>;

/** @internal */
export type TauSyncTsWorkerMonacoCtorParams = TsCtorParams;

/**
 * Internal access to the JS-only `_getModel` method on the upstream
 * {@link TypeScriptWorker} so we can distinguish mirror-model hits from
 * `libFileMap`/`extraLibs` hits in {@link TauSyncTsWorker._classifyBaseHit}.
 */
type TypeScriptWorkerWithGetModel = {
  _getModel?: (fileName: string) => unknown;
};

/**
 * Optional dependencies for the Tau-flavoured TS worker.
 *
 * @public
 */
export type TauSyncTsWorkerDeps = Readonly<{
  syncFsClient: SyncFsClient;
  diagnostic?: LspDiagnostic;
}>;

/**
 * {@link TypeScriptWorker} with Tier-0/2 workspace reads for unmirrored `file://` scripts.
 *
 * @public
 */
export class TauSyncTsWorker extends TypeScriptWorker {
  private readonly syncFsClient: SyncFsClient;
  private readonly diagnostic: LspDiagnostic | undefined;

  public constructor(context: TsCtorParams[0], createData: TsCtorParams[1], deps: TauSyncTsWorkerDeps) {
    super(context, createData);
    this.syncFsClient = deps.syncFsClient;
    this.diagnostic = deps.diagnostic;
  }

  public override _getScriptText(fileName: string): string | undefined {
    const fromMirrors = super._getScriptText(fileName);
    if (fromMirrors !== undefined) {
      this.diagnostic?.record({
        category: 'getScriptText',
        outcome: this._classifyBaseHit(fileName),
        fileName,
      });
      return fromMirrors;
    }

    const fromSync = this.syncFsClient.readFileText(fileName);
    this.diagnostic?.record({
      category: 'getScriptText',
      outcome: fromSync === undefined ? 'miss' : 'sync',
      fileName,
    });
    return fromSync;
  }

  public override getScriptVersion(fileName: string): string {
    const baseVersion = super.getScriptVersion(fileName);
    if (baseVersion !== '') {
      this.diagnostic?.record({
        category: 'getScriptVersion',
        outcome: this._classifyBaseHit(fileName),
        fileName,
        detail: baseVersion,
      });
      return baseVersion;
    }

    if (super._getScriptText(fileName) !== undefined) {
      this.diagnostic?.record({
        category: 'getScriptVersion',
        outcome: 'static',
        fileName,
        detail: '1',
      });
      return '1';
    }

    const syncVersion = this.syncFsClient.getScriptVersionForPath(fileName);
    this.diagnostic?.record({
      category: 'getScriptVersion',
      outcome: syncVersion === undefined ? 'miss' : 'sync',
      fileName,
      detail: syncVersion,
    });
    return syncVersion ?? '';
  }

  /**
   * @remarks
   * Override the inherited `fileExists` so module-resolution probes (`./lib/foo.ts`,
   * `./lib/foo.js`, `./lib/foo/index.ts`, …) are recorded under their own category
   * and use the cheaper sync-FS `fileExists` path (no payload deserialization)
   * for the closed-file branch. `override` is omitted because the upstream JS
   * class shape is not surfaced to TypeScript.
   */
  public fileExists(path: string): boolean {
    const fromBase = super._getScriptText(path);
    if (fromBase !== undefined) {
      this.diagnostic?.record({
        category: 'fileExists',
        outcome: this._classifyBaseHit(path),
        fileName: path,
      });
      return true;
    }

    const exists = this.syncFsClient.fileExists(path);
    this.diagnostic?.record({
      category: 'fileExists',
      outcome: exists ? 'sync' : 'miss',
      fileName: path,
    });
    return exists;
  }

  /**
   * @remarks
   * The upstream JS class returns `""` here. We replicate that constant inline
   * (rather than `super.getCurrentDirectory()`) because the method is not
   * surfaced on the TypeScript declaration of {@link TypeScriptWorker}.
   */
  public getCurrentDirectory(): string {
    const cwd = '';
    this.diagnostic?.record({
      category: 'getCurrentDirectory',
      outcome: 'value',
      fileName: cwd,
    });
    return cwd;
  }

  /** @remarks Declared for TS {@link ts.LanguageServiceHost} module resolution; not on base class. */
  public directoryExists(directoryName: string): boolean {
    const segments = directoryName.split('/').filter((segment) => segment.length > 0);
    const base = segments.length === 0 ? undefined : segments.at(-1);
    if (base === 'node_modules' || base === '@types') {
      this.diagnostic?.record({
        category: 'directoryExists',
        outcome: 'static',
        fileName: directoryName,
        detail: `parent-dir-shortcut:${base}`,
      });
      return true;
    }

    const extraLibs = (this as unknown as { _extraLibs?: Record<string, unknown> })._extraLibs;
    const probe = directoryName.endsWith('/') ? directoryName : `${directoryName}/`;
    if (extraLibs) {
      for (const path of Object.keys(extraLibs)) {
        if (path.startsWith(probe)) {
          this.diagnostic?.record({
            category: 'directoryExists',
            outcome: 'static',
            fileName: directoryName,
            detail: `extraLib:${path}`,
          });
          return true;
        }
      }
    }

    const exists = this.syncFsClient.directoryExists(directoryName);
    this.diagnostic?.record({
      category: 'directoryExists',
      outcome: exists ? 'sync' : 'miss',
      fileName: directoryName,
    });
    return exists;
  }

  /** @remarks Declared for TS {@link ts.LanguageServiceHost}; not on base class. */
  public getDirectories(rootDirectory: string): string[] {
    const directories = this.syncFsClient.getDirectories(rootDirectory);
    this.diagnostic?.record({
      category: 'getDirectories',
      outcome: directories.length > 0 ? 'sync' : 'miss',
      fileName: rootDirectory,
      detail: `${directories.length} entries`,
    });
    return directories;
  }

  /**
   * Distinguish mirror-model hits from `libFileMap`/`extraLib` hits using the
   * runtime `_getModel` helper on the upstream worker.
   */
  private _classifyBaseHit(fileName: string): LspProbeOutcome {
    const helper = this as unknown as TypeScriptWorkerWithGetModel;
    const hasModel = typeof helper._getModel === 'function' && helper._getModel(fileName) !== null;
    return hasModel ? 'mirror' : 'static';
  }
}
