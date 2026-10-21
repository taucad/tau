import { useDesktopScheme } from '#hooks/use-desktop-scheme.js';
import { useFeature } from '#flags/use-feature.js';
import { MachinesDisabled } from '#components/machines/machines-disabled.js';
import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Printer } from 'lucide-react';
import type { MachineClient, MachineJob } from '@taucad/runtime/machine';
import { CopyButton } from '@taucad/ui/components/copy-button';
import { Button } from '@taucad/ui/components/button';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { PageHeader } from '#components/layout/page-header.js';
import { MachineWorkbench, ObservedPrintHeader } from '#components/machines/machine-workbench.js';
import { MachineProjectLink } from '#components/machines/machine-project-link.js';
import { useMachineDirectory, useMachinesFacet } from '#hooks/use-machines.js';
import { isOpenJob, useMachinesJobs } from '#hooks/use-machines-jobs.js';
import type { MachineApprovalBridge } from '#hooks/use-machines-approvals.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { isMachineRouteIdentity, machineDeepLink, machineUrl } from '#utils/machine-url.utils.js';

export const meta = (): Array<{ title: string }> => [{ title: 'Machine · Tau' }];
const projectGuidance = (
  <p className='text-xs text-muted-foreground'>
    Open a project’s Print pane to prepare a new job. Machine actions requested by an agent are reviewed in that
    project’s chat.{' '}
    <Link to='/projects' className='underline'>
      Open projects
    </Link>
  </p>
);
const globalApprovals: MachineApprovalBridge = {
  pendingForJob: () => undefined,
  pendingActions: () => [],
  respond: async () => {
    throw new Error('Open the source project to answer its chat request.');
  },
};
function ConnectedMachine({
  client,
  hostId,
  machineId,
}: {
  readonly client: MachineClient;
  readonly hostId: string;
  readonly machineId: string;
}): React.JSX.Element {
  const scheme = useDesktopScheme();
  const directory = useMachineDirectory(client);
  const entry =
    directory.snapshot?.cursor.hostId === hostId
      ? directory.snapshot.entries.find((candidate) => candidate.machineId === machineId)
      : undefined;
  const ledger = useMachinesJobs(client, entry?.machineId, hostId);
  const settings = useSettingsDialog();
  const navigate = useNavigate();
  const sourceLink = useCallback((job: MachineJob) => <MachineProjectLink job={job} hostId={hostId} />, [hostId]);
  const select = useCallback(
    (selected: string) => {
      void navigate(machineUrl({ hostId, machineId: selected }));
    },
    [hostId, navigate],
  );
  const openJob = ledger.jobs.find(isOpenJob);
  const header = useCallback(
    (stop: React.ReactNode) => (
      <ObservedPrintHeader client={client} selected={entry} openJob={openJob} select={select} stop={stop} />
    ),
    [client, entry, openJob, select],
  );
  const errors = useMemo(() => [directory.error, ledger.error], [directory.error, ledger.error]);
  return (
    <div className='container mx-auto flex h-full min-h-0 flex-col gap-3 px-4 pt-5 pb-4'>
      <div>
        <Link className='text-xs underline' to='/machines'>
          All machines
        </Link>
      </div>
      <PageHeader
        title={entry?.name ?? 'Machine'}
        action={
          <Button
            variant='outline'
            onClick={() => {
              settings.open('machines');
            }}
          >
            Manage connections
          </Button>
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <CopyButton
          size='sm'
          variant='outline'
          getText={() => machineDeepLink({ hostId, machineId }, scheme)}
          readyToCopyText='Copy machine link'
        />
        <a className='text-xs break-all underline select-text' href={machineDeepLink({ hostId, machineId }, scheme)}>
          {machineDeepLink({ hostId, machineId }, scheme)}
        </a>
      </div>
      {directory.error ? (
        <p role='alert' className='text-sm'>
          Machine updates are unavailable.{' '}
          <Button variant='outline' size='sm' onClick={directory.refresh}>
            Retry
          </Button>
        </p>
      ) : null}
      {directory.snapshot === undefined ? (
        <p role='status' aria-busy='true'>
          Loading machine…
        </p>
      ) : entry === undefined ? (
        <PanelEmptyState
          icon={Printer}
          title={
            directory.snapshot.cursor.hostId === hostId
              ? 'Machine is no longer connected'
              : 'This machine belongs to another host'
          }
          description='This link identifies a specific machine. Choose a connected machine or manage its connection.'
        >
          <Button asChild variant='outline'>
            <Link to='/machines'>View connected machines</Link>
          </Button>
        </PanelEmptyState>
      ) : (
        <div className='flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border'>
          <MachineWorkbench
            key={`${hostId}:${machineId}`}
            client={client}
            entry={entry}
            provider={directory.providers.find((provider) => provider.id === entry.providerId)}
            jobs={ledger.jobs}
            openJob={openJob}
            isJobWatchStalled={ledger.isStalled}
            bridge={globalApprovals}
            errors={errors}
            sourceLink={sourceLink}
            header={header}
            preparation={projectGuidance}
          />
        </div>
      )}
    </div>
  );
}
export default function MachineRoute(): React.JSX.Element {
  const scheme = useDesktopScheme();
  const { hostId = '', machineId = '' } = useParams();
  const machines = useMachinesFacet();
  const enabled = useFeature('machines');
  if (!enabled) {
    return <MachinesDisabled />;
  }
  if (!isMachineRouteIdentity(hostId) || !isMachineRouteIdentity(machineId)) {
    return (
      <div className='container mx-auto px-4 pt-5'>
        <PageHeader title='Invalid machine link' />
        <Link to='/machines'>View machines</Link>
      </div>
    );
  }
  return machines.available ? (
    <ConnectedMachine client={machines} hostId={hostId} machineId={machineId} />
  ) : (
    <div className='container mx-auto space-y-3 px-4 pt-5'>
      <PageHeader title='Machine' />
      <PanelEmptyState
        icon={Printer}
        title='Open this machine in Tau desktop'
        description='This browser cannot connect to the machine host.'
      >
        <Button asChild>
          <a href={machineDeepLink({ hostId, machineId }, scheme)}>Open Tau desktop</a>
        </Button>
      </PanelEmptyState>
    </div>
  );
}
