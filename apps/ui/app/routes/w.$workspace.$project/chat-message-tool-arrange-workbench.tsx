import { useState, useSyncExternalStore } from 'react';
import { LayoutPanelTop, RotateCcw, XCircle } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { workbenchPaths } from '@taucad/workbench';
import { Button } from '@taucad/ui/components/button';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { useProject } from '#hooks/use-project.js';
import { useWorkbenchLayoutController } from '#routes/w.$workspace.$project/project-workspace-context.js';
import type { WorkbenchLayoutSnapshot } from '#routes/w.$workspace.$project/workbench-layout-controller.js';

type ArrangeInvocation = ToolInvocation<typeof toolName.arrangeWorkbench>;

const tabLabel = (
  tab: Extract<ArrangeInvocation, { state: 'output-available' }>['output']['visible'][number],
): string => (tab.kind === 'view' ? `${tab.view} view` : tab.kind === 'pane' ? tab.pane : tab.path);

const viewPathsIn = (node: WorkbenchLayoutSnapshot['layout']['viewer']): string[] =>
  node.kind === 'group' ? node.tabs.map((tab) => workbenchPaths.view(tab.view)) : node.children.flatMap(viewPathsIn);

/** The transcript states the requested arrangement and whether this page adopted it. */
export function ChatMessageToolArrangeWorkbench({ part }: { readonly part: ArrangeInvocation }): React.JSX.Element {
  const controller = useWorkbenchLayoutController();
  const project = useProject({ enableNoContext: true });
  const current = useSyncExternalStore(controller.subscribe, controller.snapshot, () => undefined);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();

  if (part.state === 'output-error') {
    return <ChatToolError errorText={part.errorText} icon={XCircle} noun='workbench arrangement' />;
  }

  if (part.state !== 'output-available') {
    return (
      <ChatToolCard variant='minimal' status='loading' isCollapsible={false}>
        <ChatToolCardHeader>
          <ChatToolCardIcon icon={LayoutPanelTop} />
          <ChatToolCardTitle>
            <ChatToolLabel verb='Arranging'>
              <ChatToolDescription>workbench…</ChatToolDescription>
            </ChatToolLabel>
          </ChatToolCardTitle>
        </ChatToolCardHeader>
      </ChatToolCard>
    );
  }

  const layoutRevision = part.output.revisions.find(({ path }) => path === workbenchPaths.layout);
  const layoutApplied =
    layoutRevision?.digest === current?.layoutDigest &&
    project?.appliedWorkbenchRevisions.get(workbenchPaths.layout) === layoutRevision?.digest;
  const openViewPaths = current ? new Set(viewPathsIn(current.layout.viewer)) : undefined;
  const allRevisionsApplied =
    layoutApplied &&
    part.output.revisions.every(({ path, digest }) => {
      if (path === workbenchPaths.layout) {
        return true;
      }
      if (path === workbenchPaths.entries) {
        return (
          digest !== 'missing' &&
          (part.input.entries ?? []).every((entry) => project?.appliedEntryRevisions.get(entry.path) === digest)
        );
      }
      if (!path.startsWith('.tau/workbench/views/') || !path.endsWith('.json')) {
        return false;
      }
      return digest === 'missing'
        ? openViewPaths?.has(path) === false
        : project?.appliedWorkbenchRevisions.get(path) === digest;
    });
  const adoptedSnapshot = allRevisionsApplied ? current : undefined;
  const status = adoptedSnapshot
    ? adoptedSnapshot.refused.length === 0
      ? 'Shown'
      : 'Shown partly'
    : 'Written · shown when the project opens';

  return (
    <ChatToolCard
      variant='minimal'
      status={adoptedSnapshot && adoptedSnapshot.refused.length > 0 ? 'warning' : 'ready'}
      isCollapsible={false}
    >
      <ChatToolCardHeader>
        <ChatToolCardIcon icon={LayoutPanelTop} />
        <ChatToolCardTitle>
          <ChatToolLabel verb='Arranged:'>
            <ChatToolDescription>{part.output.visible.map(tabLabel).join(', ')}</ChatToolDescription>
          </ChatToolLabel>
        </ChatToolCardTitle>
      </ChatToolCardHeader>
      <div className='flex flex-wrap items-center gap-2 px-2 pb-1 text-xs text-muted-foreground'>
        <span className='shrink-0 text-xs' role='status'>
          {status}
        </span>
        <Button
          type='button'
          variant='ghost'
          size='xs'
          disabled={restoring}
          onClick={async () => {
            setRestoring(true);
            setRestoreError(undefined);
            try {
              const restored = await controller.restorePreviousArrangement();
              if (!restored) {
                setRestoreError('Previous arrangement could not be restored.');
              }
            } catch {
              setRestoreError('Previous arrangement could not be restored.');
            } finally {
              setRestoring(false);
            }
          }}
        >
          <RotateCcw aria-hidden='true' /> Restore
        </Button>
      </div>
      {restoreError ? (
        <div role='alert' className='px-2 pb-1 text-xs text-destructive'>
          {restoreError}
        </div>
      ) : undefined}
    </ChatToolCard>
  );
}
