// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { ProjectPrintRouteIntent } from '#routes/w.$workspace.$project/project-print-route-intent.js';
const { openPanel, flag } = vi.hoisted(() => ({ openPanel: vi.fn(), flag: { enabled: true } }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => flag.enabled }));
beforeEach(() => {
  flag.enabled = true;
  openPanel.mockClear();
});
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));
function Location(): React.JSX.Element {
  return <output>{useLocation().search}</output>;
}
it('opens a closed Print pane and retains the exact machine/job intent', async () => {
  render(
    <MemoryRouter
      initialEntries={['/w/home/tray?workbench=print&machineHost=host&machine=mill&job=request&chat=chat-1']}
    >
      <ProjectPrintRouteIntent />
      <Location />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(openPanel).toHaveBeenCalledExactlyOnceWith('print');
  });
  expect(screen.getByRole('status')).toMatchTextContent('?machineHost=host&machine=mill&job=request&chat=chat-1');
});

it('does not reopen Print from a saved URL when machines are disabled', () => {
  flag.enabled = false;
  render(
    <MemoryRouter initialEntries={['/w/home/tray?workbench=print&machine=mill']}>
      <ProjectPrintRouteIntent />
    </MemoryRouter>,
  );
  expect(openPanel).not.toHaveBeenCalled();
});
