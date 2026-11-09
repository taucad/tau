import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { EditorSymbolCrumb } from '#components/code/editor-language-features.js';

type SymbolPathReporter = (path: readonly EditorSymbolCrumb[]) => void;

const EditorSymbolPathContext = createContext<SymbolPathReporter | undefined>(undefined);

/**
 * Lets a file pane's source editor report the cursor's symbol path to the pane's breadcrumbs, which render it after
 * the file name like VS Code's outline breadcrumbs. Panes without a source editor never receive a path.
 */
export function EditorSymbolPathProvider({
  onSymbolPath,
  children,
}: {
  readonly onSymbolPath: SymbolPathReporter;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <EditorSymbolPathContext.Provider value={onSymbolPath}>{children}</EditorSymbolPathContext.Provider>;
}

/** The symbol path reporter of the enclosing file pane, if any. */
export function useEditorSymbolPathReporter(): SymbolPathReporter | undefined {
  return useContext(EditorSymbolPathContext);
}
