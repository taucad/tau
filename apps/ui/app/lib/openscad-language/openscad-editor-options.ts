// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

export const openscadEditorOptions = {
  language: 'openscad',
  tabSize: 2,
  wrappingStrategy: 'advanced',
  suggest: {
    localityBonus: true,
    showStatusBar: true,
    preview: true,
  },
  codeLens: true,
  wordBasedSuggestions: 'off',
} satisfies monaco.editor.IStandaloneEditorConstructionOptions;
