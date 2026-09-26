import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Bot, Check, Server } from 'lucide-react';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Badge } from '@taucad/ui/components/badge';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import type { ChatAgentActivity } from '#hooks/active-chat-provider.js';
import { isDesktopTarget } from '#lib/build-target.js';
import { cn } from '@taucad/ui/utils/cn';
import { useAgentHostPlacements, useBrowserAgentHostProjectAvailability } from '#hooks/use-cad-agent-config.js';
import type { AgentHostPlacementTarget } from '#lib/agent-host-placement.js';
import { externalAgentRefusalReasons } from '#lib/external-agent.js';
import type { ExternalAgentDescriptor } from '@taucad/agent-host';
import { withTauExecutionModel } from '#utils/chat-execution.js';
import type { TauAgentHostId } from '@taucad/chat';

type TauTarget = {
  readonly key: 'tau';
  readonly kind: 'tau';
  readonly label: string;
};
type TauHostTarget = {
  readonly key: string;
  readonly kind: 'tau-host';
  readonly label: string;
  readonly placement: AgentHostPlacementTarget;
  /** Set on an external-agent row: the ACP agent this host would start. */
  readonly agentId?: string;
  /** Set on an external-agent row the host cannot start; the row is listed, not selectable. */
  readonly agent?: ExternalAgentDescriptor;
  /** Row subtitle: a workspace path for a Tau row, the credential note for an ACP one. */
  readonly note?: string;
  /** The note is a refusal, not a description — it reads as one. */
  readonly noteIsRefusal?: boolean;
};
type ExecutionTarget = TauTarget | TauHostTarget;

type ChatExecutionSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly children: (target: {
    readonly label: string;
    readonly kind: ExecutionTarget['kind'];
    readonly activity: ChatAgentActivity;
  }) => ReactNode;
  readonly onSelect?: () => void;
  readonly onClose?: () => void;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
};

/**
 * One Tau target. The browser agent host is *the* Tau placement — the
 * API-coordinated one was removed, not demoted — so there is nothing to choose
 * between. A project that cannot host the log says so on this row and refuses
 * the turn; it never silently runs somewhere else.
 */
const tauTarget: TauTarget = { key: 'tau', kind: 'tau', label: 'Tau' };
const tauHostKey = (hostId: TauAgentHostId): string => `tau-host:${encodeURIComponent(hostId)}`;

/**
 * A daemon's row label.
 *
 * `desktop` is the Electron services utility's in-process launcher: it is not
 * a *remote* host at all, and it *is* the Tau agent on this machine, so it
 * wears the plain name (Q12.3). A remote daemon keeps the one thing that tells
 * two of them apart.
 */
const tauHostLabel = (placement: AgentHostPlacementTarget): string =>
  placement.hostId === 'desktop' ? 'Tau' : `Tau Host · ${placement.label}`;

const tauHostTarget = (placement: AgentHostPlacementTarget): TauHostTarget => ({
  key: tauHostKey(placement.hostId),
  kind: 'tau-host',
  label: tauHostLabel(placement),
  placement,
  ...(placement.workspaceRoot === '' ? {} : { note: placement.workspaceRoot }),
});

const acpAgentKey = (hostId: TauAgentHostId, agentId: string): string =>
  `acp:${encodeURIComponent(hostId)}:${encodeURIComponent(agentId)}`;

/**
 * One external-agent row.
 *
 * The name is the descriptor's own `displayName` (V14): the host that resolved
 * the adapter is the only thing that knows what the agent is called, so there
 * is no name map here — nor in the approval banner, which reads the same
 * descriptor through `externalAgentDisplayName`.
 *
 * A **refused** agent still gets a row, carrying its code (V9): a user who
 * installed Codex and sees nothing cannot tell a missing feature from a stale
 * CLI. It is listed and not selectable, exactly as an offline host is.
 *
 * The copy is deliberate on both halves: **your local login** (the adapter
 * inherits the CLI's own credential — Tau never brokers a key, X6) and **this
 * project's tree** (V2: the agent works where the chat's revision mode says,
 * the host records the revision, and the UI must not promise per-action
 * approval — SP-4 proved ACP session modes are advisory).
 */
const acpAgentTarget = (placement: AgentHostPlacementTarget, agent: ExternalAgentDescriptor): TauHostTarget => ({
  key: acpAgentKey(placement.hostId, agent.id),
  kind: 'tau-host',
  label: agent.displayName,
  placement,
  agentId: agent.id,
  agent,
  note:
    agent.refusal === undefined
      ? `Runs with your local ${agent.displayName} login in this project's tree`
      : `${externalAgentRefusalReasons[agent.refusal]} (${agent.refusal})`,
  ...(agent.refusal === undefined ? {} : { noteIsRefusal: true }),
});

/** A descriptor for an agent no host has described yet, so a persisted selection still names itself. */
const unknownAgent = (agentId: string): ExternalAgentDescriptor => ({ id: agentId, displayName: agentId, models: [] });

/** Launcher 2's own row — the one the desktop tier drives by label and test id. */
const isDesktopRow = (target: ExecutionTarget): target is TauHostTarget =>
  target.kind === 'tau-host' && target.placement.hostId === 'desktop' && target.agentId === undefined;

const placementTargets = (placement: AgentHostPlacementTarget): readonly TauHostTarget[] => [
  tauHostTarget(placement),
  ...(placement.externalAgents ?? []).map((agent) => acpAgentTarget(placement, agent)),
];

export const formatChatAgentActivity = (activity: ChatAgentActivity): string => {
  switch (activity) {
    case 'working': {
      return 'Working';
    }
    case 'approval-required': {
      return 'Approval needed';
    }
    case 'stopping': {
      return 'Stopping';
    }
    case 'ready': {
      return 'Ready';
    }
  }
};

/**
 * The rows this chat can be placed on, and the one it is placed on now.
 *
 * @returns Every offered target and the selected one.
 */
const useExecutionTargets = (): {
  readonly hostTargets: readonly TauHostTarget[];
  readonly selectedTarget: ExecutionTarget;
} => {
  const {
    execution: { execution },
  } = useChatComposer();
  const { targets: hostPlacements } = useAgentHostPlacements();
  const hostTargets = useMemo(
    () => hostPlacements.flatMap((placement) => placementTargets(placement)),
    [hostPlacements],
  );

  const selectedTarget = useMemo<ExecutionTarget>(() => {
    if (execution.kind === 'tau') {
      const { hostId } = execution;
      if (hostId === undefined) {
        return tauTarget;
      }
      // A persisted daemon selection must name itself before the ladder
      // answers — otherwise the trigger reads "Tau" for a turn that will not
      // run in this browser at all.
      return (
        hostTargets.find((target) => target.agentId === undefined && target.placement.hostId === hostId) ??
        tauHostTarget({
          hostId,
          rung: hostId === 'origin' ? 1 : 2,
          label: hostId,
          workspaceRoot: '',
          online: false,
        })
      );
    }
    const { agentId, hostId } = execution;
    return (
      hostTargets.find((target) => target.agentId === agentId && target.placement.hostId === hostId) ??
      acpAgentTarget(
        {
          hostId,
          rung: hostId === 'desktop' ? 'in-process' : hostId === 'origin' ? 1 : 2,
          label: hostId,
          workspaceRoot: '',
          online: false,
        },
        unknownAgent(agentId),
      )
    );
  }, [execution, hostTargets]);

  return { hostTargets, selectedTarget };
};

/**
 * Whether the composer offers the agent control, and what it is set to.
 *
 * One agent is not a choice, and the bottom row has no width to spend on a
 * control that cannot change anything (Q12.6). The label is the same one the
 * trigger wears, so the tooltip can name the selected agent.
 *
 * @returns Whether to render the control, and the selected agent's name.
 * @public
 */
export const useChatAgentSelection = (): { readonly isOffered: boolean; readonly label: string } => {
  const { hostTargets, selectedTarget } = useExecutionTargets();
  return {
    isOffered: hostTargets.length + (isDesktopTarget() ? 0 : 1) > 1,
    label: selectedTarget.label,
  };
};

export const ChatExecutionSelector = memo(function ({
  children,
  onSelect,
  onClose,
  ...properties
}: ChatExecutionSelectorProps): React.JSX.Element {
  const {
    execution: { execution, setActiveExecution },
    model: { modelId, model },
    agentActivity,
  } = useChatComposer();
  const browserHost = useBrowserAgentHostProjectAvailability(model.provider.id);
  const { hostTargets, selectedTarget } = useExecutionTargets();
  const tauNote =
    browserHost.status === 'unavailable'
      ? browserHost.reason
      : browserHost.status === 'available'
        ? browserHost.caveat
        : undefined;

  const groupedTargets = useMemo(
    () => [
      /* D18: the desktop build never constructs the browser worker, so it never offers the row. */
      { name: 'Agents', items: [...(isDesktopTarget() ? [] : [tauTarget]), ...hostTargets] as ExecutionTarget[] },
    ],
    [hostTargets],
  );

  const selectTarget = useCallback(
    (key: string) => {
      if (key === tauTarget.key) {
        // Dropping `hostId` is what returns a chat to this browser's own host.
        const { hostId: _hostId, ...browserExecution } = withTauExecutionModel(execution, modelId) as {
          readonly hostId?: unknown;
        };
        setActiveExecution(browserExecution as typeof execution);
        onSelect?.();
        return;
      }
      const hostTarget = hostTargets.find((entry) => entry.key === key);
      if (hostTarget) {
        // An offline daemon is listed so the user can see *why* it is not an
        // option; selecting it would place a turn nothing can admit.
        /* Listed so the user can see *why* it is not an option; selecting a
         * refused agent would place a turn its host has already said it cannot
         * start. */
        if (!hostTarget.placement.online || hostTarget.agent?.refusal !== undefined) {
          return;
        }
        const placeOn = (hostId: TauAgentHostId): void => {
          /* An external agent carries no *Tau* model: it runs on its own
           * subscription, in its own model namespace (VI3), so the row is
           * seeded with the model the host probed as that agent's current one
           * and the picker beside it writes any other. `withTauExecutionModel`
           * is never reached from here — it would convert the row back to Tau. */
          setActiveExecution(
            hostTarget.agentId === undefined
              ? { ...withTauExecutionModel(execution, modelId), kind: 'tau', model: modelId, hostId }
              : {
                  kind: 'acp',
                  hostId,
                  agentId: hostTarget.agentId,
                  ...(hostTarget.agent?.defaultModel === undefined ? {} : { model: hostTarget.agent.defaultModel }),
                },
          );
          onSelect?.();
        };
        placeOn(hostTarget.placement.hostId);
      }
    },
    [execution, hostTargets, modelId, onSelect, setActiveExecution],
  );

  const selectedLabel = selectedTarget.label;

  return (
    <ComboBoxResponsive
      {...properties}
      className="data-[slot='popover-content']:w-[320px]"
      popoverProperties={properties.popoverProperties}
      groupedItems={groupedTargets}
      getValue={(target) => target.key}
      getKeywords={(target) => {
        if (target.kind === 'tau') {
          return [target.label];
        }
        return [target.label, target.placement.label, target.placement.workspaceRoot, target.agentId ?? ''];
      }}
      value={selectedTarget}
      title='Select an agent'
      description='Choose Tau in this browser, or a Tau Host workspace.'
      searchPlaceHolder='Search agents...'
      emptyListMessage='No agents discovered.'
      onClose={onClose}
      onSelect={selectTarget}
      renderLabel={(target, selected) => (
        <span
          className={cn(
            'flex w-full min-w-0 items-center justify-between gap-2',
            target.kind === 'tau-host' && (!target.placement.online || target.agent?.refusal !== undefined)
              ? 'opacity-60'
              : undefined,
          )}
          data-slot={target.kind === 'tau-host' ? 'chat-execution-tau-host' : undefined}
          /* Launcher 2's stable hooks, and *only* launcher 2's: an `aria-label`
           * on every row would rename every option — an option's accessible name
           * is computed from its subtree — so it is scoped to the one row the
           * desktop tier drives (`apps/desktop-e2e`). */
          data-testid={isDesktopRow(target) ? 'chat-execution-desktop-row' : undefined}
          aria-label={isDesktopRow(target) ? `Select agent: ${target.label}` : undefined}
        >
          <span className='flex min-w-0 items-center gap-2'>
            {target.kind === 'tau' ? <Bot className='size-4 shrink-0' /> : <Server className='size-4 shrink-0' />}
            <span className='min-w-0'>
              <span className='block truncate'>{target.label}</span>
              {target.kind === 'tau-host' ? (
                target.note ? (
                  <span
                    data-slot='chat-execution-tau-host-workspace'
                    className={cn(
                      'block truncate text-xs',
                      target.noteIsRefusal ? 'text-destructive' : 'text-muted-foreground',
                    )}
                    title={target.note}
                  >
                    {target.note}
                  </span>
                ) : null
              ) : tauNote ? (
                <span
                  data-slot='chat-execution-tau-note'
                  className='block truncate text-xs text-muted-foreground'
                  title={tauNote}
                >
                  {tauNote}
                </span>
              ) : null}
            </span>
          </span>
          <span className='flex shrink-0 items-center gap-2'>
            {target.kind === 'tau-host' && !target.placement.online ? <Badge variant='outline'>Offline</Badge> : null}
            {selected?.key === target.key ? <Check className='size-4' /> : null}
          </span>
        </span>
      )}
    >
      {children({ label: selectedLabel, kind: selectedTarget.kind, activity: agentActivity })}
    </ComboBoxResponsive>
  );
});
