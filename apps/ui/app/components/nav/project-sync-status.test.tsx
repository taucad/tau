// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SyncFacet } from '@taucad/revisions';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { ProjectSyncStatus, projectSyncIndicator } from '#components/nav/project-sync-status.js';

const healthy: SyncFacet = {
  state: 'backedUp',
  pullPhase: 'idle',
  hasAppliedRemote: true,
  chats: 'ready',
  pendingCount: 0,
  online: true,
  conflictRef: undefined,
  error: undefined,
  reason: undefined,
};

describe('ProjectSyncStatus', () => {
  it('should remove healthy status entirely, including intentionally disabled chat sync', () => {
    expect(projectSyncIndicator(healthy, false)).toBeUndefined();
    expect(projectSyncIndicator({ ...healthy, chats: 'disabled' }, false)).toBeUndefined();
    expect(projectSyncIndicator(undefined, false)).toBeUndefined();
    const { rerender } = render(
      <TooltipProvider>
        <ProjectSyncStatus
          sync={{ ...healthy, pullPhase: 'fetching' }}
          isCloudPending={false}
          onOpenDetails={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Project sync: Downloading files…' })).toBeInTheDocument();
    rerender(
      <TooltipProvider>
        <ProjectSyncStatus sync={healthy} isCloudPending={false} onOpenDetails={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should distinguish inbound, outgoing and recovery work without a three-second timeout', () => {
    expect(projectSyncIndicator(healthy, true)?.label).toBe('Preparing files…');
    expect(projectSyncIndicator(undefined, true)?.label).toBe('Connecting to Tau Cloud…');
    expect(projectSyncIndicator({ ...healthy, pullPhase: 'fetching' }, false)?.label).toBe('Downloading files…');
    expect(projectSyncIndicator({ ...healthy, pullPhase: 'applying' }, false)?.label).toBe('Preparing files…');
    expect(projectSyncIndicator({ ...healthy, pullPhase: 'records', chats: 'loading' }, false)?.label).toBe(
      'Loading chats…',
    );
    expect(projectSyncIndicator({ ...healthy, state: 'pending' }, false)?.label).toBe('Backing up changes…');
    expect(projectSyncIndicator({ ...healthy, online: false }, false)?.kind).toBe('offline');
    expect(projectSyncIndicator({ ...healthy, state: 'conflicted' }, false)?.kind).toBe('attention');
    expect(projectSyncIndicator({ ...healthy, state: 'failed', reason: 'unauthorized' }, true)?.label).toBe(
      'Sign in to continue',
    );
    expect(projectSyncIndicator({ ...healthy, chats: 'failed' }, false)?.label).toBe('Chats need attention');
  });

  it('should expose details by keyboard and click with Escape returning focus', async () => {
    const user = userEvent.setup();
    const openDetails = vi.fn();
    render(
      <TooltipProvider delayDuration={0}>
        <ProjectSyncStatus
          sync={{ ...healthy, pullPhase: 'fetching' }}
          isCloudPending={false}
          onOpenDetails={openDetails}
        />
      </TooltipProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Project sync: Downloading files…' });
    await user.tab();
    expect(trigger).toHaveFocus();
    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Bringing this project to your device.');
    });
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: 'Project sync status' })).toHaveTextContent('Downloading files…');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Open Revisions' }));
    expect(openDetails).toHaveBeenCalledOnce();
  });
});
