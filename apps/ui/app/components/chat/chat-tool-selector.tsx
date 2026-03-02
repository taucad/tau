import { memo, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Globe, Image, Eye, Check, Wand2, Ban, Zap } from 'lucide-react';
import type { ToolSelection, ToolName } from '@taucad/chat';
import { toolName, toolMode } from '@taucad/chat/constants';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';

type ToolSelectorMode = 'auto' | 'none' | 'any' | 'custom';

type ToolMetadata = {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

type ChatToolSelectorProperties = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly value?: ToolSelection;
  readonly onValueChange?: (value: ToolSelection) => void;
  readonly children: (properties: {
    selectedMode: ToolSelectorMode;
    selectedTools: ToolName[];
    toolMetadata: Partial<Record<ToolName, ToolMetadata>>;
  }) => ReactNode;
  readonly isNested?: boolean;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
  readonly onClose?: () => void;
};

const toolMetadata: Partial<Record<ToolName, ToolMetadata>> = {
  [toolName.webSearch]: {
    label: 'Web Search',
    description: 'Search the web for information',
    icon: Globe,
  },
  [toolName.webBrowser]: {
    label: 'Web Browser',
    description: 'Browse and analyze web pages',
    icon: Eye,
  },
  [toolName.testModel]: {
    label: 'Test Model',
    description: 'Run measurement tests on the 3D model',
    icon: Image,
  },
  [toolName.editTests]: {
    label: 'Edit Tests',
    description: 'Edit test requirements in test.json',
    icon: Image,
  },
};

type ToolSelectorItem =
  | {
      type: 'mode';
      mode: ToolSelectorMode;
      label: string;
      description: string;
      icon: React.ComponentType<{ className?: string }>;
    }
  | {
      type: 'tool';
      tool: ToolName;
      label: string;
      description: string;
      icon: React.ComponentType<{ className?: string }>;
    };

const modeItems: ToolSelectorItem[] = [
  {
    type: 'mode',
    mode: 'auto',
    label: 'Auto',
    description: 'Let AI decide which tools to use',
    icon: Wand2,
  },
  {
    type: 'mode',
    mode: 'none',
    label: 'None',
    description: "Don't use any tools",
    icon: Ban,
  },
  {
    type: 'mode',
    mode: 'any',
    label: 'Any',
    description: 'Require tool use (all available)',
    icon: Zap,
  },
];

const toolItems: ToolSelectorItem[] = Object.entries(toolMetadata).map(([key, metadata]) => ({
  type: 'tool' as const,
  tool: key as ToolName,
  label: metadata.label,
  description: metadata.description,
  icon: metadata.icon,
}));

const getModeFromValue = (value?: ToolSelection): ToolSelectorMode => {
  if (!value || value === toolMode.auto) {
    return 'auto';
  }

  if (value === toolMode.none) {
    return 'none';
  }

  if (value === toolMode.any) {
    return 'any';
  }

  if (Array.isArray(value)) {
    return 'custom';
  }

  return 'auto';
};

const getToolsFromValue = (value?: ToolSelection): ToolName[] => {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
};

export const ChatToolSelector = memo(function ({
  value,
  onValueChange,
  children,
  isNested,
  popoverProperties,
  onClose,
  ...properties
}: ChatToolSelectorProperties): React.JSX.Element {
  const mode = getModeFromValue(value);
  const selectedTools = getToolsFromValue(value);

  const groupedItems = useMemo(
    () => [
      { name: 'Mode', items: modeItems },
      { name: 'Tools', items: toolItems },
    ],
    [],
  );

  const handleSelect = useCallback(
    (itemId: string) => {
      // Check if it's a mode selection
      const modeItem = modeItems.find((item) => item.type === 'mode' && item.mode === itemId);
      if (modeItem?.type === 'mode') {
        switch (modeItem.mode) {
          case 'auto': {
            onValueChange?.(toolMode.auto);
            break;
          }

          case 'none': {
            onValueChange?.(toolMode.none);
            break;
          }

          case 'any': {
            onValueChange?.(toolMode.any);
            break;
          }

          case 'custom': {
            // When selecting custom mode directly, default to common tools
            onValueChange?.([toolName.webSearch]);
            break;
          }
        }

        return;
      }

      // It's a tool selection - toggle the tool
      const toolItem = toolItems.find((item) => item.type === 'tool' && item.tool === itemId);
      if (toolItem?.type === 'tool') {
        const currentTools = Array.isArray(value) ? value : [];
        const isCurrentlySelected = currentTools.includes(toolItem.tool);

        if (isCurrentlySelected) {
          const newTools = currentTools.filter((t) => t !== toolItem.tool);
          // If no tools selected, switch back to auto
          if (newTools.length === 0) {
            onValueChange?.(toolMode.auto);
          } else {
            onValueChange?.(newTools);
          }
        } else {
          const newTools = [...currentTools, toolItem.tool];
          onValueChange?.(newTools);
        }
      }
    },
    [value, onValueChange],
  );

  const getValue = useCallback((item: ToolSelectorItem): string => {
    if (item.type === 'mode') {
      return item.mode;
    }

    return item.tool;
  }, []);

  const isItemSelected = useCallback(
    (item: ToolSelectorItem): boolean => {
      if (item.type === 'mode') {
        return mode === item.mode;
      }

      // For tools, they're selected if we're in custom mode and the tool is in the list
      return mode === 'custom' && selectedTools.includes(item.tool);
    },
    [mode, selectedTools],
  );

  const renderLabel = useCallback(
    (item: ToolSelectorItem, _selectedItem: ToolSelectorItem | undefined) => {
      const Icon = item.icon;
      const isSelected = isItemSelected(item);

      return (
        <span className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="size-4" />
            <div className="flex flex-col items-start">
              <span>{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </div>
          </div>
          {isSelected ? <Check className="size-4" /> : null}
        </span>
      );
    },
    [isItemSelected],
  );

  // Find the currently selected item for defaultValue
  const defaultValue = useMemo(() => {
    // If we're in a mode, return the mode item
    if (mode !== 'custom') {
      return modeItems.find((item) => item.type === 'mode' && item.mode === mode);
    }

    // If we're in custom mode, return undefined (multi-select scenario)
    return undefined;
  }, [mode]);

  return (
    <ComboBoxResponsive<ToolSelectorItem>
      {...properties}
      className="data-[slot='popover-content']:w-[280px]"
      popoverProperties={popoverProperties}
      emptyListMessage="No options found."
      searchPlaceHolder="Search tools..."
      title="Tool Selection"
      description="Select the tool mode or individual tools to use."
      groupedItems={groupedItems}
      renderLabel={renderLabel}
      getValue={getValue}
      placeholder="Select tools"
      defaultValue={defaultValue}
      isNested={isNested}
      isSearchEnabled={false}
      shouldCloseOnSelect={() => false}
      onSelect={handleSelect}
      onClose={onClose}
    >
      {children({ selectedMode: mode, selectedTools, toolMetadata })}
    </ComboBoxResponsive>
  );
});
