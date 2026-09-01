// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import type * as Monaco from 'monaco-editor';
import { codeLanguages } from '@taucad/types/constants';
import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
import { createCompletionItemProvider } from '#lib/openscad-language/openscad-completions.js';
import { createDefinitionProvider } from '#lib/openscad-language/openscad-definition.js';
import { createHoverProvider } from '#lib/openscad-language/openscad-hover.js';
import { createOpenscadLanguageConfiguration } from '#lib/openscad-language/openscad-language.js';
import { createSignatureHelpProvider } from '#lib/openscad-language/openscad-signature-help.js';
import { createInProcessJsonRpcPair } from '@taucad/lsp/in-process-jsonrpc';
import { serveLanguageFileSystemRequests } from '@taucad/lsp/language-fs-bridge';
import type { LanguageContribution, ActivationContext, ActivationResult } from '#lib/monaco-language-registry.js';

/** Track if already registered to prevent duplicate registration */
let isRegistered = false;

// https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
export function registerOpenScadLanguage(monaco: typeof Monaco): void {
  if (isRegistered) {
    return;
  }

  isRegistered = true;

  monaco.languages.register({
    id: codeLanguages.openscad,
    extensions: ['.scad'],
    aliases: ['OpenSCAD', 'openscad'],
    mimetypes: ['text/x-openscad'],
  });

  // Create the language configuration and definition with monaco injection
  const languageConfiguration = createOpenscadLanguageConfiguration(monaco);
  const completionProvider = createCompletionItemProvider(monaco);

  monaco.languages.setLanguageConfiguration('openscad', languageConfiguration);
  monaco.languages.registerCompletionItemProvider('openscad', completionProvider);
  monaco.languages.registerHoverProvider('openscad', createHoverProvider(monaco));
  monaco.languages.registerSignatureHelpProvider('openscad', createSignatureHelpProvider(monaco));
}

// ============================================================================
// Language Contribution (for LanguageContributionRegistry)
// ============================================================================

/**
 * OpenSCAD Language Contribution
 *
 * Conforms to the LanguageContribution interface for uniform lifecycle management.
 * OpenSCAD is simple -- all providers are registered during the register phase
 * since they don't depend on external services.
 */
export const openscadContribution: LanguageContribution = {
  languageId: codeLanguages.openscad,
  /**
   * Gates OpenSCAD activation behind the first `openscad` model creation
   * (lazy activation).
   */
  activationLanguageIds: [codeLanguages.openscad],

  register(monaco: typeof Monaco): void {
    registerOpenScadLanguage(monaco);
  },

  activate(context: ActivationContext): ActivationResult {
    const snap = context.fileManagerRef.getSnapshot();
    const { proxy } = snap.context;
    if (!proxy) {
      return { disposables: [] };
    }

    const paths = new WorkspacePathResolver(snap.context.rootDirectory);
    const pair = createInProcessJsonRpcPair();
    const bridgeDisposable = serveLanguageFileSystemRequests(pair.clientSide.server, {
      fileManager: context.fileManager,
      treeService: context.treeService,
      proxy,
      paths,
      filePoolBuffer: snap.context.filePoolBuffer,
    });

    const definitionDisposable = context.monaco.languages.registerDefinitionProvider(
      codeLanguages.openscad,
      createDefinitionProvider(context.monaco, { workspaceFs: context.workspaceFs }),
    );

    return {
      disposables: [
        definitionDisposable,
        bridgeDisposable,
        {
          dispose: () => {
            pair.dispose();
          },
        },
      ],
    };
  },

  dispose(): void {
    isRegistered = false;
  },
};
