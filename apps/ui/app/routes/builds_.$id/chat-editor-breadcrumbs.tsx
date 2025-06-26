import type { ReactNode } from 'react';
import { Fragment } from 'react/jsx-runtime';
import { ChevronRight } from 'lucide-react';
import { FileExplorerContext } from '~/routes/builds_.$id/graphics-actor.js';

export function ChatEditorBreadcrumbs(): ReactNode {
  const activeFile = FileExplorerContext.useSelector((state) =>
    state.context.openFiles.find((file) => file.id === state.context.activeFileId),
  );

  // Keep empty string initially to avoid flickering
  const displayPath = String(activeFile?.path ?? '');
  const parts = displayPath.split('/');

  return (
    <div className="flex flex-row items-center gap-0.5 px-4 py-0.25 text-sm text-muted-foreground">
      {displayPath ? (
        parts.map((part, index) => (
          <Fragment key={part}>
            <span className="font-medium">{part}</span>
            {index < parts.length - 1 && <ChevronRight className="size-4" />}
          </Fragment>
        ))
      ) : (
        // Maintain height with invisible content when empty
        <span className="opacity-0">placeholder</span>
      )}
    </div>
  );
}
