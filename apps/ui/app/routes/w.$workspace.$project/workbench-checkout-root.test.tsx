// @vitest-environment jsdom
/**
 * *Switch* re-roots the workbench without a reload (S27, A1, A2).
 *
 * The assertion is the file services' own root: every pane reads the file
 * manager's rooted services, so "the workbench moved" is exactly "the file
 * manager was told to serve the other checkout's route".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { WorkbenchCheckoutRoot } from '#routes/w.$workspace.$project/workbench-checkout-root.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

const send = vi.fn();
const pendingSyncs: Array<() => void> = [];
const releaseSyncs = (): void => {
  for (const resolve of pendingSyncs.splice(0)) {
    resolve();
  }
};
const syncProjectRoots = vi.fn(async () => {
  /* Held open so the ordering is observable: whatever `setRoot` does while the
   * configuration is still installing is what a person would see. */
  await new Promise<void>((resolve) => {
    pendingSyncs.push(resolve);
  });
});

const setCheckoutRootConfigs = vi.fn((_routes: unknown) => false);
const getProjectRootConfigs = vi.fn(async () => ({
  projects: [{ projectId: 'p', backend: 'opfs', providerBasePath: 'p' }],
  roots: [{ backend: 'opfs' }],
}));
vi.mock('#filesystem/handle-store.js', () => ({
  getProjectRootConfigs: async () => getProjectRootConfigs(),
  setCheckoutRootConfigs: (routes: unknown) => setCheckoutRootConfigs(routes),
}));

vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'p' }) }));
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({ fileManagerRef: { send }, workspace: { syncProjectRoots } }),
}));
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

beforeEach(() => {
  revisionStatusHarness.reset();
  send.mockClear();
  syncProjectRoots.mockClear();
  pendingSyncs.length = 0;
  setCheckoutRootConfigs.mockClear();
  /* The store answers `false` for a set it already holds, so the common frame
   * re-issues nothing; a test that changes the set says so. */
  setCheckoutRootConfigs.mockReturnValue(false);
});

describe('WorkbenchCheckoutRoot', () => {
  it('serves the project directory while the workbench is on the live checkout', () => {
    render(<WorkbenchCheckoutRoot />);

    expect(send).toHaveBeenCalledWith({ type: 'setRoot', path: '/projects/p', projectId: 'p' });
  });

  it('re-roots at the linked checkout the switch selected, once its route is installed', async () => {
    const { rerender } = render(<WorkbenchCheckoutRoot />);
    send.mockClear();
    setCheckoutRootConfigs.mockReturnValue(true);

    /* What `switch { branch }` does inside the root: the selection moves to the
     * branch's own checkout, and the projection reports its route. */
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      checkoutId: 'co-2',
      checkoutRoot: '/checkouts/co-2',
      branch: 'bracket-fillet',
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: 'bracket-fillet',
          head: undefined,
          checkoutId: 'co-2',
          checkoutRoot: '/checkouts/co-2',
          leaseChatIds: [],
        },
      ],
    };
    rerender(<WorkbenchCheckoutRoot />);

    /* The route first: a `setRoot` at a prefix no configuration installed would
     * answer ESTALE from every rooted view (W2 review R4). The re-issue is held
     * open, so an implementation that moved first would already have sent. */
    await waitFor(() => {
      expect(syncProjectRoots).toHaveBeenCalledTimes(1);
    });
    expect(setCheckoutRootConfigs).toHaveBeenCalledWith([
      { projectId: 'p', backend: 'opfs', providerBasePath: '.tau/checkouts/p/co-2', checkoutId: 'co-2' },
    ]);
    expect(send).not.toHaveBeenCalled();

    releaseSyncs();
    await waitFor(() => {
      expect(send).toHaveBeenCalledWith({ type: 'setRoot', path: '/checkouts/co-2', projectId: 'p' });
    });
  });

  it('lets the newest selection win when two switches land together', async () => {
    const { rerender } = render(<WorkbenchCheckoutRoot />);
    send.mockClear();
    setCheckoutRootConfigs.mockReturnValue(true);

    const withRoot = (checkoutId: string) => ({
      ...revisionStatusHarness.status,
      checkoutId,
      checkoutRoot: `/checkouts/${checkoutId}`,
      branches: [
        { name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] },
        {
          name: checkoutId,
          head: undefined,
          checkoutId,
          checkoutRoot: `/checkouts/${checkoutId}`,
          leaseChatIds: [],
        },
      ],
    });

    revisionStatusHarness.status = withRoot('co-2');
    rerender(<WorkbenchCheckoutRoot />);
    await waitFor(() => {
      expect(syncProjectRoots).toHaveBeenCalledTimes(1);
    });
    revisionStatusHarness.status = withRoot('co-3');
    rerender(<WorkbenchCheckoutRoot />);
    await waitFor(() => {
      expect(syncProjectRoots).toHaveBeenCalledTimes(2);
    });
    releaseSyncs();

    await waitFor(() => {
      expect(send).toHaveBeenCalledWith({ type: 'setRoot', path: '/checkouts/co-3', projectId: 'p' });
    });
    /* The superseded effect is cancelled rather than raced: its own `setRoot`
     * would land last and re-root the workbench at the branch a person just
     * left. */
    expect(send).not.toHaveBeenCalledWith({ type: 'setRoot', path: '/checkouts/co-2', projectId: 'p' });
  });

  it('takes the route back when the branch that owned it is gone', async () => {
    setCheckoutRootConfigs.mockReturnValue(true);
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      branches: [{ name: 'main', head: undefined, checkoutId: 'live', checkoutRoot: '/projects/p', leaseChatIds: [] }],
    };

    render(<WorkbenchCheckoutRoot />);

    await waitFor(() => {
      expect(setCheckoutRootConfigs).toHaveBeenCalledWith([]);
    });
    expect(syncProjectRoots).toHaveBeenCalledTimes(1);
  });

  it('sends nothing before the root has answered', () => {
    revisionStatusHarness.status = { ...revisionStatusHarness.status, checkoutRoot: undefined };

    render(<WorkbenchCheckoutRoot />);

    expect(send).not.toHaveBeenCalled();
  });
});
