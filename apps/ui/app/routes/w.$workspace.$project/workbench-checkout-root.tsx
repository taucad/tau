import { useEffect } from 'react';
import type { CheckoutRootConfig } from '@taucad/filesystem';
import type { WorkspaceFacade } from '#hooks/use-file-manager.js';
import { getProjectRootConfigs, setCheckoutRootConfigs } from '#filesystem/handle-store.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionStatus } from '#hooks/use-revision-status.js';

/**
 * Give this project's linked checkouts their routes (blueprint S27, W2 review R4).
 *
 * The registry inside the revision tree is the only writer of checkouts, and it
 * publishes them in the projection; nothing had yet turned them into routes, so
 * `/checkouts/<id>` resolved to nothing on either host. A checkout rides its own
 * project's storage root in the dot-prefixed space project discovery never scans
 * (charter D4), so a route needs no new capability and no new storage root —
 * only a base path beside the project.
 *
 * @param projectId - The project whose checkouts these are.
 * @param linkedIds - Space-separated checkout ids, newest set wins.
 * @param workspace - The facade that re-issues the whole configuration.
 * @returns The re-issue, or `undefined` when the set was already installed.
 */
function mountCheckoutRoutes(
  projectId: string,
  linkedIds: string,
  workspace: Pick<WorkspaceFacade, 'syncProjectRoots'>,
): Promise<void> | undefined {
  if (linkedIds === '') {
    /* Nothing to mount is still an answer: a discarded branch's route must go,
     * or its rooted views keep answering from a tree nothing writes. */
    return setCheckoutRootConfigs([]) ? workspace.syncProjectRoots() : undefined;
  }
  return (async () => {
    const configuration = await getProjectRootConfigs();
    const project = configuration.projects.find((config) => config.projectId === projectId);
    if (project === undefined) {
      return;
    }
    const routes: readonly CheckoutRootConfig[] = linkedIds.split(' ').map((checkoutId) => ({
      ...project,
      checkoutId,
      providerBasePath: `.tau/checkouts/${projectId}/${checkoutId}`,
    }));
    if (setCheckoutRootConfigs(routes)) {
      await workspace.syncProjectRoots();
    }
  })();
}

/**
 * Where the workbench's file services are rooted (S27, A1, A2).
 *
 * *Switch* is one verb with two implementations a person never distinguishes.
 * When the target branch has a linked checkout, the workbench **re-roots**: the
 * selection moves in `project-revisions.machine` and every consumer — Files,
 * the editor, the viewer, parameters, the main-file selector — re-issues its
 * rooted view at the new route. They all already read the file manager's rooted
 * services, so re-rooting is one `setRoot`, not new plumbing, and no reload.
 *
 * The selection is **not** route state. S27 proposed a route-level `checkoutId`
 * beside `mobileActiveTab`, but A38 gave the selection to the revision root
 * (`selectedCheckoutId` / `follow`, with D10's guard, which needs the lease
 * set) and the projection publishes it with the route it resolves to. A copy in
 * editor panel state would be a second truth for one fact, so this headless
 * component is the whole of the re-root.
 *
 * @returns Nothing; it only follows the selection.
 */
export function WorkbenchCheckoutRoot(): undefined {
  const { projectId } = useProject();
  const { fileManagerRef, workspace } = useFileManager();
  const status = useRevisionStatus();
  const checkoutRoot = status?.checkoutRoot;
  /* The route ids, not the rows: the facet array is rebuilt on every
   * publication, and re-issuing the whole configuration for an unchanged set
   * would remount every project route the workbench is already reading. */
  const linkedIds = (status?.branches ?? [])
    .flatMap((row) =>
      row.checkoutId === undefined || row.checkoutRoot !== `/checkouts/${row.checkoutId}` ? [] : [row.checkoutId],
    )
    .join(' ');

  useEffect(() => {
    if (checkoutRoot === undefined) {
      return undefined;
    }
    /* Mount before we move: a `setRoot` at a route no configuration installed
     * would leave every rooted view answering ESTALE (W2 review R4). The live
     * tree needs no mount, so the common case stays synchronous. */
    const mounted = mountCheckoutRoutes(projectId, linkedIds, workspace);
    if (mounted === undefined) {
      /* The file manager's own guard drops a `setRoot` that moves nothing, so
       * following the projection is idempotent. */
      fileManagerRef.send({ type: 'setRoot', path: checkoutRoot, projectId });
      return undefined;
    }
    /* Two switches in flight are one person changing their mind: the superseded
     * route installation must not land its `setRoot` after the newer one and
     * re-root the workbench at the branch they just left. */
    const live = { current: true };
    /* async-iife: bootstrap. A React effect is synchronous and the route
     * installation is not; the settlement a caller would want is the `setRoot`
     * itself, which the suite observes through the file manager. */
    void (async () => {
      await mounted;
      if (!live.current) {
        return;
      }
      fileManagerRef.send({ type: 'setRoot', path: checkoutRoot, projectId });
    })();
    return () => {
      live.current = false;
    };
  }, [checkoutRoot, fileManagerRef, linkedIds, projectId, workspace]);

  return undefined;
}
