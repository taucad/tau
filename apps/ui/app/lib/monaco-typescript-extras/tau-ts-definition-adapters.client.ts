import * as monaco from 'monaco-editor';
import { Adapter } from 'monaco-editor/esm/vs/language/typescript/languageFeatures.js';
import type { MaterializingLibFiles } from '#lib/monaco-typescript-extras/materializing-lib-files.client.js';
import type {
  TauTypeScriptLanguageServiceWorker,
  TsDefinitionLike,
} from '#lib/monaco-typescript-extras/ts-worker-extras.types.js';

type TsWorkerAccessor = (...uris: monaco.Uri[]) => Promise<unknown>;

type AdapterInternals = Readonly<{
  _worker(resource: monaco.Uri): Promise<TauTypeScriptLanguageServiceWorker>;
  _textSpanToRange(model: monaco.editor.ITextModel, span: Readonly<{ start: number; length: number }>): monaco.IRange;
}>;

/**
 * Go to implementation — mirrors bundled DefinitionAdapter with `getImplementationAtPosition`.
 */
export class TauImplementationAdapter extends Adapter {
  private readonly libFilesRef: MaterializingLibFiles;

  public constructor(libFiles: MaterializingLibFiles, worker: TsWorkerAccessor) {
    super(worker);
    this.libFilesRef = libFiles;
  }

  /** @inheritdoc */
  public async provideImplementation(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    _token: monaco.CancellationToken,
  ): Promise<monaco.languages.Definition | undefined> {
    const resource = model.uri;
    const offset = model.getOffsetAt(position);
    const internals = this as unknown as AdapterInternals;
    const worker = await internals._worker(resource);
    if (model.isDisposed()) {
      return undefined;
    }
    const entries = (await worker.getImplementationAtPosition(resource.toString(), offset)) as
      | readonly TsDefinitionLike[]
      | undefined;
    if (!entries || model.isDisposed()) {
      return undefined;
    }
    await this.libFilesRef.fetchLibFilesIfNecessary(entries.map((entry) => monaco.Uri.parse(entry.fileName)));
    if (model.isDisposed()) {
      return undefined;
    }
    const result: monaco.languages.Location[] = [];
    for (const entry of entries) {
      const refModel = this.libFilesRef.getOrCreateModel(entry.fileName);
      if (refModel) {
        result.push({
          uri: refModel.uri,
          range: internals._textSpanToRange(refModel, entry.textSpan),
        });
      }
    }
    return result;
  }
}

/**
 * Go to type definition — mirrors bundled DefinitionAdapter with `getTypeDefinitionAtPosition`.
 */
export class TauTypeDefinitionAdapter extends Adapter {
  private readonly libFilesRef: MaterializingLibFiles;

  public constructor(libFiles: MaterializingLibFiles, worker: TsWorkerAccessor) {
    super(worker);
    this.libFilesRef = libFiles;
  }

  /** @inheritdoc */
  public async provideTypeDefinition(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    _token: monaco.CancellationToken,
  ): Promise<monaco.languages.Definition | undefined> {
    const resource = model.uri;
    const offset = model.getOffsetAt(position);
    const internals = this as unknown as AdapterInternals;
    const worker = await internals._worker(resource);
    if (model.isDisposed()) {
      return undefined;
    }
    const entries = (await worker.getTypeDefinitionAtPosition(resource.toString(), offset)) as
      | readonly TsDefinitionLike[]
      | undefined;
    if (!entries || model.isDisposed()) {
      return undefined;
    }
    await this.libFilesRef.fetchLibFilesIfNecessary(entries.map((entry) => monaco.Uri.parse(entry.fileName)));
    if (model.isDisposed()) {
      return undefined;
    }
    const result: monaco.languages.Location[] = [];
    for (const entry of entries) {
      const refModel = this.libFilesRef.getOrCreateModel(entry.fileName);
      if (refModel) {
        result.push({
          uri: refModel.uri,
          range: internals._textSpanToRange(refModel, entry.textSpan),
        });
      }
    }
    return result;
  }
}
