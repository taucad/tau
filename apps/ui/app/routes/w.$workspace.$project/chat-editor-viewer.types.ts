import type { editor } from 'monaco-editor';
import { assertRootedPath } from '@taucad/utils/path';

export type ChatEditorViewerProps = {
  /**
   * Stable identity of the editor pane hosting this viewer. Use for any
   * viewer-local state that must survive a file rename.
   */
  readonly paneId: string;
  readonly filePath: string;
  readonly content: string;
  readonly language: string;
  readonly onChange: (value: string | undefined) => void;
  readonly onValidate: (markers: editor.IMarkerData[]) => void;
  /** When true, Monaco is read-only and `onChange` is not invoked for edits. */
  readonly readOnly?: boolean;
};

/**
 * Translate a Tau rooted path into Monaco's private `file://` URI path form.
 */
export function createMonacoPath(relativePath: string): string {
  return `/${assertRootedPath(relativePath)}`;
}
