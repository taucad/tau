import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LayoutPanelTop, RotateCcw, XCircle } from 'lucide-react';
import type { ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { parseToolErrorEnvelope } from '@taucad/chat/utils';
import { workbenchPaths } from '@taucad/workbench';
import { Button } from '@taucad/ui/components/button';
import {
  ChatToolCard,
  ChatToolCardHeader,
  ChatToolCardContent,
  ChatToolCardIcon,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { useProject } from '#hooks/use-project.js';
import { useWorkbenchLayoutController } from '#routes/w.$workspace.$project/project-workspace-context.js';
import { paneTitle } from '#workbench-records/pane-titles.js';
import type { WorkbenchLayoutSnapshot } from '#routes/w.$workspace.$project/workbench-layout-controller.js';

type ArrangeInvocation = ToolInvocation<typeof toolName.arrangeWorkbench>;

const tabLabel = (
  tab: Extract<ArrangeInvocation, { state: 'output-available' }>['output']['visible'][number],
): string => (tab.kind === 'view' ? `${tab.view} view` : tab.kind === 'pane' ? paneTitle(tab.pane) : tab.path);

const viewPathsIn = (node: WorkbenchLayoutSnapshot['layout']['viewer']): string[] =>
  node.kind === 'group' ? node.tabs.map((tab) => workbenchPaths.view(tab.view)) : node.children.flatMap(viewPathsIn);

const isAdopted = (
  part: Extract<ArrangeInvocation, { state: 'output-available' }>,
  current: WorkbenchLayoutSnapshot | undefined,
  project: ReturnType<typeof useProject>,
): boolean => {
  const layoutRevision = part.output.revisions.find(({ path }) => path === workbenchPaths.layout);
  const layoutApplied =
    Boolean(layoutRevision && current && project) &&
    layoutRevision?.digest !== 'missing' &&
    layoutRevision?.digest === current?.layoutDigest &&
    project?.appliedWorkbenchRevisions.get(workbenchPaths.layout) === layoutRevision?.digest;
  const openViewPaths = current ? new Set(viewPathsIn(current.layout.viewer)) : undefined;
  return (
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
    })
  );
};

/** The transcript states the requested arrangement and whether this page adopted it. */
export function ChatMessageToolArrangeWorkbench({ part }: { readonly part: ArrangeInvocation }): React.JSX.Element {
  const controller = useWorkbenchLayoutController();
  const project = useProject({ enableNoContext: true });
  const projectRef = useRef(project);
  useLayoutEffect(() => {
    projectRef.current = project;
  }, [project]);
  const current = useSyncExternalStore(controller.subscribe, controller.snapshot, () => undefined);
  const [isOpen, setIsOpen] = useState(false);
  const restorePending = useRef(false);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const [restoreError, setRestoreError] = useState<string>();

  if (part.state === 'output-error') {
    const code = parseToolErrorEnvelope(part.errorText)?.errorCode;
    const consequence =
      code === 'RECORD_CONFLICT'
        ? 'Read the current workbench before retrying. Earlier records may already have been written.'
        : code === 'INVALID_RECORD'
          ? 'Keep the existing record. Inspect its diagnostic before resetting or updating it.'
          : code === 'FILE_NOT_FOUND'
            ? 'Check the missing file in the diagnostic before retrying.'
            : code === 'VALIDATION_ERROR' || code === 'TOOL_INPUT_VALIDATION_FAILED'
              ? 'Correct the request before retrying.'
              : 'The arrangement outcome is unconfirmed. Inspect the current workbench before retrying; some records may have been written.';
    return (
      <div>
        <ChatToolError
          errorText={part.errorText}
          icon={XCircle}
          noun='workbench arrangement'
          isOpen={isOpen}
          onOpenChange={setIsOpen}
        />
        <p role='alert' className='py-1 text-xs text-muted-foreground'>
          {consequence}
        </p>
      </div>
    );
  }

  if (part.state !== 'output-available') {
    const denied = part.state === 'output-denied';
    const approval = part.state === 'approval-requested';
    const responded = part.state === 'approval-responded';
    return (
      <ChatToolCard
        variant='minimal'
        status={denied || approval ? 'warning' : 'loading'}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      >
        <ChatToolCardHeader>
          <ChatToolCardIcon icon={LayoutPanelTop} />
          <ChatToolCardTitle>
            <ChatToolLabel
              verb={denied ? 'Denied' : approval ? 'Awaiting approval' : responded ? 'Awaiting result' : 'Arranging'}
            >
              <ChatToolDescription>workbench</ChatToolDescription>
            </ChatToolLabel>
          </ChatToolCardTitle>
        </ChatToolCardHeader>
        <ChatToolCardContent>
          <p className='py-1 text-xs text-muted-foreground'>
            {denied
              ? 'The arrangement was not approved.'
              : approval
                ? 'Use the existing approval request to respond.'
                : 'No written result has been confirmed.'}
          </p>
        </ChatToolCardContent>
      </ChatToolCard>
    );
  }

  const allRevisionsApplied = isAdopted(part, current, project);
  const adoptedSnapshot = allRevisionsApplied ? current : undefined;
  const status = adoptedSnapshot ? (adoptedSnapshot.refused.length === 0 ? 'Shown' : 'Shown partly') : 'Written';
  const views = part.output.visible.filter((tab) => tab.kind === 'view').length;
  const files = part.output.visible.filter((tab) => tab.kind === 'file').length;
  const summary =
    [
      ...(views ? [`${views} ${views === 1 ? 'view' : 'views'}`] : []),
      ...part.output.visible.flatMap((tab) => (tab.kind === 'pane' ? [paneTitle(tab.pane)] : [])),
      ...(files ? [`${files} ${files === 1 ? 'file' : 'files'}`] : []),
    ].join(', ') || 'workbench';
  const unchanged =
    part.output.revisions.length > 0 &&
    part.output.revisions.every(({ digest, previousDigest }) => digest === previousDigest);
  const unavailable = restored
    ? 'This restore has already been written.'
    : allRevisionsApplied
      ? (current?.restoreUnavailable ?? (current?.restoreTarget ? undefined : 'No previous layout is saved.'))
      : 'Restore is available only while this result matches the current acknowledged records.';

  return (
    <ChatToolCard
      variant='minimal'
      status={adoptedSnapshot?.refused.length ? 'warning' : 'ready'}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <ChatToolCardHeader>
        <ChatToolCardIcon icon={LayoutPanelTop} />
        <ChatToolCardTitle>
          <ChatToolLabel verb={unchanged ? 'Unchanged' : 'Arranged'}>
            <ChatToolDescription>{unchanged ? 'workbench' : summary}</ChatToolDescription>
          </ChatToolLabel>
        </ChatToolCardTitle>
        <span role='status' className='ml-auto shrink-0 text-xs text-muted-foreground'>
          {status}
        </span>
      </ChatToolCardHeader>
      <ChatToolCardContent>
        <div className='space-y-2 py-2 text-xs text-muted-foreground'>
          <p>
            {adoptedSnapshot
              ? 'This page acknowledged the requested records.'
              : 'The records were written. Adoption by this page is unconfirmed; this result may have been shown earlier.'}
          </p>
          <p className='font-medium text-foreground'>Requested arrangement</p>
          {part.output.visible.length > 0 ? (
            <ul className='space-y-1'>
              {part.output.visible.map((tab) => (
                <li key={JSON.stringify(tab)} className='wrap-anywhere'>
                  {tabLabel(tab)}
                </li>
              ))}
            </ul>
          ) : (
            <p>No visible tabs were requested.</p>
          )}
          <p className='font-medium text-foreground'>Requested scope</p>
          <pre className='wrap-anywhere whitespace-pre-wrap'>{JSON.stringify(part.input, null, 2)}</pre>
          <p>
            Restore writes the latest saved previous project layout. It keeps existing view and entry settings and model
            files; missing views use saved records. It does not undo this call.
          </p>
          <Button
            type='button'
            variant='outline'
            size='xs'
            className='bg-transparent hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent'
            disabled={Boolean(unavailable) || restoring || current?.restoring === true}
            aria-busy={restoring || current?.restoring === true}
            onClick={async () => {
              if (restorePending.current || unavailable !== undefined || !current?.restoreTarget) {
                return;
              }
              restorePending.current = true;
              setRestoring(true);
              setRestoreError(undefined);
              try {
                const saved =
                  controller.snapshot() === current &&
                  (await controller.restorePreviousArrangement({
                    layoutDigest: current.layoutDigest,
                    target: current.restoreTarget,
                    eligible: () => isAdopted(part, controller.snapshot(), projectRef.current),
                  }));
                if (saved) {
                  setRestored(true);
                } else {
                  setRestoreError(
                    'Previous layout could not be restored. Refresh the current records and retry; some view records may have been written.',
                  );
                }
              } catch {
                setRestoreError(
                  'Previous layout could not be restored. Refresh the current records and retry; some view records may have been written.',
                );
              } finally {
                restorePending.current = false;
                setRestoring(false);
              }
            }}
          >
            <RotateCcw aria-hidden='true' /> Restore previous layout
          </Button>
          {unavailable ? <p>{unavailable}</p> : undefined}
        </div>
      </ChatToolCardContent>
      {adoptedSnapshot?.refused.length ? (
        <p role='alert' className='py-1 text-xs text-muted-foreground'>
          Debug mode is off: {adoptedSnapshot.refused.map(({ tab }) => tabLabel(tab)).join(', ')} could not be shown.
        </p>
      ) : undefined}
      {restored ? (
        <p role='status' className='py-1 text-xs text-muted-foreground'>
          Restore written. Adoption is tracked separately.
        </p>
      ) : undefined}
      {restoreError ? (
        <p role='alert' className='py-1 text-xs text-muted-foreground'>
          {restoreError}
        </p>
      ) : undefined}
    </ChatToolCard>
  );
}
