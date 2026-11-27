// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RootStatus } from '@taucad/filesystem';
import type { Workspace } from '@taucad/files-ui/filesystem/handle-store';
import { UnavailableFoldersNotice } from '#components/filesystem/unavailable-folders-notice.js';

const state = vi.hoisted(() => ({
  rootStatuses: [] as RootStatus[],
  listWorkspaces: vi.fn<() => Promise<Workspace[]>>(),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useOptionalFileManager: () => ({
    fileManagerRef: {
      getSnapshot: () => ({ status: 'active', matches: () => false, context: { rootStatuses: state.rootStatuses } }),
      subscribe: () => ({ unsubscribe: () => undefined }),
      send: vi.fn(),
    },
  }),
}));
vi.mock('@taucad/files-ui/filesystem/handle-store', () => ({
  listWorkspaces: state.listWorkspaces,
}));

const nodeWorkspace = (name: string): Workspace => ({
  workspaceId: `wsp_${name.toLowerCase()}`,
  name,
  slug: name.toLowerCase(),
  lastConnectedAt: 1,
  path: `/Users/tester/${name}`,
});
const scratch = nodeWorkspace('Scratch');
const archive = nodeWorkspace('Archive');
const lost = (workspace: Workspace): RootStatus => ({
  storageRootKey: `node:${workspace.path!}`,
  backend: 'node',
  state: 'notFound',
  code: 'ENOENT',
});
const available = (workspace: Workspace): RootStatus => ({
  storageRootKey: `node:${workspace.path!}`,
  backend: 'node',
  state: 'available',
});

/** Render the notice and let its workspace read settle. */
const renderSettled = async (): Promise<ReturnType<typeof render>> => {
  const calls = state.listWorkspaces.mock.calls.length;
  const view = render(
    <MemoryRouter>
      <UnavailableFoldersNotice />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(state.listWorkspaces.mock.calls.length).toBeGreaterThan(calls);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return view;
};

beforeEach(() => {
  localStorage.clear();
  state.listWorkspaces.mockResolvedValue([scratch, archive]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('UnavailableFoldersNotice', () => {
  it('should announce each newly lost folder once, across launches', async () => {
    state.rootStatuses = [lost(scratch), available(archive)];
    const first = await renderSettled();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Scratch can’t be found');
    expect(screen.getByRole('link', { name: 'Open Files' })).toHaveAttribute('href', '/files');
    first.unmount();

    const second = await renderSettled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    second.unmount();

    state.rootStatuses = [lost(scratch), lost(archive)];
    await renderSettled();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Archive can’t be found');
  });

  it('should announce a folder again after it came back and was lost once more', async () => {
    state.rootStatuses = [lost(scratch)];
    const lostView = await renderSettled();
    lostView.unmount();

    state.rootStatuses = [available(scratch)];
    const backView = await renderSettled();
    backView.unmount();

    state.rootStatuses = [lost(scratch)];
    await renderSettled();
    expect(screen.getByRole('status')).toHaveTextContent('Scratch can’t be found');
  });
});
