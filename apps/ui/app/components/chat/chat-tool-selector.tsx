import { memo, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Globe, Code, Image, Eye } from 'lucide-react';
import type { ToolWithSelection, Tool } from '@taucad/types';
import { tool, toolSelection } from '@taucad/types/constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';

type ToolSelectorMode = 'auto' | 'none' | 'any' | 'custom';

type ChatToolSelectorProperties = {
  readonly value?: ToolWithSelection;
  readonly onValueChange?: (value: ToolWithSelection) => void;
  readonly children: (properties: { selectedMode: ToolSelectorMode; selectedTools: Tool[] }) => ReactNode;
};

const toolMetadata: Record<
  Tool,
  {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  [tool.webSearch]: {
    label: 'Web Search',
    description: 'Search the web for information',
    icon: Globe,
  },
  [tool.webBrowser]: {
    label: 'Web Browser',
    description: 'Browse and analyze web pages',
    icon: Eye,
  },
  [tool.fileEdit]: {
    label: 'File Edit',
    description: 'Edit and create files',
    icon: Code,
  },
  [tool.imageAnalysis]: {
    label: 'Image Analysis',
    description: 'Analyze images',
    icon: Image,
  },
};

const modeOptions: Array<{
  value: ToolSelectorMode;
  label: string;
  description: string;
}> = [
  {
    value: 'auto',
    label: 'Auto',
    description: 'Let AI decide which tools to use',
  },
  {
    value: 'none',
    label: 'None',
    description: "Don't use any tools",
  },
  {
    value: 'any',
    label: 'Any',
    description: 'Require tool use (all available)',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Select specific tools to require',
  },
];

const getModeFromValue = (value?: ToolWithSelection): ToolSelectorMode => {
  if (!value || value === toolSelection.auto) {
    return 'auto';
  }

  if (value === toolSelection.none) {
    return 'none';
  }

  if (value === toolSelection.any) {
    return 'any';
  }

  if (Array.isArray(value)) {
    return 'custom';
  }

  return 'auto';
};

const getToolsFromValue = (value?: ToolWithSelection): Tool[] => {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
};

export const ChatToolSelector = memo(function ({
  value,
  onValueChange,
  children,
}: ChatToolSelectorProperties): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const mode = getModeFromValue(value);
  const selectedTools = getToolsFromValue(value);

  const handleModeChange = useCallback(
    (newMode: ToolSelectorMode) => {
      switch (newMode) {
        case 'auto': {
          onValueChange?.(toolSelection.auto);
          break;
        }

        case 'none': {
          onValueChange?.(toolSelection.none);
          break;
        }

        case 'any': {
          onValueChange?.(toolSelection.any);
          break;
        }

        case 'custom': {
          // Default to all tools when switching to custom
          onValueChange?.([tool.webSearch, tool.fileEdit]);
          break;
        }

        default: {
          const exhaustiveCheck: never = newMode;
          throw new Error(`Unknown mode: ${exhaustiveCheck as string}`);
        }
      }
    },
    [onValueChange],
  );

  const handleToolToggle = useCallback(
    (tool: Tool) => {
      const currentTools = Array.isArray(value) ? value : [];
      const isCurrentlySelected = currentTools.includes(tool);

      if (isCurrentlySelected) {
        const newTools = currentTools.filter((t) => t !== tool);
        // If no tools selected, switch back to auto
        if (newTools.length === 0) {
          onValueChange?.(toolSelection.auto);
        } else {
          onValueChange?.(newTools);
        }
      } else {
        const newTools = [...currentTools, tool];
        onValueChange?.(newTools);
      }
    },
    [value, onValueChange],
  );

  const preventClose = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>{children({ selectedMode: mode, selectedTools })}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Tool Selection</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            handleModeChange(value as ToolSelectorMode);
          }}
        >
          {modeOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} className="h-10" value={option.value} onSelect={preventClose}>
              <div className="flex flex-col items-start gap-0">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {mode === 'custom' ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Select tools to use</DropdownMenuLabel>
            {Object.entries(toolMetadata).map(([key, metadata]) => {
              const toolKey = key as Tool;
              const Icon = metadata.icon;
              const isSelected = selectedTools.includes(toolKey);

              return (
                <DropdownMenuSwitchItem
                  key={toolKey}
                  isChecked={isSelected}
                  onIsCheckedChange={() => {
                    handleToolToggle(toolKey);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-4" />
                    {metadata.label}
                  </span>
                </DropdownMenuSwitchItem>
              );
            })}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
