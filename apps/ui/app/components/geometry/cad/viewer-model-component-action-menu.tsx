import { ViewerModelComponentActionMenu as PackageViewerModelComponentActionMenu } from '@taucad/workbench-panes/component-menu/viewer-component-action-menu';
import type { ViewerModelComponentActionMenuPoint } from '@taucad/workbench-panes/component-menu/viewer-component-action-menu';
import type { ModelComponentActionMenuData } from '#components/geometry/cad/model-component-action-menu.js';
import { useModelComponentMenuActions } from '#components/geometry/cad/model-component-action-menu.js';

type ViewerModelComponentActionMenuProperties = {
  readonly data: ModelComponentActionMenuData | undefined;
  readonly point: ViewerModelComponentActionMenuPoint | undefined;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
};

/** The viewer's coordinate-anchored part menu, with the app's verbs. */
export function ViewerModelComponentActionMenu({
  data,
  ...properties
}: ViewerModelComponentActionMenuProperties): React.JSX.Element {
  const actions = useModelComponentMenuActions();
  return <PackageViewerModelComponentActionMenu {...properties} data={data ? { ...data, actions } : undefined} />;
}
