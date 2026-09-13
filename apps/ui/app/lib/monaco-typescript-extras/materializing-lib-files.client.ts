import * as monaco from 'monaco-editor';
import { LibFiles } from 'monaco-editor/esm/vs/language/typescript/languageFeatures.js';
import { debugCmdClick } from '#lib/monaco-workspace-fs/cmd-click-diagnostic.js';
import type { MonacoWorkspaceFs } from '#lib/monaco-workspace-fs/monaco-workspace-fs.types.js';

type TsWorkerAccessor = (...uris: monaco.Uri[]) => Promise<unknown>;

/**
 * Extends Monaco's LibFiles so project/workspace URIs materialise via {@link MonacoWorkspaceFs}.
 */
export class MaterializingLibFiles extends LibFiles {
  private readonly workspaceFsRef: MonacoWorkspaceFs;

  public constructor(worker: TsWorkerAccessor, workspaceFs: MonacoWorkspaceFs) {
    super(worker);
    this.workspaceFsRef = workspaceFs;
  }

  /** @inheritdoc */
  public override getOrCreateModel(fileName: string): monaco.editor.ITextModel | undefined {
    const upstream = super.getOrCreateModel(fileName);
    if (upstream) {
      debugCmdClick('MaterializingLibFiles.getOrCreateModel:upstream-hit', { fileName });
      return upstream;
    }
    const uri = monaco.Uri.parse(fileName);
    const peeked = this.workspaceFsRef.peekModel(uri) ?? null;
    debugCmdClick('MaterializingLibFiles.getOrCreateModel:peek-result', {
      fileName,
      scheme: uri.scheme,
      hasPeekedModel: peeked !== null,
    });
    return peeked ?? undefined;
  }

  /** @inheritdoc */
  public override async fetchLibFilesIfNecessary(uris: readonly monaco.Uri[]): Promise<void> {
    debugCmdClick('MaterializingLibFiles.fetchLibFilesIfNecessary:enter', {
      uris: uris.map((uri) => uri.toString()),
    });
    await super.fetchLibFilesIfNecessary(uris);
    const projectUris = uris.filter((uri) => this.workspaceFsRef.canMaterialise(uri));
    debugCmdClick('MaterializingLibFiles.fetchLibFilesIfNecessary:filtered', {
      total: uris.length,
      materialisable: projectUris.length,
      projectUris: projectUris.map((uri) => uri.toString()),
    });
    await this.workspaceFsRef.materialiseUrisForWorkspaceEdit(projectUris);
    debugCmdClick('MaterializingLibFiles.fetchLibFilesIfNecessary:done', {
      materialised: projectUris.length,
    });
  }
}
