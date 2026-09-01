import { useEffect, useMemo, useState } from 'react';
import type { IDockviewHeaderActionsProps, IDockviewPanel } from 'dockview-react';
import { Check, ChevronDown } from 'lucide-react';
import { DockviewPaneAction } from '#components/panes/dockview-pane-action.js';
import { DockviewTabIcon } from '#components/panes/dockview-tab.js';
import type { DockviewTabIconRenderer, DockviewTabProps } from '#components/panes/dockview-tab.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';

export type DockviewTabOverflowPickerProperties = IDockviewHeaderActionsProps & {
  readonly getIcon?: DockviewTabIconRenderer;
  readonly leadingIcon?: DockviewTabProps['leadingIcon'];
};

const getPanelPath = (panel: IDockviewPanel): string | undefined => {
  const parameters = panel.params;
  if (typeof parameters?.['filePath'] === 'string') {
    return parameters['filePath'];
  }
  if (typeof parameters?.['entryPath'] === 'string') {
    return parameters['entryPath'];
  }
  return undefined;
};

const getPanelTitle = (panel: IDockviewPanel): string => panel.api.title ?? panel.id;

const getPanelSearchValue = (panel: IDockviewPanel): string =>
  [getPanelTitle(panel), getPanelPath(panel), panel.id].filter(Boolean).join(' ');

const renderPanelLabel = (
  panel: IDockviewPanel,
  activePanel: IDockviewPanel | undefined,
  iconOptions: Pick<DockviewTabOverflowPickerProperties, 'getIcon' | 'leadingIcon'>,
): React.JSX.Element => {
  const title = getPanelTitle(panel);
  const path = getPanelPath(panel);

  return (
    <span className='flex min-w-0 flex-1 items-center gap-2'>
      <DockviewTabIcon title={title} leadingIcon={iconOptions.leadingIcon} icon={iconOptions.getIcon?.(panel)} />
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='truncate'>{title}</span>
        {path && path !== title ? <span className='truncate text-xs text-muted-foreground'>{path}</span> : null}
      </span>
      {activePanel?.id === panel.id ? <Check aria-label='Active tab' className='size-3.5 shrink-0' /> : null}
    </span>
  );
};

const useTabsOverflow = ({
  group,
  panelCount,
}: {
  readonly group: IDockviewHeaderActionsProps['group'];
  readonly panelCount: number;
}): boolean => {
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const tabs = group.element.querySelector<HTMLElement>('.dv-tabs-container');
    if (!tabs) {
      setIsOverflowing(false);
      return;
    }

    let frame: number | undefined;
    const measure = (): void => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        frame = undefined;
        setIsOverflowing(tabs.scrollWidth > tabs.clientWidth + 1);
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(tabs);
    measure();

    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      observer.disconnect();
    };
  }, [group, panelCount]);

  return isOverflowing;
};

export function DockviewTabOverflowPicker(
  properties: DockviewTabOverflowPickerProperties,
): React.JSX.Element | undefined {
  const { activePanel, getIcon, leadingIcon, panels } = properties;
  const isOverflowing = useTabsOverflow({ group: properties.group, panelCount: panels.length });
  const groupedItems = useMemo(() => [{ name: 'Open tabs', items: panels }], [panels]);

  if (!isOverflowing) {
    return undefined;
  }

  return (
    <Tooltip>
      <ComboBoxResponsive<IDockviewPanel>
        groupedItems={groupedItems}
        value={activePanel}
        getValue={getPanelSearchValue}
        renderLabel={(panel, selectedPanel) => renderPanelLabel(panel, selectedPanel, { getIcon, leadingIcon })}
        className='w-72'
        popoverProperties={{ align: 'end' }}
        searchPlaceHolder='Search open tabs...'
        emptyListMessage='No open tabs found.'
        title='Open tabs'
        description='Search and activate an open tab in this pane.'
        onSelect={(value) => {
          panels.find((panel) => getPanelSearchValue(panel) === value)?.api.setActive();
        }}
      >
        <TooltipTrigger asChild>
          <DockviewPaneAction aria-label='Open tabs'>
            <ChevronDown aria-hidden className='size-3.5' />
          </DockviewPaneAction>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent>Open tabs</TooltipContent>
    </Tooltip>
  );
}
