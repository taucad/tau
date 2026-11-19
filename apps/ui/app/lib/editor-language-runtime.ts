import { acquireEditorLanguage as acquireHostedEditorLanguage } from '@taucad/editor-ui/lib/editor-language-runtime';
import type {
  EditorLanguageHost,
  EditorLanguageLease,
  EditorLanguageRequest as HostedEditorLanguageRequest,
} from '@taucad/editor-ui/lib/editor-language-runtime';
import { ENV } from '#environment.config.js';

/** A code pane's request for semantic services; this build supplies the host. */
export type EditorLanguageRequest = Omit<HostedEditorLanguageRequest, 'host'>;

/**
 * This build's language-service inputs: the acquisition mode, the server assets `csharp-language:prepare` and
 * `openscad-language-assets.vite-plugin.ts` staged (absent in test runs, which keep syntax editing) and the KCL
 * worker, whose WebAssembly is an app asset URL.
 */
const editorLanguageHost: EditorLanguageHost = {
  dynamicTypeAcquisition: () => ENV.TAU_ACQUISITION !== 'locked',
  csharpAssets: () =>
    typeof tauCsharpLanguageAssets === 'undefined' ? undefined : (tauCsharpLanguageAssets ?? undefined),
  openscadAssets: () => (typeof tauOpenscadLanguageAssets === 'object' ? tauOpenscadLanguageAssets : undefined),
  createKclWorker: () =>
    new Worker(new URL('kcl-language/lsp/kcl-lsp-worker.ts', import.meta.url), { type: 'module', name: 'kcl-lsp' }),
};

/** Load semantic services only for a live code pane; syntax has its own readiness boundary. */
export async function acquireEditorLanguage(request: EditorLanguageRequest): Promise<EditorLanguageLease> {
  return acquireHostedEditorLanguage({ ...request, host: editorLanguageHost });
}
