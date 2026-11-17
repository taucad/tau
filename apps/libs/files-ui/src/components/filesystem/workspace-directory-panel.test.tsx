// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceDirectoryPanel } from '#components/filesystem/workspace-directory-panel.js';

describe('WorkspaceDirectoryPanel', () => {
  it('offers Disconnect only while a handle exists and Reconnect after it is removed', () => {
    const onConnect = vi.fn();
    const onDisconnect = vi.fn();
    const { rerender } = render(
      <WorkspaceDirectoryPanel
        variant='row'
        status='connected'
        workspaceName='Workshop'
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />,
    );

    expect(screen.getByRole('button', { name: 'Change folder' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect workspace' }));
    expect(onDisconnect).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceDirectoryPanel
        variant='row'
        status='disconnected'
        workspaceName='Workshop'
        onConnect={onConnect}
        onDisconnect={onDisconnect}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Disconnect workspace' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  /* Blueprint D2's table, row for row: the actions a folder row offers in each state. */
  it.each([
    ['connected', ['Disconnect workspace']],
    ['notFound', ['Locate…', 'Try again', 'Remove from Tau']],
    ['unreachable', ['Try again', 'Locate…', 'Remove from Tau']],
    ['permission', ['Grant access', 'Locate…', 'Remove from Tau']],
    ['conflict', ['Locate…', 'Remove from Tau']],
    ['error', ['Try again', 'Remove from Tau']],
    ['disconnected', ['Reconnect', 'Remove from Tau']],
  ] as const)('should offer the D2 actions on a %s row', (status, actions) => {
    /* `onConnect` is Reconnect on a disconnected row; on a connected row it would add the web's Change folder. */
    const callbacks = {
      ...(status === 'disconnected' ? { onConnect: vi.fn() } : {}),
      onGrantAccess: vi.fn(),
      onDisconnect: vi.fn(),
      onRetry: vi.fn(),
      onLocate: vi.fn(),
      onRemove: vi.fn(),
    };
    render(<WorkspaceDirectoryPanel variant='row' status={status} workspaceName='Workshop' {...callbacks} />);

    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent),
    ).toEqual(actions);
  });

  /* D2's row label for the root state `available` (T-REH.1 step 4 finds the working folder by it). */
  it('should label a connected row Connected', () => {
    render(
      <WorkspaceDirectoryPanel variant='row' status='connected' workspaceName='Workshop' onDisconnect={vi.fn()} />,
    );

    expect(screen.getByText('Connected', { exact: true })).toBeInTheDocument();
  });

  it('should not label a row Connected while its status is still being checked', () => {
    render(<WorkspaceDirectoryPanel variant='row' status='connected' workspaceName='Workshop' isChecking />);

    expect(screen.queryByText('Connected', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('should remove a disconnected row from Tau', () => {
    const onRemove = vi.fn();
    render(
      <WorkspaceDirectoryPanel
        variant='row'
        status='disconnected'
        workspaceName='Workshop'
        onConnect={vi.fn()}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove from Tau' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
