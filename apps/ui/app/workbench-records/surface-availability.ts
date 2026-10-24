import type { WorkbenchLaneNode } from '@taucad/workbench';
import { isDesktopTarget } from '#lib/build-target.js';

/**
 * Whether this build offers a Workbench surface at all, before flags and profile. Browser drives the desktop app's
 * guest view, so only the desktop app offers it. Jobs is unfinished and offered nowhere.
 *
 * @param id - A desktop Workbench pane or a phone surface; they share the ids this checks.
 * @returns Whether launchers may list the surface and `openPanel` may open it.
 */
export const isSurfaceShipped = (id: string): boolean => id !== 'jobs' && (id !== 'browser' || isDesktopTarget());

/**
 * A stored Workbench lane without the pane tabs this build does not ship, for a layout saved by another build or
 * before a pane was withdrawn. A group left without tabs stays as a launcher, as an empty group always projects.
 *
 * @param node - The stored lane.
 * @returns The same tree with unshipped pane tabs removed and each group's active tab kept where it survives.
 */
export const withoutUnshippedPanes = (node: WorkbenchLaneNode): WorkbenchLaneNode => {
  if (node.kind === 'split') {
    return { ...node, children: node.children.map(withoutUnshippedPanes) };
  }
  const tabs = node.tabs.filter((tab) => tab.kind !== 'pane' || isSurfaceShipped(tab.pane));
  if (tabs.length === node.tabs.length) {
    return node;
  }
  const active = node.active === undefined ? -1 : tabs.indexOf(node.tabs[node.active]!);
  return { ...node, tabs, active: active === -1 ? undefined : active };
};
