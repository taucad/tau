import { CodeEditor } from '#components/code/code-editor.client.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@taucad/ui/components/dialog';
import type { EditorDocument } from '#lib/editor-document.js';
import type { EditorView } from '@codemirror/view';

export type VirtualDeclaration = Readonly<{
  uri: string;
  document: EditorDocument;
  line: number;
  column: number;
}>;

/** Read-only source view for a library declaration held by a language worker (TypeScript `.d.ts`, C# metadata). */
export function VirtualDeclarationDialog({
  declaration,
  onClose,
  restoreFocus,
}: {
  readonly declaration: VirtualDeclaration | undefined;
  readonly onClose: () => void;
  readonly restoreFocus: () => void;
}): React.JSX.Element {
  const languageId = declaration?.document.path.endsWith('.cs') ? 'csharp' : 'typescript';
  const languageName = languageId === 'csharp' ? 'C#' : 'TypeScript';
  const reveal = (view: EditorView): void => {
    if (!declaration) {
      return;
    }
    const line = view.state.doc.line(Math.max(1, Math.min(declaration.line, view.state.doc.lines)));
    const anchor = line.from + Math.max(0, Math.min(declaration.column - 1, line.length));
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    view.focus();
  };
  return (
    <Dialog
      open={declaration !== undefined}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className='flex h-[80vh] w-[90vw] max-w-5xl flex-col'
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{declaration?.document.path.split('/').at(-1) ?? `${languageName} declaration`}</DialogTitle>
          <DialogDescription>
            Read-only {languageName} declaration at {declaration?.uri}
          </DialogDescription>
        </DialogHeader>
        {declaration && (
          <div className='min-h-0 flex-1 overflow-hidden rounded-md border'>
            <CodeEditor
              document={declaration.document}
              viewId='virtual-declaration'
              languageId={languageId}
              readOnly
              onApply={() => undefined}
              onHistory={() => undefined}
              onMount={reveal}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
