// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createActor, createMachine } from 'xstate';
import type { KernelIssue } from '@taucad/runtime';
import { selectCadFailureIssues, selectCadLoadingPhase } from '#machines/cad.machine.js';

const cad = vi.hoisted(() => ({
  issues: undefined as readonly KernelIssue[] | undefined,
  phase: undefined as 'connecting' | 'rendering' | undefined,
  send: vi.fn(),
}));
const projectRef = createActor(createMachine({})).start();
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectRef }) }));
vi.mock('#cloud/zoo-upgrade-banner.js', () => ({ ZooUpgradeBanner: () => null }));
vi.mock('#hooks/use-cad.js', () => ({
  useCad: () => ({ send: cad.send }),
  useCadSelector: (selector: unknown) =>
    selector === selectCadFailureIssues ? cad.issues : selector === selectCadLoadingPhase ? cad.phase : undefined,
}));

const { ChatViewerStatus } = await import('#routes/w.$workspace.$project/chat-viewer-status.js');

afterEach(() => {
  cad.issues = undefined;
  cad.phase = undefined;
  cad.send.mockClear();
  vi.unstubAllGlobals();
});

/*
 * PL7 staging verification 2026-11-21, row 5: the kernel's runtime worker could not load its code, and the viewer of
 * the shared model said only "Channel closed", with nothing to do. Once the unit has replaced the worker as often as
 * the page allows, only a new page can load that code: the status slot, which every viewer profile shows, offers Reload.
 */
describe('ChatViewerStatus after the runtime’s code did not load', () => {
  it('offers Reload, which reloads the page, and no retry in place', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...globalThis.location, reload });
    cad.issues = [
      {
        message: 'The runtime worker failed to load: Importing a module script failed.',
        code: 'RUNTIME',
        type: 'runtime',
        severity: 'error',
      },
    ];

    render(<ChatViewerStatus />);

    expect(screen.getByRole('region', { name: 'Model viewer unavailable' })).toHaveTextContent('Reload the page');
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
    expect(cad.send).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /try again/iu })).toBeNull();
  });

  it('shows the connecting phase while the unit replaces the worker', () => {
    cad.phase = 'connecting';

    render(<ChatViewerStatus />);

    expect(screen.getByRole('status')).toHaveTextContent('connecting');
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  it('offers nothing for a failure that is not a code load', () => {
    cad.issues = [{ message: 'Channel closed', code: 'RUNTIME', type: 'runtime', severity: 'error' }];

    render(<ChatViewerStatus />);

    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });
});
