import type { GeometryComponentReference } from '@taucad/types';
import type { ModelSource } from '@taucad/workbench-panes/model/model-source';
import type { HostBridge } from '#app/host-bridge.js';

/**
 * The Model pane's source on the viewer page. It calls no tool: the component tree is the shown model's manifest,
 * and selection, hover, visibility, isolation and opacity all go through the page's graphics actor. The pane follows
 * the unit that actor presents, because a GLB shown as itself has no source file to derive a unit from. The page has
 * no thumbnail renderer, part gallery or layout store, so part rows stay compact and sections open at their default
 * sizes. With `componentActions` each row gets the Tau app's part menu; with `reveal` the pane takes reveal requests
 * from the canvas menu, otherwise it reveals its own requests.
 *
 * @param _bridge - The page's host bridge, unused until the page offers thumbnails.
 * @param options - `onSelect` receives the selected component's reference (or `undefined` when cleared), so the
 *   page's title and "add to chat" follow a selection made in the tree; `componentActions` is the row menu
 *   (`createModelComponentActionMenus(createPageComponentActions(...))`), created once per page; `reveal` is the
 *   page's Model reveal channel (`createComponentReveal().model`).
 * @returns A source that follows the presented unit and reports the selection.
 */
export function createModelSource(
  _bridge: HostBridge,
  options: Readonly<{
    onSelect?: (reference: GeometryComponentReference | undefined) => void;
    componentActions?: ModelSource['componentActions'];
    reveal?: ModelSource['reveal'];
  }> = {},
): ModelSource {
  return {
    unitIdentity: 'presented',
    onSelect: options.onSelect,
    componentActions: options.componentActions,
    reveal: options.reveal,
  };
}
