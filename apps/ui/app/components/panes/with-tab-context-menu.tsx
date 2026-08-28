import type { IDockviewPanelHeaderProps } from 'dockview-react';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent } from '#components/ui/context-menu.js';
import { DockviewTab } from '#components/panes/dockview-tab.js';
import type { DockviewTabIconRenderer, DockviewTabProps } from '#components/panes/dockview-tab.js';

export type WithTabContextMenuOptions = {
  readonly leadingIcon?: DockviewTabProps['leadingIcon'];
  readonly getIcon?: DockviewTabIconRenderer;
};

/**
 * Higher-order component that wraps the DockviewTab with a right-click
 * context menu. The menu content is provided by the caller so each dock
 * (editor, viewer) can render its own set of actions.
 *
 * `ContextMenuTrigger` is styled with `display: contents` so it is
 * invisible to layout and does not interfere with Dockview's flex-based
 * tab styling.
 */
export function withTabContextMenu(
  MenuContent: React.FunctionComponent<IDockviewPanelHeaderProps>,
  options?: WithTabContextMenuOptions,
): React.FunctionComponent<IDockviewPanelHeaderProps> {
  const leadingIcon = options?.leadingIcon;

  function TabWithContextMenu(properties: IDockviewPanelHeaderProps): React.JSX.Element {
    return (
      <ContextMenu>
        <ContextMenuTrigger className='contents'>
          <DockviewTab {...properties} leadingIcon={leadingIcon} icon={options?.getIcon?.(properties)} />
        </ContextMenuTrigger>
        <ContextMenuContent>
          <MenuContent {...properties} />
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  TabWithContextMenu.displayName = `withTabContextMenu(${MenuContent.displayName ?? MenuContent.name})`;

  return TabWithContextMenu;
}
