/**
 * The rows History's lanes add between its entries (D2, D3): a branch's name
 * chip with the branch's own menu, a merge waiting on a decision, and the
 * agent's work in progress. Each is one row of the graph, keyed as its element
 * is, so the graph measures it like any other row.
 */
import { Bot } from 'lucide-react';
import { useLocation } from 'react-router';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import type { GraphRow } from '#components/revisions/revision-graph-layout.js';
import { BranchSwatch } from '#components/revisions/revision-graph-view.js';
import { timelineRow } from '#components/revisions/revision-timeline.js';
import { useChatRecords } from '#hooks/use-chat-records.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectRole, useRevisionCommands, useRevisionStatus } from '#hooks/use-revision-status.js';
import { useRevisions } from '#hooks/use-revisions.js';
import { useOptionalChatWorkspaceAuthority } from '#providers/chat-workspace-authority-provider.js';
import type { HistoryLanes, PendingMerge } from '#routes/w.$workspace.$project/history-lanes.js';
import { BranchMenu, renameRefusalOf } from '#routes/w.$workspace.$project/revision-branches.js';
import {
  agentWorkingTitle,
  pendingMergeNote,
  pendingMergeTitle,
} from '#routes/w.$workspace.$project/revision-vocabulary.js';
import { projectChatIdFromSearch } from '#utils/project-url.utils.js';

/** A row the lanes add: a branch's chip, a merge waiting on a decision, or the agent's work in progress. */
export type LaneStep =
  | Readonly<{ kind: 'chip'; key: string; branch: string; startsFrom?: string }>
  | Readonly<{ kind: 'pending'; key: string; merge: PendingMerge }>
  | Readonly<{ kind: 'working'; key: string; branch: string; chatName: string }>;

/* Where a lane row's marker sits, from the row's top: the centre of its first line. */
const anchor = 14;

/**
 * Work that is not an entry yet, which sits above everything under its
 * branch's chip (canvas `branch-conflict`, `agent-working`): each merge waiting
 * on a decision, then the agent's work on the branch the files are on.
 *
 * @param where - What History shows of the graph, the branch the files are on, and the
 *   working chat's name while the agent works on these files.
 * @param chipped - The branches already given a chip, which this adds to.
 * @returns The steps, in order.
 */
export const pendingStepsOf = (
  {
    lanes,
    branch,
    agentChat,
  }: Readonly<{ lanes: HistoryLanes; branch: string | undefined; agentChat: string | undefined }>,
  chipped: Set<string>,
): LaneStep[] => {
  const steps: LaneStep[] = [];
  const chipFirst = (line: string): void => {
    if (lanes.chips.has(line) && !chipped.has(line)) {
      chipped.add(line);
      steps.push({ kind: 'chip', key: `chip:${line}`, branch: line });
    }
  };
  for (const merge of lanes.pending) {
    chipFirst(merge.into);
    steps.push({ kind: 'pending', key: `pending:${merge.revisionId}`, merge });
  }
  if (agentChat !== undefined && branch !== undefined) {
    chipFirst(branch);
    steps.push({ kind: 'working', key: 'pending:working', branch, chatName: agentChat });
  }
  return steps;
};

/**
 * The graph row a lane step stands for. A chip carries a marker only for a
 * branch with no entries yet: its open end. A pending merge is an amber diamond
 * on the branch it lands on, linked by dashes to the branch it brings in; the
 * agent's work is the branch's open end, joined by dashes.
 *
 * @param step - The lane step.
 * @returns Its graph row.
 */
export const laneGraphRowOf = (step: LaneStep): GraphRow => {
  switch (step.kind) {
    case 'chip': {
      return {
        key: step.key,
        anchor,
        height: 30,
        ...(step.startsFrom === undefined
          ? {}
          : { node: { branch: step.branch, marker: 'open', ids: [], startsFrom: step.startsFrom } }),
      };
    }
    case 'pending': {
      return {
        key: step.key,
        anchor,
        height: 64,
        node: {
          branch: step.merge.into,
          marker: 'conflict',
          ids: [],
          /* With no branch to link to, the diamond stands alone on its lane. */
          pending: { kind: 'merge', from: step.merge.from ?? '' },
        },
      };
    }
    case 'working': {
      return {
        key: step.key,
        anchor,
        height: 44,
        node: { branch: step.branch, marker: 'open', ids: [], pending: { kind: 'working' } },
      };
    }
  }
};

/**
 * A branch chip's ⋮ (D3): the branch's own verbs, read from the projection and
 * the commands. *Update from* names the project's first branch and counts how
 * far the files are behind it; *Run this chat here* is offered only when it
 * would move the chat in focus, and an unplaced chat works in the live checkout.
 *
 * @param props - The branch and where the files are.
 * @returns The menu, or nothing for a person who cannot write.
 */
function BranchChipMenu({
  branch,
  currentBranch,
}: {
  readonly branch: string;
  readonly currentBranch: string | undefined;
}): React.JSX.Element | undefined {
  const { projectId } = useProject();
  const status = useRevisionStatus();
  const { branchFacts } = useRevisions();
  const role = useProjectRole();
  const commands = useRevisionCommands();
  const { chats } = useChatRecords(projectId);
  const authority = useOptionalChatWorkspaceAuthority();
  const activeChatId = projectChatIdFromSearch(useLocation().search);
  const facet = status?.branches.find((entry) => entry.name === branch);
  if (status === undefined || facet === undefined || role === 'read' || role === 'revoked') {
    return undefined;
  }
  const trunk = status.branches.some((entry) => entry.name === 'main') ? 'main' : (status.branches[0]?.name ?? 'main');
  /* The trunk's own entries the files lack: how far the branch they are on is behind it. */
  const behind = branchFacts?.get(trunk)?.ahead ?? 0;
  const { liveCheckoutId } = status;
  const { checkoutId } = facet;
  const placedOn =
    activeChatId === undefined
      ? undefined
      : (chats.find((chat) => chat.id === activeChatId)?.checkoutId ?? liveCheckoutId);
  const runChatHere =
    activeChatId === undefined || authority === undefined || checkoutId === undefined || placedOn === checkoutId
      ? undefined
      : () => {
          void authority.placeChat(activeChatId, checkoutId);
        };
  return (
    <span className='absolute top-0.5 right-0.5'>
      <BranchMenu
        branch={branch}
        currentBranch={currentBranch}
        trunk={trunk}
        behind={behind}
        /* A verb waiting on a person is still in flight (review R4). */
        isBusy={status.branchVerb.busy}
        renameRefusal={renameRefusalOf(facet, liveCheckoutId)}
        onSwitch={commands.switchTo}
        onMerge={commands.mergeBranch}
        onRename={commands.renameBranch}
        onClose={(name) => {
          commands.discardBranch(name, checkoutId);
        }}
        onRunChatHere={runChatHere}
      />
    </span>
  );
}

/**
 * A branch's name, in the row above its newest entry (D2). It draws no rail:
 * the graph's markers and bends do. A branch with no entries yet has its open
 * end on its lane, centred on this row. Its ⋮ is the branch's own menu (D3),
 * fixed to the first line while the counts wrap.
 *
 * @param props - The branch, the lanes and where the files are.
 * @returns The chip's row.
 */
function BranchChipRow({
  branch,
  lanes,
  currentBranch,
}: {
  readonly branch: string;
  readonly lanes: HistoryLanes;
  readonly currentBranch: string | undefined;
}): React.JSX.Element {
  const note = lanes.notes.get(branch) ?? '';
  return (
    <li data-graph-key={`chip:${branch}`} data-row='chip' data-branch={branch} className={timelineRow}>
      <span aria-hidden />
      <span className='relative flex min-h-7 min-w-0 flex-wrap items-center gap-x-2 py-1 pr-8 pl-1'>
        <span
          data-slot='branch-name'
          className={cn(
            'inline-flex h-5 max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-background px-2 text-xs',
            branch === currentBranch && 'font-medium',
          )}
        >
          <BranchSwatch slot={lanes.slots.get(branch)} />
          <span className='truncate'>{branch}</span>
        </span>
        {note === '' ? null : (
          <span data-slot='branch-note' className='text-xs leading-5 whitespace-nowrap text-muted-foreground'>
            {note}
          </span>
        )}
        <BranchChipMenu branch={branch} currentBranch={currentBranch} />
      </span>
    </li>
  );
}

/**
 * A merge waiting on a decision (D3, canvas `branch-conflict`): one row above
 * the branch it lands on, whose amber diamond the graph links to the branch it
 * brings in by dashes, because nothing has landed. *Resolve* takes you to the
 * conflict card, which holds the choices.
 *
 * @param props - The pending merge.
 * @returns The row.
 */
function PendingMergeRow({ merge }: { readonly merge: PendingMerge }): React.JSX.Element {
  const conflict = useRevisionStatus()?.conflicts.find((entry) => entry.revisionId === merge.revisionId);
  /* Unknown until the conflict has been read, never zero (R13). */
  const filesLeft =
    conflict?.labels === undefined ? undefined : conflict.paths.filter((path) => path.side === undefined).length;
  return (
    <li data-graph-key={`pending:${merge.revisionId}`} data-row='merge' className={timelineRow}>
      <span aria-hidden />
      <div className='flex min-w-0 flex-col gap-1.5 py-1 pr-2 pl-1'>
        <span data-slot='row-title' className='text-sm leading-5 wrap-break-word'>
          {pendingMergeTitle(merge.from, merge.into)}
        </span>
        <div className='flex flex-wrap items-center gap-2 pb-1'>
          <Button
            size='xs'
            onClick={() => {
              const card = document.querySelector<HTMLElement>('[aria-labelledby="revision-conflicts-heading"]');
              card?.scrollIntoView({ block: 'nearest' });
              card?.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true });
            }}
          >
            Resolve
          </Button>
          <span className='text-xs text-muted-foreground'>{pendingMergeNote(filesLeft, merge.into)}</span>
        </div>
      </div>
    </li>
  );
}

/**
 * The agent's work in progress (D2, canvas `agent-working`): not an entry yet,
 * so the graph gives it the branch's open end, joined to the entry the files are
 * at by a dashed rail. The row names the chat the agent works in.
 *
 * @param props - The chat's name.
 * @returns The row.
 */
function AgentWorkingRow({ chatName }: { readonly chatName: string }): React.JSX.Element {
  return (
    <li data-graph-key='pending:working' data-row='working' className={timelineRow}>
      <span aria-hidden />
      <span className='flex min-w-0 flex-col py-1 pr-2 pl-1'>
        <span data-slot='row-title' className='text-sm leading-5 text-muted-foreground'>
          {agentWorkingTitle}
        </span>
        {chatName === '' ? null : (
          <span data-slot='row-meta' className='flex min-w-0 items-center gap-1 text-xs text-muted-foreground'>
            <Bot aria-hidden className='size-3 shrink-0' />
            <span className='min-w-0 truncate'>{chatName}</span>
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * One row the lanes add, as its step names it.
 *
 * @param props - The step, the lanes and where the files are.
 * @returns The row.
 */
export function LaneStepRow({
  step,
  lanes,
  currentBranch,
}: {
  readonly step: LaneStep;
  readonly lanes: HistoryLanes | undefined;
  readonly currentBranch: string | undefined;
}): React.JSX.Element | undefined {
  switch (step.kind) {
    case 'chip': {
      return lanes === undefined ? undefined : (
        <BranchChipRow branch={step.branch} lanes={lanes} currentBranch={currentBranch} />
      );
    }
    case 'pending': {
      return <PendingMergeRow merge={step.merge} />;
    }
    case 'working': {
      return <AgentWorkingRow chatName={step.chatName} />;
    }
  }
}
