import type { EditorDocument, DocumentChange, DocumentTransaction } from '#lib/editor-document.js';

export type ChatEditorViewerProps = {
  /** Stable pane identity; split panes own distinct selections and scroll. */
  readonly paneId: string;
  readonly filePath: string;
  readonly content: string;
  readonly language: string;
  readonly onApply: (document: EditorDocument, transaction: DocumentTransaction) => DocumentChange | undefined;
  readonly onHistory: (document: EditorDocument, kind: 'undo' | 'redo') => DocumentChange | undefined;
  readonly readOnly?: boolean;
};
