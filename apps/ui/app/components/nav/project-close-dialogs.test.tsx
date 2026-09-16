/**
 * The budget dialog is the only place the live-project budget is visible
 * (I28, R5/R7).
 *
 * The registry refuses the ninth open and names the candidates; this suite
 * pins that its words reach a screen — the canvas sentence, the verb on each
 * candidate — and that picking one sends exactly one event, because the
 * registry remembers the refused open and resumes it itself (R8).
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type * as SidebarStatusModule from '#hooks/use-sidebar-status.js';

/* The real dialog is Radix; what these pins are about is the copy and the
 * events, so the mock keeps `onOpenChange` reachable from *Not now* the way
 * `AlertDialogCancel` makes it reachable in the real one. */
const dialogState = vi.hoisted(() => ({ onOpenChange: undefined as ((next: boolean) => void) | undefined }));
vi.mock('@taucad/ui/components/alert-dialog', () => ({
  AlertDialog: ({ children, ...properties }: { readonly children: ReactNode } & Record<string, unknown>) => {
    dialogState.onOpenChange = properties['onOpenChange'] as (next: boolean) => void;
    return <div role='dialog'>{children}</div>;
  },
  AlertDialogContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { readonly children: ReactNode }) => <h3>{children}</h3>,
  AlertDialogDescription: ({ children }: { readonly children: ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { readonly children: ReactNode }) => (
    <button
      type='button'
      onClick={() => {
        dialogState.onOpenChange?.(false);
      }}
    >
      {children}
    </button>
  ),
  AlertDialogAction: ({ children }: { readonly children: ReactNode }) => <button type='button'>{children}</button>,
}));

const projects = [
  { id: 'proj_one', name: 'Bracket v2' },
  { id: 'proj_two', name: 'Quadcopter' },
  { id: 'proj_three', name: 'Gearbox' },
];
vi.mock('#hooks/use-projects.js', () => ({ useProjects: () => ({ projects }) }));

const mockSend = vi.fn();
const listeners: Array<(event: { projectId: string; suggestions: readonly string[] }) => void> = [];
vi.mock('#hooks/use-sessions.js', () => ({
  useSessions: () => ({
    send: mockSend,
    on: (_type: string, listener: (event: { projectId: string; suggestions: readonly string[] }) => void) => {
      listeners.push(listener);
      return { unsubscribe: () => undefined };
    },
  }),
  useLiveProjectIds: () => ['proj_one', 'proj_two'],
}));

const mockCloseProject = vi.fn();
const mockOpenProject = vi.fn();
vi.mock('#hooks/use-sidebar-status.js', async (importOriginal) => {
  const original = await importOriginal<typeof SidebarStatusModule>();
  return {
    ...original,
    useProjectSidebarRow: (projectId: string) => ({
      projectId,
      glyph: 'busy',
      attention: projectId === 'proj_one' ? 1 : 0,
      runs: projectId === 'proj_one' ? 1 : 2,
      dirty: false,
      pending: 0,
    }),
    useSidebarCommands: () => ({ closeProject: mockCloseProject, openProject: mockOpenProject }),
  };
});

const { BudgetRefusedDialog } = await import('#components/nav/project-close-dialogs.js');

/** Mount the listener-only dialog and let the registry refuse an open. */
const refuse = (suggestions: readonly string[] = ['proj_one', 'proj_two']): void => {
  render(<BudgetRefusedDialog />);
  act(() => {
    for (const listener of listeners) {
      listener({ projectId: 'proj_three', suggestions });
    }
  });
};

describe('BudgetRefusedDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listeners.length = 0;
  });

  it('says nothing until the registry refuses an open', () => {
    render(<BudgetRefusedDialog />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('writes the canvas sentence and offers each candidate by name, with what it is doing', () => {
    refuse();

    expect(screen.getByRole('heading', { name: 'Close a project to open Gearbox' })).toBeInTheDocument();
    expect(screen.getByText('2 projects are live and none is idle. Pick one to close:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Bracket v2 and open needs you' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Quadcopter and open 2 agents' })).toBeInTheDocument();
  });

  it('sends one close for the project the person picks, and nothing else (R8)', () => {
    refuse();

    fireEvent.click(screen.getByRole('button', { name: 'Close Quadcopter and open 2 agents' }));

    expect(mockCloseProject).toHaveBeenCalledExactlyOnceWith('proj_two');
    /* The registry resumes the refused open itself, so a second `open` here
     * would find the victim still live and close it twice (R8). */
    expect(mockOpenProject).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('forgets the refused open on Not now, so a later close opens nothing', () => {
    refuse();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(mockSend).toHaveBeenCalledExactlyOnceWith({ type: 'cancelPendingOpen' });
    expect(mockCloseProject).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
