// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { createCompletionItemProvider } from '#lib/openscad-language/openscad-completions.js';
import { createDefinitionProvider } from '#lib/openscad-language/openscad-definition.js';
import { createHoverProvider } from '#lib/openscad-language/openscad-hover.js';
import { createOpenscadLanguageConfiguration } from '#lib/openscad-language/openscad-language.js';
import { createSignatureHelpProvider } from '#lib/openscad-language/openscad-signature-help.js';

// https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
export function registerOpenScadLanguage(monaco: typeof Monaco): void {
  monaco.languages.register({
    id: 'openscad',
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

  // Register definition provider for Go to Definition (Cmd/Ctrl+click)
  monaco.languages.registerDefinitionProvider('openscad', createDefinitionProvider(monaco));
}
