// @vitest-environment jsdom
/**
 * The *Switch* pin outlives a reload, per project (R22).
 *
 * A reload starts the revision root again on the live checkout, so the
 * workbench's own re-root component (always mounted, unlike the Revisions pane)
 * must pin the remembered checkout again. A remount with a fresh projection is
 * the reload; `pinTo` is the verb the root re-roots on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { RevisionStatusProjection } from '@taucad/revisions';
import { WorkbenchCheckoutRoot } from '#routes/w.$workspace.$project/workbench-checkout-root.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

const project = { projectId: 'p' };
vi.mock('#hooks/use-project.js', () => ({ useProject: () => project }));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ fileManagerRef: { send: vi.fn() }, workspace: { syncProjectRoots: vi.fn() } }),
}));
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectRootConfigs: async () => ({ projects: [], roots: [] }),
  setCheckoutRootConfigs: () => false,
}));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

const mainRow = { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] };
const linkedRow = {
  name: 'bracket-fillet',
  head: undefined,
  checkoutId: 'co-2',
  checkoutRoot: '/checkouts/co-2',
  leaseChatIds: [],
};

/* What the root publishes after a reload: the live checkout, following chats, with these branches listed. */
const reloaded = (projectId: string, branches = [mainRow, linkedRow]): RevisionStatusProjection => ({
  ...revisionStatusHarness.status,
  projectId,
  checkoutId: 'live',
  liveCheckoutId: 'live',
  checkoutRoot: `/projects/${projectId}`,
  line: { kind: 'branch', name: 'main' },
  registrySettled: true,
  follow: 'chat',
  branches,
});

/* What `switch { branch: 'bracket-fillet' }` publishes: the workbench pinned at the branch's own checkout. */
const pinned = (projectId: string): RevisionStatusProjection => ({
  ...reloaded(projectId),
  checkoutId: 'co-2',
  checkoutRoot: '/checkouts/co-2',
  line: { kind: 'branch', name: 'bracket-fillet' },
  follow: 'pinned',
});

beforeEach(() => {
  revisionStatusHarness.reset();
  project.projectId = 'p';
  globalThis.localStorage.clear();
});

describe('the Switch pin across a reload (R22)', () => {
  it('pins the workbench again at the checkout it was switched to', () => {
    revisionStatusHarness.status = reloaded('p');
    const { rerender, unmount } = render(<WorkbenchCheckoutRoot />);
    revisionStatusHarness.status = pinned('p');
    rerender(<WorkbenchCheckoutRoot />);
    unmount();

    revisionStatusHarness.reset();
    revisionStatusHarness.status = reloaded('p');
    render(<WorkbenchCheckoutRoot />);

    expect(revisionStatusHarness.commands.pinTo).toHaveBeenCalledExactlyOnceWith('co-2');
  });

  it('waits for the registry before pinning', () => {
    globalThis.localStorage.setItem('tau:revisions-pin:p', 'co-2');
    revisionStatusHarness.status = { ...reloaded('p'), registrySettled: false };
    const { rerender } = render(<WorkbenchCheckoutRoot />);
    expect(revisionStatusHarness.commands.pinTo).not.toHaveBeenCalled();

    revisionStatusHarness.status = reloaded('p');
    rerender(<WorkbenchCheckoutRoot />);
    expect(revisionStatusHarness.commands.pinTo).toHaveBeenCalledExactlyOnceWith('co-2');
  });

  it('keeps each project its own pin', () => {
    revisionStatusHarness.status = pinned('p');
    const { unmount } = render(<WorkbenchCheckoutRoot />);
    unmount();

    project.projectId = 'q';
    revisionStatusHarness.status = reloaded('q');
    render(<WorkbenchCheckoutRoot />);

    expect(revisionStatusHarness.commands.pinTo).not.toHaveBeenCalled();
  });

  it('stays on the live checkout and forgets a pin whose checkout is gone', () => {
    globalThis.localStorage.setItem('tau:revisions-pin:p', 'co-2');
    revisionStatusHarness.status = reloaded('p', [mainRow]);

    render(<WorkbenchCheckoutRoot />);

    expect(revisionStatusHarness.commands.pinTo).not.toHaveBeenCalled();
    expect(globalThis.localStorage.getItem('tau:revisions-pin:p')).toBeNull();
  });

  it('forgets the pin once the workbench is back on the live checkout', () => {
    revisionStatusHarness.status = pinned('p');
    const { rerender, unmount } = render(<WorkbenchCheckoutRoot />);
    revisionStatusHarness.status = { ...reloaded('p'), follow: 'pinned' };
    rerender(<WorkbenchCheckoutRoot />);
    unmount();

    revisionStatusHarness.reset();
    revisionStatusHarness.status = reloaded('p');
    render(<WorkbenchCheckoutRoot />);

    expect(revisionStatusHarness.commands.pinTo).not.toHaveBeenCalled();
  });

  it('still follows the selection when storage refuses', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    revisionStatusHarness.status = pinned('p');

    expect(() => render(<WorkbenchCheckoutRoot />)).not.toThrow();
    expect(revisionStatusHarness.commands.pinTo).not.toHaveBeenCalled();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
