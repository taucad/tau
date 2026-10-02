import * as monaco from 'monaco-editor';
import { RenameAdapter } from 'monaco-editor/esm/vs/language/typescript/languageFeatures.js';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';
import type { MaterializingLibFiles } from '#lib/monaco-typescript-extras/materializing-lib-files.client.js';

type TsWorkerAccessor = (...uris: monaco.Uri[]) => Promise<unknown>;

type TsWorkerLike = {
  findRenameLocations(
    fileName: string,
    position: number,
    strings: boolean,
    comments: boolean,
    prefixAndSuffix: boolean,
  ): Promise<readonly { fileName: string }[] | undefined>;
};

/**
 * Pre-materialises rename targets so synchronous LibFiles.getOrCreateModel sees models.
 */
export class MaterializingRenameAdapter extends RenameAdapter {
  private readonly workspaceFsRef: MonacoWorkspaceFs;

  public constructor(libFiles: MaterializingLibFiles, worker: TsWorkerAccessor, workspaceFs: MonacoWorkspaceFs) {
    super(libFiles, worker);
    this.workspaceFsRef = workspaceFs;
  }

  /** @inheritdoc */
  // oxlint-disable-next-line max-params -- mirrors upstream `RenameAdapter.provideRenameEdits` arity
  public override async provideRenameEdits(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    newName: string,
    token: monaco.CancellationToken,
  ): Promise<(monaco.languages.WorkspaceEdit & monaco.languages.Rejection) | undefined> {
    const resource = model.uri;
    const worker = await (this as unknown as { _worker(uri: monaco.Uri): Promise<TsWorkerLike> })._worker(resource);
    if (model.isDisposed() || token.isCancellationRequested) {
      return undefined;
    }
    const offset = model.getOffsetAt(position);
    const renameLocations = await worker.findRenameLocations(resource.toString(), offset, false, false, false);
    if (renameLocations?.length) {
      await this.workspaceFsRef.materialiseUrisForWorkspaceEdit(
        renameLocations.map((loc) => monaco.Uri.parse(loc.fileName)),
      );
    }
    return super.provideRenameEdits(model, position, newName, token);
  }
}
