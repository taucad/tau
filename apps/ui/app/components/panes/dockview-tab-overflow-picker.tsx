import { useLayoutEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import type { IDockviewHeaderActionsProps, IDockviewPanel } from 'dockview-react';
import { Check, ChevronDown } from 'lucide-react';
import { DockviewTabIcon } from '#components/panes/dockview-tab.js';
import type { DockviewTabIconRenderer, DockviewTabProps } from '#components/panes/dockview-tab.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { PaneButton } from '#components/ui/pane-button.js';
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

  // Title only: the path stays in the search value, not on the row.
  return (
    <span className='flex min-w-0 flex-1 items-center gap-2'>
      <DockviewTabIcon title={title} leadingIcon={iconOptions.leadingIcon} icon={iconOptions.getIcon?.(panel)} />
      <span className='min-w-0 flex-1 truncate'>{title}</span>
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

  useLayoutEffect(() => {
    const tabs = group.element.querySelector<HTMLElement>('.dv-tabs-container');
    if (!tabs) {
      return;
    }

    const measure = (): void => {
      setIsOverflowing(panelCount > 0 && tabs.scrollWidth > tabs.clientWidth + 1);
    };
    // The fixed slot keeps this update from changing the width we measured.
    // Deliver resize-driven visibility before paint, not in the next frame.
    const observer = new ResizeObserver(() => {
      flushSync(measure);
    });
    observer.observe(tabs);
    measure();

    return () => {
      observer.disconnect();
    };
  }, [group, panelCount]);

  return isOverflowing;
};

type DockviewTabsComboBoxProperties = Pick<IDockviewHeaderActionsProps, 'activePanel'> &
  Pick<DockviewTabOverflowPickerProperties, 'getIcon' | 'leadingIcon'> &
  Pick<
    React.ComponentProps<typeof ComboBoxResponsive<IDockviewPanel>>,
    'children' | 'isOpen' | 'onOpenChange' | 'popoverProperties'
  > & {
    readonly panels: readonly IDockviewPanel[];
    readonly description?: string;
    /** Runs before the picked panel is activated. */
    readonly onPick?: (panel: IDockviewPanel) => void;
  };

/** The searchable "Open tabs" list shared by every surface that jumps to a Dockview tab. */
export function DockviewTabsComboBox({
  activePanel,
  panels,
  getIcon,
  leadingIcon,
  onPick,
  popoverProperties,
  description = 'Search and activate an open tab in this pane.',
  ...properties
}: DockviewTabsComboBoxProperties): React.JSX.Element {
  const groupedItems = useMemo(() => [{ name: 'Open tabs', items: [...panels] }], [panels]);

  return (
    <ComboBoxResponsive<IDockviewPanel>
      {...properties}
      groupedItems={groupedItems}
      value={activePanel}
      getValue={getPanelSearchValue}
      renderLabel={(panel, selectedPanel) => renderPanelLabel(panel, selectedPanel, { getIcon, leadingIcon })}
      className='w-72'
      popoverProperties={{ align: 'end', ...popoverProperties }}
      searchPlaceHolder='Search open tabs…'
      emptyListMessage='No open tabs found.'
      title='Open tabs'
      description={description}
      onSelect={(value) => {
        const panel = panels.find((candidate) => getPanelSearchValue(candidate) === value);
        if (panel) {
          onPick?.(panel);
          panel.api.setActive();
        }
      }}
    />
  );
}

export function DockviewTabOverflowPicker(
  properties: DockviewTabOverflowPickerProperties,
): React.JSX.Element | undefined {
  const { activePanel, getIcon, leadingIcon, panels } = properties;
  const isOverflowing = useTabsOverflow({ group: properties.group, panelCount: panels.length });

  if (!isOverflowing) {
    return <span aria-hidden className='size-7 shrink-0' data-slot='tab-overflow' />;
  }

  return (
    <span className='flex size-7 shrink-0 items-center' data-slot='tab-overflow'>
      <Tooltip>
        <DockviewTabsComboBox activePanel={activePanel} panels={panels} getIcon={getIcon} leadingIcon={leadingIcon}>
          <TooltipTrigger asChild>
            {/* Not a hover-revealed pane action: while tabs overflow, this is their visible route. */}
            <PaneButton aria-label='Open tabs'>
              <ChevronDown aria-hidden className='size-3.5' />
            </PaneButton>
          </TooltipTrigger>
        </DockviewTabsComboBox>
        <TooltipContent>Open tabs</TooltipContent>
      </Tooltip>
    </span>
  );
}
