import type { GeometryComponentReference } from '@taucad/types';
import type { ModelSource } from '@taucad/workbench-panes/model/model-source';
import type { LaneStore } from '#app/lane-store.js';
import { useStoredPanelLayout } from '#app/lane-store.js';
import { modelThumbnailsOf } from '#app/part-previews.jsx';
import type { PartThumbnails } from '#app/part-previews.jsx';

/**
 * The Model pane's source on the viewer page. The component tree is the shown model's manifest, and selection, hover,
 * visibility, isolation and opacity all go through the page's graphics actor. The pane follows the unit that actor
 * presents, because a GLB shown as itself has no source file to derive a unit from. Part rows show the thumbnails
 * `tau mcp` renders (`app_part_thumbnails`), a thumbnail opens the page's part gallery, and the sections keep their
 * layout in the project's lane store, as the Tau app keeps `modelPaneview`. With `componentActions` each row gets
 * the Tau app's part menu; with `reveal` the pane takes reveal requests from the canvas menu, otherwise it reveals its
 * own requests.
 *
 * @param options - `store` is the project's lane store; `thumbnails` the shown model's previews (`undefined` before a
 *   model is shown); `openPartGallery` opens the page's gallery; `onSelect` receives the selected component's
 *   reference (or `undefined` when cleared), so the page's title and "add to chat" follow a selection made in the
 *   tree; `componentActions` is the row menu (`createModelComponentActionMenus(createPageComponentActions(...))`),
 *   created once per page; `reveal` is the page's Model reveal channel (`createComponentReveal().model`).
 * @returns A source that follows the presented unit, draws thumbnails and keeps its layout.
 */
export function createModelSource(
  options: Readonly<{
    store: LaneStore;
    thumbnails: PartThumbnails | undefined;
    openPartGallery?: ModelSource['openPartGallery'];
    onSelect?: (reference: GeometryComponentReference | undefined) => void;
    componentActions?: ModelSource['componentActions'];
    reveal?: ModelSource['reveal'];
  }>,
): ModelSource {
  const { store } = options;
  return {
    unitIdentity: 'presented',
    usePanelLayout: function useModelPanelLayout() {
      return useStoredPanelLayout(store, 'model');
    },
    useThumbnails: modelThumbnailsOf(options.thumbnails),
    openPartGallery: options.openPartGallery,
    onSelect: options.onSelect,
    componentActions: options.componentActions,
    reveal: options.reveal,
  };
}
