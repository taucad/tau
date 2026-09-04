import { useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Bot, Circle, CircleAlert, Clock3, FolderGit2, GitBranch, Radio, ShieldAlert, XIcon } from 'lucide-react';
import type { ProjectSlugs } from '#utils/project-url.utils.js';
import { projectChatUrl } from '#utils/project-url.utils.js';
import { cn } from '@taucad/ui/utils/cn';
import { formatRelativeTime } from '#utils/date.utils.js';
import { formatCurrency } from '#utils/currency.utils.js';
import { useProject } from '#hooks/use-project.js';
import { useProjectSlugs } from '#hooks/use-project-slug-route.js';
import { useAgentProjections } from '#hooks/use-agent-projections.js';
import type { AgentProjection, AgentProjectionMetadata, AgentProjectionState } from '#hooks/use-agent-projections.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import {
  FloatingPanel,
  FloatingPanelClose,
  FloatingPanelContent,
  FloatingPanelContentBody,
  FloatingPanelContentHeader,
  FloatingPanelContentHeaderActions,
  FloatingPanelContentTitle,
} from '#components/ui/floating-panel.js';

type AgentsPanelBodyProps = {
  readonly metadataByChatId?: Readonly<Record<string, AgentProjectionMetadata>>;
};

type AgentListProps = {
  readonly agents: readonly AgentProjection[];
  readonly projectSlugs?: ProjectSlugs;
};

const statePresentation: Readonly<
  Record<
    AgentProjectionState,
    {
      readonly label: string;
      readonly icon: typeof Circle;
      readonly rail: string;
      readonly tone: string;
      readonly iconClassName: string;
    }
  >
> = {
  waiting: {
    label: 'Waiting',
    icon: Clock3,
    rail: 'before:bg-warning',
    tone: 'border-warning/30 bg-warning/10 text-warning',
    iconClassName: 'text-warning',
  },
  running: {
    label: 'Running',
    icon: Radio,
    rail: 'before:bg-information',
    tone: 'border-information/30 bg-information/10 text-information',
    iconClassName: 'text-information animate-pulse motion-reduce:animate-none',
  },
  error: {
    label: 'Error',
    icon: CircleAlert,
    rail: 'before:bg-destructive',
    tone: 'border-destructive/30 bg-destructive/10 text-destructive',
    iconClassName: 'text-destructive',
  },
  idle: {
    label: 'Idle',
    icon: Circle,
    rail: 'before:bg-muted-foreground/35',
    tone: 'border-border bg-muted/50 text-muted-foreground',
    iconClassName: 'text-muted-foreground/60',
  },
};

/** Mobile wrapper around the same body registered with the desktop Workbench. */
export const ChatAgents = ({
  isExpanded = true,
  setIsExpanded,
}: {
  readonly isExpanded?: boolean;
  readonly setIsExpanded?: (value: boolean | ((current: boolean) => boolean)) => void;
}): React.JSX.Element => (
  <FloatingPanel isOpen={isExpanded} side='right' onOpenChange={setIsExpanded}>
    <FloatingPanelContent>
      <FloatingPanelContentHeader>
        <FloatingPanelContentTitle>Agents</FloatingPanelContentTitle>
        <FloatingPanelContentHeaderActions>
          <FloatingPanelClose icon={XIcon} tooltipContent={(isOpen) => <div>{isOpen ? 'Close' : 'Open'} Agents</div>} />
        </FloatingPanelContentHeaderActions>
      </FloatingPanelContentHeader>
      <FloatingPanelContentBody className='p-0'>
        <AgentsPanelBody />
      </FloatingPanelContentBody>
    </FloatingPanelContent>
  </FloatingPanel>
);

/** Durable + live project-wide projection. It never acquires or owns a chat run. */
export const AgentsPanelBody = ({ metadataByChatId }: AgentsPanelBodyProps): React.JSX.Element => {
  useAgentsClock();
  const { projectId } = useProject();
  const projectSlugsResolution = useProjectSlugs(projectId);
  const projectSlugs = projectSlugsResolution.status === 'resolved' ? projectSlugsResolution.value : undefined;
  const { agents, isLoading, error, retry } = useAgentProjections({
    workspaceLabel: projectSlugs?.workspaceSlug,
    metadataByChatId,
  });

  return (
    <div data-slot='agents-panel-body' className='flex size-full min-h-0 flex-col overflow-hidden bg-sidebar'>
      <AgentsOverview agents={agents} />
      <div className='min-h-0 flex-1 scroll-shadows-y overflow-y-auto p-2 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
        {isLoading && agents.length === 0 ? <AgentsLoading /> : null}
        {error && agents.length === 0 ? (
          <PanelEmptyState
            icon={CircleAlert}
            iconClassName='text-destructive'
            title='Agents unavailable'
            description={error}
            role='alert'
            aria-label='Agents unavailable'
            className='m-0 min-h-full rounded-xl border bg-card'
          >
            <Button type='button' size='sm' variant='outline' onClick={() => void retry()}>
              Retry
            </Button>
          </PanelEmptyState>
        ) : null}
        {!isLoading && !error && agents.length === 0 ? (
          <PanelEmptyState
            icon={Bot}
            title='No agents yet'
            description='Project chats will appear here.'
            className='m-0 min-h-full rounded-xl border bg-card'
          />
        ) : null}
        {agents.length > 0 ? <AgentList agents={agents} projectSlugs={projectSlugs} /> : null}
      </div>
    </div>
  );
};

const AgentsOverview = ({ agents }: { readonly agents: readonly AgentProjection[] }): React.JSX.Element => {
  const activeCount = agents.filter((agent) => agent.state === 'running' || agent.state === 'waiting').length;
  const attentionCount = agents.filter(
    (agent) => agent.state === 'waiting' || agent.state === 'error' || agent.unread,
  ).length;
  return (
    <div
      aria-label='Agent overview'
      aria-live='polite'
      className='flex min-h-10 shrink-0 items-center gap-3 border-b border-border/70 px-3 text-xs text-muted-foreground'
    >
      <span className='flex min-w-0 items-center gap-1.5'>
        <Bot aria-hidden='true' className='size-3.5' />
        <strong className='font-medium text-foreground'>{agents.length}</strong>
        <span className='truncate'>{agents.length === 1 ? 'agent' : 'agents'}</span>
      </span>
      <span className='flex items-center gap-1.5'>
        <Radio aria-hidden='true' className={cn('size-3.5', activeCount > 0 && 'text-information')} />
        {activeCount} active
      </span>
      {attentionCount > 0 ? (
        <span className='ml-auto flex items-center gap-1.5 text-warning'>
          <ShieldAlert aria-hidden='true' className='size-3.5' />
          {attentionCount}
          <span className='sr-only'>need attention</span>
        </span>
      ) : null}
    </div>
  );
};

export const AgentList = ({ agents, projectSlugs }: AgentListProps): React.JSX.Element => (
  <ol aria-label='Agents' className='flex list-none flex-col gap-2'>
    {agents.map((agent) => (
      <li key={agent.chatId}>
        <AgentRow agent={agent} projectSlugs={projectSlugs} />
      </li>
    ))}
  </ol>
);

const AgentRow = ({
  agent,
  projectSlugs,
}: {
  readonly agent: AgentProjection;
  readonly projectSlugs?: ProjectSlugs;
}): React.JSX.Element => {
  const content = <AgentRowContent agent={agent} />;
  if (!projectSlugs) {
    return <article aria-label={`${agent.name}, ${agent.state}`}>{content}</article>;
  }
  return (
    <Link
      to={projectChatUrl(projectSlugs, agent.chatId)}
      aria-current={agent.focused ? 'page' : undefined}
      aria-label={`${agent.name}, ${agent.state}`}
      className='block rounded-xl outline-hidden focus-visible:ring-2 focus-visible:ring-ring'
    >
      {content}
    </Link>
  );
};

const AgentRowContent = ({ agent }: { readonly agent: AgentProjection }): React.JSX.Element => {
  const state = statePresentation[agent.state];
  const StateIcon = state.icon;
  return (
    <div
      data-agent-id={agent.chatId}
      data-state={agent.state}
      data-focused={agent.focused}
      className={cn(
        'relative overflow-hidden rounded-xl border border-border/70 bg-card px-3 py-2.5 transition-colors',
        'before:absolute before:inset-y-0 before:left-0 before:w-0.5',
        'hover:border-border hover:bg-accent/35',
        'data-[focused=true]:border-primary/35 data-[focused=true]:bg-primary/5',
        state.rail,
      )}
    >
      <div className='flex min-w-0 items-start gap-2.5'>
        <div className='relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border bg-background'>
          <Bot aria-hidden='true' className='size-4 text-muted-foreground' strokeWidth={1.6} />
          {agent.unread ? (
            <span
              aria-label='Unread activity'
              className='absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-card bg-primary'
            />
          ) : null}
        </div>
        <div className='min-w-0 flex-1'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <h3 className='min-w-0 flex-1 truncate text-sm font-medium text-foreground'>{agent.name}</h3>
            {agent.focused ? (
              <Badge variant='outline' className='h-5 border-primary/30 bg-primary/5 px-1.5 text-[10px] text-primary'>
                Focused
              </Badge>
            ) : null}
            <Badge role='status' variant='outline' className={cn('h-5 gap-1 px-1.5 text-[10px]', state.tone)}>
              <StateIcon aria-hidden='true' className={cn('size-2.5', state.iconClassName)} />
              {state.label}
            </Badge>
          </div>
          {agent.detail ? <p className='mt-0.5 truncate text-xs text-muted-foreground'>{agent.detail}</p> : null}
          <div className='mt-2 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground'>
            <span className='flex min-w-0 items-center gap-1' title={`${agent.model.name} · ${agent.model.provider}`}>
              <SvgIcon aria-hidden='true' id={agent.model.family} className='size-3 shrink-0 grayscale' />
              <span className='max-w-28 truncate'>{agent.model.name}</span>
              <span aria-hidden='true' className='text-border'>
                ·
              </span>
              <span className='max-w-20 truncate'>{agent.model.provider}</span>
            </span>
            <time
              dateTime={new Date(agent.lastActivityAt).toISOString()}
              title={new Date(agent.lastActivityAt).toLocaleString()}
              className='ml-auto flex shrink-0 items-center gap-1 font-mono'
            >
              <Clock3 aria-hidden='true' className='size-3' />
              {formatRelativeTime(agent.lastActivityAt, { short: true })}
            </time>
          </div>
          <div className='mt-1.5 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground'>
            <span className='flex min-w-0 items-center gap-1' title={`Workspace: ${agent.workspace}`}>
              <FolderGit2 aria-hidden='true' className='size-3 shrink-0' />
              <span className='max-w-28 truncate'>{agent.workspace}</span>
            </span>
            <span className='flex min-w-0 items-center gap-1 font-mono' title={`Branch: ${agent.branch}`}>
              <GitBranch aria-hidden='true' className='size-3 shrink-0' />
              <span className='max-w-32 truncate'>{agent.branch}</span>
            </span>
            {agent.pendingApprovalCount > 0 ? (
              <span className='ml-auto flex shrink-0 items-center gap-1 text-warning'>
                <ShieldAlert aria-hidden='true' className='size-3' />
                Approval
                {agent.pendingApprovalCount > 1 ? ` · ${agent.pendingApprovalCount}` : null}
              </span>
            ) : null}
            {agent.totalCost > 0 ? (
              <span className='ml-auto shrink-0 font-mono'>
                {formatCurrency(agent.totalCost, { significantFigures: 2 })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const AgentsLoading = (): ReactNode => (
  <div aria-label='Loading agents' className='flex flex-col gap-2' role='status'>
    {Array.from({ length: 3 }, (_, index) => (
      <div key={index} className='h-28 animate-pulse rounded-xl border bg-card motion-reduce:animate-none' />
    ))}
  </div>
);

/** Keeps relative timestamps honest while an otherwise-idle pane remains open. */
const useAgentsClock = (): number => {
  const [now, tick] = useReducer(() => Date.now(), performance.timeOrigin);
  useEffect(() => {
    const timer = setInterval(tick, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
};
