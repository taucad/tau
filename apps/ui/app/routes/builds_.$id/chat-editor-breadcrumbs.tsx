import type { ReactNode } from 'react';
import { Fragment } from 'react/jsx-runtime';
import { ChevronRight } from 'lucide-react';
import { FileExplorerContext } from '~/routes/builds_.$id/graphics-actor.js';

export function ChatEditorBreadcrumbs(): ReactNode {
  const activeFile = FileExplorerContext.useSelector((state) =>
    state.context.openFiles.find((file) => file.id === state.context.activeFileId),
  );

  return (
    <div className="flex flex-row items-center gap-0.5 px-4 py-3 text-sm text-muted-foreground">
      {String(activeFile?.path)
        .split('/')
        .map((part, index) => (
          <Fragment key={part}>
            <span className="font-medium">{part}</span>
            {index < String(activeFile?.path).split('/').length - 1 && <ChevronRight className="size-4" />}
          </Fragment>
        ))}
    </div>
  );
}
