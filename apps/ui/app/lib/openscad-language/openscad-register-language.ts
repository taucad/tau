// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import type Monaco from 'monaco-editor/esm/vs/editor/editor.api';
// Import { buildOpenScadCompletionItemProvider } from '~/lib/openscad-language/openscad-completions.js';
// import { openscadLanguageConfiguration, openscadLanguage } from '~/lib/openscad-language/openscad-language.js';

// https://microsoft.github.io/monaco-editor/playground.html#extending-language-services-custom-languages
export function registerOpenScadLanguage(monaco: typeof Monaco): void {
  // Monaco.languages.register({
  //   id: 'openscad',
  //   extensions: ['.scad'],
  //   mimetypes: ['text/openscad'],
  // });
  // monaco.languages.setLanguageConfiguration('openscad', openscadLanguageConfiguration);
  // monaco.languages.setMonarchTokensProvider('openscad', openscadLanguage);
  // monaco.languages.registerCompletionItemProvider('openscad', buildOpenScadCompletionItemProvider());
}
