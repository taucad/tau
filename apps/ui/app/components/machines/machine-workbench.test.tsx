// @vitest-environment jsdom
import { useCallback, useMemo } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import type { MachineClient } from '@taucad/runtime/machine';
import {
  createBridge,
  createFixture,
  entry,
  agentJob,
  provider,
} from '#routes/w.$workspace.$project/chat-print.fixture.js';
import { useMachineDirectory } from '#hooks/use-machines.js';
import { useMachinesJobs } from '#hooks/use-machines-jobs.js';
import { useMachinesSelection } from '#hooks/use-machines-selection.js';
import { MachineWorkbench, ObservedPrintHeader } from '#components/machines/machine-workbench.js';
import { HistoryStage } from '#components/machines/machine-monitor.js';

const { bridge } = createBridge();
afterEach(cleanup);
const wrap = ({ children }: { readonly children: React.ReactNode }) => (
  <MemoryRouter>
    <TooltipProvider>{children}</TooltipProvider>
  </MemoryRouter>
);
function ObservedWorkbench({
  client,
  renderControls,
}: {
  readonly client: MachineClient;
  readonly renderControls: () => void;
}): React.JSX.Element | undefined {
  const directory = useMachineDirectory(client);
  const machine = directory.snapshot?.entries.find((entry) => entry.machineId === 'machine-0');
  const ledger = useMachinesJobs(client, machine?.machineId, directory.snapshot?.cursor.hostId);
  const select = useCallback(() => undefined, []);
  const header = useCallback(
    (stop: React.ReactNode) => (
      <ObservedPrintHeader client={client} selected={machine} openJob={undefined} select={select} stop={stop} />
    ),
    [client, machine, select],
  );
  const errors = useMemo(() => [directory.error, ledger.error], [directory.error, ledger.error]);
  const content = useCallback(() => {
    renderControls();
    return <p>Selected controls</p>;
  }, [renderControls]);
  return machine ? (
    <MachineWorkbench
      client={client}
      entry={machine}
      provider={provider}
      bridge={bridge}
      jobs={ledger.jobs}
      openJob={undefined}
      isJobWatchStalled={false}
      errors={errors}
      header={header}
    >
      {content}
    </MachineWorkbench>
  ) : undefined;
}

describe('global shared workbench acceptance', () => {
  it('mounts generic controls and history without project/chat providers or camera acquisition', async () => {
    const fixture = createFixture();
    const capture = vi.spyOn(fixture.client, 'captureStill');
    const machine = entry();
    render(
      <MachineWorkbench
        client={fixture.client}
        entry={machine}
        provider={provider}
        bridge={bridge}
        jobs={[]}
        openJob={undefined}
        isJobWatchStalled={false}
        errors={[]}
        header={(stop) => (
          <header>
            {machine.name}
            {stop}
          </header>
        )}
      />,
      { wrapper: wrap },
    );
    expect(screen.getByRole('region', { name: 'Monitor' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Control' })).toBeInTheDocument();
    expect(capture).not.toHaveBeenCalled();
    expect(fixture.requestJob).not.toHaveBeenCalled();
  });
  it.each([256, 1000])(
    'does not rerender selected controls for 50 unrelated updates in a %i-entry projection',
    async (count) => {
      const entries = Array.from({ length: count }, (_, index) =>
        entry({ machineId: `machine-${index}`, name: `Machine ${index}` }),
      );
      const fixture = createFixture({ entries });
      const renderControls = vi.fn();
      render(<ObservedWorkbench client={fixture.client} renderControls={renderControls} />, { wrapper: wrap });
      await screen.findByText('Selected controls');
      await act(async () => {
        await Promise.resolve();
      });
      const baseline = renderControls.mock.calls.length;
      await act(async () => {
        for (let index = 0; index < 50; index += 1) {
          fixture.observe({ ...entries[count - 1]!, name: `Updated ${index}` });
        }
      });
      expect(renderControls).toHaveBeenCalledTimes(baseline);
    },
  );
  it('qualifies persisted selection by host and does not carry the previous host selection', () => {
    const entries = [entry({ machineId: 'first' }), entry({ machineId: 'second' })];
    const view = renderHook(({ hostId }) => useMachinesSelection('project', entries, hostId), {
      initialProps: { hostId: 'host-a' },
    });
    act(() => {
      view.result.current.select('second');
    });
    expect(view.result.current.selected?.machineId).toBe('second');
    view.rerender({ hostId: 'host-b' });
    expect(view.result.current.selected?.machineId).toBe('first');
    view.rerender({ hostId: 'host-a' });
    expect(view.result.current.selected?.machineId).toBe('second');
  });
  it('reveals and focuses a linked terminal job with at most 20 provenance rows mounted', async () => {
    const jobs = Array.from({ length: 61 }, (_, index) => agentJob({ jobId: `job-${index}`, state: 'withdrawn' }));
    const provenance = vi.fn((job) => <a href={`/project?job=${job.jobId}`}>Source {job.jobId}</a>);
    render(<HistoryStage entry={entry()} jobs={jobs} sourceLink={provenance} selectedJobId='job-45' />, {
      wrapper: wrap,
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Linked job history')).toHaveFocus();
    });
    expect(screen.getAllByRole('link')).toHaveLength(20);
    expect(screen.getByText('Source job-45')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
