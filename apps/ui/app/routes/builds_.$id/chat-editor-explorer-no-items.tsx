export function ChatEditorExplorerNoItems({ message }: { readonly message: string }): React.JSX.Element {
  return <div className="border-dashed rounded-sm border mx-2 -mt-1 mb-2 p-2 text-center text-sm text-muted-foreground">{message}</div>;
}
