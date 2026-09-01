/**
 * JavaScript / JSX language contribution (Monaco `javascript`, `javascriptreact`).
 *
 * Activation is family-aligned with Monaco's JavaScript worker path.
 * Shared ATA + kernel typings live in `typescript-family-shared.ts`.
 */

import type * as Monaco from 'monaco-editor';
import type { LanguageContribution, ActivationContext, ActivationResult } from '#lib/monaco-language-registry.js';
import { registerMaterializingJsProviders } from '#lib/monaco-typescript-extras/register-materializing-typescript-providers.client.js';
import { ensureAtaBoot, forwardAtaProjectSessionChange, setJsCompilerOptions } from '#lib/typescript-family-shared.js';

export const jsContribution: LanguageContribution = {
  languageId: 'javascript',
  activationLanguageIds: ['javascript', 'javascriptreact'],

  register(_monaco: typeof Monaco): void {
    // No-op: Monaco's built-in JS support is always available
  },

  activate(context: ActivationContext): ActivationResult {
    const { monaco, workspaceFs } = context;
    const disposables: Monaco.IDisposable[] = [];

    setJsCompilerOptions(monaco);
    disposables.push(ensureAtaBoot(monaco, context.fileManagerRef));
    disposables.push(registerMaterializingJsProviders({ monaco, workspaceFs }));

    return { disposables };
  },

  onProjectSessionChange(projectId: string): void {
    forwardAtaProjectSessionChange(projectId);
  },

  dispose(): void {
    // ATA + provider disposal owned by activate() disposables
  },
};
