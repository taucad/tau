import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Bot, Check, Laptop, Plus, Server } from 'lucide-react';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Badge } from '@taucad/ui/components/badge';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import type { ChatAgentActivity } from '#hooks/active-chat-provider.js';
import { listPaseoConnections } from '#lib/paseo-connection-client.js';
import { provisionCloudHost } from '#lib/remote-host-client.js';
import { useProject } from '#hooks/use-project.js';
import { listPaseoAgentsOverSdk } from '#lib/paseo/paseo-client.js';
import { ENV } from '#environment.config.js';
import type { PaseoAgent, PaseoConnection } from '#lib/paseo-connection-client.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import { cn } from '@taucad/ui/utils/cn';
import { useAgentHostPlacements, useBrowserAgentHostProjectAvailability } from '#hooks/use-cad-agent-config.js';
import type { AgentHostPlacementTarget } from '#lib/agent-host-placement.js';
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
  /** Row subtitle: a workspace path for a Tau row, the credential note for an ACP one. */
  readonly note?: string;
  /** The note is a refusal, not a description — it reads as one. */
  readonly noteIsRefusal?: boolean;
  /**
   * Set on the row that has no host yet: selecting it provisions this project's
   * cloud host and places the turn on whatever device that call returns.
   */
  readonly provisionProjectId?: string;
};
type PaseoTarget = {
  readonly key: string;
  readonly kind: 'paseo';
  readonly connectionId: string;
  readonly connectionLabel: string;
  readonly agent: PaseoAgent;
};
type ExecutionTarget = TauTarget | TauHostTarget | PaseoTarget;

type ChatExecutionSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly children: (target: {
    readonly label: string;
    readonly kind: ExecutionTarget['kind'];
    readonly activity: ChatAgentActivity;
  }) => ReactNode;
  readonly onSelect?: () => void;
  readonly onClose?: () => void;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
  readonly isNested?: boolean;
};

/**
 * One Tau target. The browser agent host is *the* Tau placement — the
 * API-coordinated one was removed, not demoted — so there is nothing to choose
 * between. A project that cannot host the log says so on this row and refuses
 * the turn; it never silently runs somewhere else.
 */
const tauTarget: TauTarget = { key: 'tau', kind: 'tau', label: 'Tau' };
const targetKey = (connectionId: string, agentId: string): string =>
  `paseo:${encodeURIComponent(connectionId)}:${encodeURIComponent(agentId)}`;
const tauHostKey = (hostId: TauAgentHostId): string => `tau-host:${encodeURIComponent(hostId)}`;

/** The one name every cloud host wears; there is only ever one per project. */
const cloudHostLabel = 'Tau Cloud';

/**
 * A daemon's row label.
 *
 * `desktop` is the Electron services utility's in-process launcher: it is not
 * a *remote* host at all, so naming it after its machine would be a lie. A
 * cloud host is a machine the user has never seen and never will, so naming it
 * after one would be a lie too — it is *this project's* host, and says so.
 */
const tauHostLabel = (placement: AgentHostPlacementTarget): string =>
  placement.hostId === 'desktop'
    ? 'This computer'
    : placement.cloudProjectId
      ? cloudHostLabel
      : `Tau Host · ${placement.label}`;

const tauHostTarget = (placement: AgentHostPlacementTarget): TauHostTarget => ({
  key: tauHostKey(placement.hostId),
  kind: 'tau-host',
  label: tauHostLabel(placement),
  placement,
  ...(placement.cloudProjectId
    ? { note: 'Runs in Tau’s cloud — keeps working when you close the tab' }
    : placement.workspaceRoot === ''
      ? {}
      : { note: placement.workspaceRoot }),
});

/** The un-provisioned cloud row's key; the one row whose selection is async. */
const cloudPlacementKey = 'tau-host:cloud';

/**
 * The row for a project whose cloud host does not exist yet.
 *
 * It is offered to every signed-in owner, because provisioning is theirs to
 * choose; what is gated on a platform probe (PH8) is whether Tau ever reaches
 * for it *unasked*, which it does only for iOS-class limits and downlevel
 * fallback — never on Safari desktop.
 *
 * A refused provisioning replaces the row's description with the refusal: the
 * choice was made here, so this is where its outcome belongs.
 */
const cloudPlacementTarget = (projectId: string, refusal: string | undefined): TauHostTarget => ({
  key: cloudPlacementKey,
  kind: 'tau-host',
  label: cloudHostLabel,
  placement: { hostId: 'cloud', rung: 2, label: cloudHostLabel, workspaceRoot: '', online: true },
  note: refusal ?? 'Runs in Tau’s cloud — keeps working when you close the tab',
  ...(refusal === undefined ? {} : { noteIsRefusal: true }),
  provisionProjectId: projectId,
});

const acpAgentKey = (hostId: TauAgentHostId, agentId: string): string =>
  `acp:${encodeURIComponent(hostId)}:${encodeURIComponent(agentId)}`;

/** Product names for the registry agent ids a daemon advertises. */
const externalAgentNames: Readonly<Record<string, string>> = { claude: 'Claude Code', codex: 'Codex' };
const externalAgentName = (agentId: string): string => externalAgentNames[agentId] ?? agentId;

/**
 * One external-agent row.
 *
 * The copy is deliberate on both halves: **your local login** (the adapter
 * inherits the CLI's own credential — Tau never brokers a key, X6) and **an
 * isolated branch** (SP-4 proved ACP session modes are advisory, so confinement
 * is the materialized branch, and the UI must not promise per-action approval).
 */
const acpAgentTarget = (placement: AgentHostPlacementTarget, agentId: string): TauHostTarget => ({
  key: acpAgentKey(placement.hostId, agentId),
  kind: 'tau-host',
  label: `${externalAgentName(agentId)} · ${placement.hostId === 'desktop' ? 'This computer' : `Tau Host ${placement.label}`}`,
  placement,
  agentId,
  note: `Runs with your local ${externalAgentName(agentId)} login in an isolated branch`,
});

/** Launcher 2's own row — the one the desktop tier drives by label and test id. */
const isDesktopRow = (target: ExecutionTarget): target is TauHostTarget =>
  target.kind === 'tau-host' && target.placement.hostId === 'desktop' && target.agentId === undefined;

const placementTargets = (placement: AgentHostPlacementTarget): readonly TauHostTarget[] => [
  tauHostTarget(placement),
  ...(placement.externalAgents ?? []).map((agentId) => acpAgentTarget(placement, agentId)),
];

export const formatPaseoAgentStatus = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'idle': {
      return 'Ready';
    }
    case 'running': {
      return 'Working';
    }
    case 'initializing': {
      return 'Starting';
    }
    case 'error': {
      return 'Error';
    }
    case 'closed': {
      return 'Stopped';
    }
    default: {
      return 'Unavailable';
    }
  }
};

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

export const ChatExecutionSelector = memo(function ({
  children,
  onSelect,
  onClose,
  isNested,
  ...properties
}: ChatExecutionSelectorProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [connections, setConnections] = useState<PaseoConnection[]>([]);
  const [agents, setAgents] = useState<PaseoTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [provisionedCloudHostId, setProvisionedCloudHostId] = useState<string>();
  const [cloudRefusal, setCloudRefusal] = useState<string>();
  const {
    execution: { execution, setActiveExecution },
    model: { modelId, model },
    agentActivity,
  } = useChatComposer();
  const browserHost = useBrowserAgentHostProjectAvailability(model.provider.id);
  const { targets: hostPlacements } = useAgentHostPlacements();
  const { projectId } = useProject({ enableNoContext: true }) ?? {};
  /*
   * Whether any paired Tau Host is online to serve a Paseo agent's Tau tools.
   *
   * ponytail: presence, not pairing — nothing yet maps a Paseo connection to
   * the Tau Host on the *same* machine, and the topology that matters (one
   * laptop running both) has exactly one. Replace with a real pairing when a
   * user has two hosts and the wrong one gets picked.
   */
  const hasHostMcp = hostPlacements.some((placement) => placement.online);
  const tauNote =
    browserHost.status === 'unavailable'
      ? browserHost.reason
      : browserHost.status === 'available'
        ? browserHost.caveat
        : undefined;
  const hostTargets = useMemo(() => {
    const placed = hostPlacements.flatMap((placement) => placementTargets(placement));
    /* One cloud row per project, and only when this project has no cloud host
     * listed yet — a provisioned one is an ordinary rung-2 device that already
     * came through the ladder above. */
    const hasCloud = hostPlacements.some((placement) => placement.cloudProjectId === projectId);
    return projectId && !hasCloud ? [...placed, cloudPlacementTarget(projectId, cloudRefusal)] : placed;
  }, [cloudRefusal, hostPlacements, projectId]);

  useEffect(() => {
    // Resolve a durable Paseo selection eagerly after reload so the trigger
    // never falls back to the opaque "Paseo agent" placeholder. Tau remains
    // lazy because it has no remote display metadata to hydrate.
    if (!open && execution.kind !== 'paseo') {
      return;
    }
    /* An `AbortController` rather than a closed-over flag: TypeScript narrows a
     * `let` (or a literal's property) assigned only in the cleanup to `false`
     * inside this callback, so every staleness guard below read as dead code. */
    const discovery = new AbortController();
    /* Read through a call, not a property: an early `if (signal.aborted) return`
     * narrows the property to `false` for the rest of the function, and every
     * later staleness guard then reads as dead code the checker can drop. */
    const isStale = (): boolean => discovery.signal.aborted;
    const discover = async (): Promise<void> => {
      await Promise.resolve();
      if (isStale()) {
        return;
      }
      setLoading(true);
      setError(undefined);
      try {
        const nextConnections = await listPaseoConnections();
        /* Every paired connection is dialled: the directory no longer claims to
         * know which daemons are reachable, and the socket that finds out is
         * the one this page is about to open anyway. */
        const discovered = await Promise.all(
          nextConnections.map(async (connection) => {
            const nextAgents = await listPaseoAgentsOverSdk({
              apiBaseUrl: ENV.TAU_API_URL,
              connectionId: connection.id,
            });
            return nextAgents.map<PaseoTarget>((agent) => ({
              key: targetKey(connection.id, agent.id),
              kind: 'paseo',
              connectionId: connection.id,
              connectionLabel: connection.label,
              agent,
            }));
          }),
        );
        if (!isStale()) {
          setConnections(nextConnections);
          setAgents(discovered.flat());
        }
      } catch (error) {
        if (!isStale()) {
          setError(error instanceof Error ? error.message : 'Could not discover Paseo agents');
        }
      } finally {
        if (!isStale()) {
          setLoading(false);
        }
      }
    };
    // async-iife: bootstrap; the effect cleanup cancels stale discovery results.
    void discover();
    return () => {
      discovery.abort();
    };
  }, [execution.kind, open]);

  const selectedTarget = useMemo<ExecutionTarget>(() => {
    if (execution.kind === 'tau') {
      const { hostId } = execution;
      if (hostId === undefined) {
        return tauTarget;
      }
      // A persisted daemon selection must name itself before discovery answers,
      // exactly as a persisted Paseo agent does — otherwise the trigger reads
      // "Tau" for a turn that will not run in this browser at all.
      return (
        hostTargets.find((target) => target.agentId === undefined && target.placement.hostId === hostId) ??
        tauHostTarget({
          hostId,
          rung: hostId === 'origin' ? 1 : 2,
          label: hostId,
          workspaceRoot: '',
          online: false,
          /* A host provisioned seconds ago is not in the ladder's answer yet —
           * its container is still booting — and the trigger must not read
           * "Tau Host · agent_2f9…" in the meantime. */
          ...(hostId === provisionedCloudHostId && projectId ? { cloudProjectId: projectId } : {}),
        })
      );
    }
    if (execution.kind === 'acp') {
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
          agentId,
        )
      );
    }
    return (
      agents.find(
        (target) => target.connectionId === execution.connectionId && target.agent.id === execution.agentId,
      ) ?? {
        key: targetKey(execution.connectionId, execution.agentId),
        kind: 'paseo',
        connectionId: execution.connectionId,
        connectionLabel: connections.find((connection) => connection.id === execution.connectionId)?.label ?? 'Paseo',
        agent: { id: execution.agentId, label: 'Paseo agent', provider: 'Paseo', status: 'unknown' },
      }
    );
  }, [agents, connections, execution, hostTargets]);

  const groupedTargets = useMemo(
    () => [
      { name: 'Tau', items: [tauTarget, ...hostTargets] as ExecutionTarget[] },
      ...connections.map((connection) => ({
        name: connection.label,
        items: agents.filter((target) => target.connectionId === connection.id) as ExecutionTarget[],
      })),
    ],
    [agents, connections, hostTargets],
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
        if (!hostTarget.placement.online) {
          return;
        }
        const placeOn = (hostId: TauAgentHostId): void => {
          /* An external agent carries no Tau model and no revision mode: it runs
           * on its own subscription, always in a materialized branch. */
          setActiveExecution(
            hostTarget.agentId === undefined
              ? { ...withTauExecutionModel(execution, modelId), kind: 'tau', model: modelId, hostId }
              : { kind: 'acp', hostId, agentId: hostTarget.agentId },
          );
          onSelect?.();
        };
        const { provisionProjectId } = hostTarget;
        if (provisionProjectId !== undefined) {
          setCloudRefusal(undefined);
          setLoading(true);
          const provision = async (): Promise<void> => {
            try {
              /* Provisioning is idempotent per owner and project, so a second
               * click — or a reload mid-boot — lands on the same host rather
               * than a second container. */
              const { deviceId } = await provisionCloudHost(provisionProjectId);
              setProvisionedCloudHostId(deviceId);
              placeOn(deviceId);
              /* This row alone keeps the list open across its await (see
               * `shouldCloseOnSelect`), so it is the one that has to close
               * itself once the placement is made. */
              setOpen(false);
            } catch (error) {
              setCloudRefusal(error instanceof Error ? error.message : 'Could not start a Tau Cloud host');
            } finally {
              setLoading(false);
            }
          };
          // async-iife: bootstrap -- a click handler cannot await; failures land on the row's note.
          void provision();
          return;
        }
        placeOn(hostTarget.placement.hostId);
        return;
      }
      const target = agents.find((entry) => entry.key === key);
      if (!target) {
        return;
      }
      setActiveExecution({ kind: 'paseo', connectionId: target.connectionId, agentId: target.agent.id });
      onSelect?.();
    },
    [agents, execution, hostTargets, modelId, onSelect, setActiveExecution],
  );

  const selectedLabel = selectedTarget.kind === 'paseo' ? selectedTarget.agent.label : selectedTarget.label;

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
        if (target.kind === 'tau-host') {
          return [target.label, target.placement.label, target.placement.workspaceRoot, target.agentId ?? ''];
        }
        return [
          target.agent.label,
          target.agent.provider,
          target.connectionLabel,
          formatPaseoAgentStatus(target.agent.status),
        ];
      }}
      value={selectedTarget}
      title='Select an agent'
      description='Choose Tau in this browser, a Tau Host workspace, or an agent discovered through a paired Paseo daemon.'
      searchPlaceHolder='Search agents...'
      emptyListMessage={error ?? 'No agents discovered.'}
      isLoadingMore={loading}
      isNested={isNested}
      isOpen={open}
      onOpenChange={setOpen}
      onClose={onClose}
      onSelect={selectTarget}
      /* Every other row places its turn synchronously. Provisioning a cloud
       * host is a round trip that can be refused, and closing the list on the
       * click threw the refusal away — the live G5 leg saw a 500 and a page
       * that showed nothing at all. The row stays put until it has an answer;
       * the success path closes the list itself. */
      shouldCloseOnSelect={(key) => key !== cloudPlacementKey}
      renderLabel={(target, selected) => (
        <span
          className={cn(
            'flex w-full min-w-0 items-center justify-between gap-2',
            target.kind === 'tau-host' && !target.placement.online ? 'opacity-60' : undefined,
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
            {target.kind === 'tau' ? (
              <Bot className='size-4 shrink-0' />
            ) : target.kind === 'tau-host' ? (
              <Server className='size-4 shrink-0' />
            ) : (
              <Laptop className='size-4 shrink-0' />
            )}
            <span className='min-w-0'>
              <span className='block truncate'>{target.kind === 'paseo' ? target.agent.label : target.label}</span>
              {target.kind === 'paseo' ? (
                <span className='block truncate text-xs text-muted-foreground'>
                  {hasHostMcp
                    ? target.agent.provider
                    : `${target.agent.provider} · no Tau tools — pair a Tau Host on that machine`}
                </span>
              ) : target.kind === 'tau-host' ? (
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
            {target.kind === 'paseo' ? (
              <Badge variant='outline'>{formatPaseoAgentStatus(target.agent.status)}</Badge>
            ) : null}
            {target.kind === 'tau-host' && !target.placement.online ? <Badge variant='outline'>Offline</Badge> : null}
            {selected?.key === target.key ? <Check className='size-4' /> : null}
          </span>
        </span>
      )}
      footer={
        <>
          <div className='border-t' />
          <div className='p-1'>
            <button
              type='button'
              className={cn(menuItemVariants({ highlight: 'selected' }), 'h-auto w-full')}
              onClick={() => {
                openSettingsDialog('connections');
              }}
            >
              <Plus /> Pair or manage Paseo
            </button>
          </div>
        </>
      }
    >
      {children({ label: selectedLabel, kind: selectedTarget.kind, activity: agentActivity })}
    </ComboBoxResponsive>
  );
});
