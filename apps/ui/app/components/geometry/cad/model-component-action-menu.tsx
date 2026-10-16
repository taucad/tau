import {
  ModelComponentActionContextContent as PackageModelComponentActionContextContent,
  ModelComponentActionDropdown as PackageModelComponentActionDropdown,
  ModelComponentViewerMenuItems as PackageModelComponentViewerMenuItems,
} from '@taucad/workbench-panes/component-menu/component-action-menu';
import type {
  ModelComponentActionContextContentProperties,
  ModelComponentActionDropdownProperties,
  ModelComponentActionMenuData as PackageModelComponentActionMenuData,
} from '@taucad/workbench-panes/component-menu/component-action-menu';
import type { ModelComponentHostActions } from '@taucad/workbench-panes/component-menu/component-actions';
import { useOpenPartGallery } from '#components/geometry/cad/part-gallery.js';
import { useModelComponentProjectActions } from '#components/geometry/cad/model-component-actions.js';

/** A part menu's data; the app supplies its own verbs, so callers leave `actions` out. */
export type ModelComponentActionMenuData = Omit<PackageModelComponentActionMenuData, 'actions'>;

/**
 * The app's verbs for the shared part menus: chat, the Model and Kinematics panes, and the part gallery.
 */
export function useModelComponentMenuActions(): ModelComponentHostActions {
  const { addToChat, revealInExplorer, showKinematics } = useModelComponentProjectActions();
  const openPreview = useOpenPartGallery();
  return { addToChat, revealInExplorer, showKinematics, openPreview };
}

export function ModelComponentActionDropdown(
  properties: Omit<ModelComponentActionDropdownProperties, 'actions'>,
): React.JSX.Element {
  return <PackageModelComponentActionDropdown {...properties} actions={useModelComponentMenuActions()} />;
}

export function ModelComponentActionContextContent(
  properties: Omit<ModelComponentActionContextContentProperties, 'actions'>,
): React.JSX.Element {
  return <PackageModelComponentActionContextContent {...properties} actions={useModelComponentMenuActions()} />;
}

export function ModelComponentViewerMenuItems(
  properties: ModelComponentActionMenuData & {
    readonly onRequestClose: () => void;
  },
): React.JSX.Element {
  return <PackageModelComponentViewerMenuItems {...properties} actions={useModelComponentMenuActions()} />;
}
