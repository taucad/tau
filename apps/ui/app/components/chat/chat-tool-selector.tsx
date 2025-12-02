import { memo, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Globe, Code, Image, Eye } from 'lucide-react';
import type { ToolSelection, ToolName } from '@taucad/chat';
import { toolName, toolMode } from '@taucad/chat/constants';
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

type ToolMetadata = {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
};

type ChatToolSelectorProperties = {
  readonly value?: ToolSelection;
  readonly onValueChange?: (value: ToolSelection) => void;
  readonly children: (properties: {
    selectedMode: ToolSelectorMode;
    selectedTools: ToolName[];
    toolMetadata: Record<ToolName, ToolMetadata>;
  }) => ReactNode;
};

const toolMetadata: Record<ToolName, ToolMetadata> = {
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
  [toolName.fileEdit]: {
    label: 'File Edit',
    description: 'Edit and create files',
    icon: Code,
  },
  [toolName.imageAnalysis]: {
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
    description: 'Make these tools available',
  },
];

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
}: ChatToolSelectorProperties): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const mode = getModeFromValue(value);
  const selectedTools = getToolsFromValue(value);

  const handleModeChange = useCallback(
    (newMode: ToolSelectorMode) => {
      switch (newMode) {
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
          // Default to all tools when switching to custom
          onValueChange?.([toolName.webSearch, toolName.fileEdit]);
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
    (toolName: ToolName) => {
      const currentTools = Array.isArray(value) ? value : [];
      const isCurrentlySelected = currentTools.includes(toolName);

      if (isCurrentlySelected) {
        const newTools = currentTools.filter((t) => t !== toolName);
        // If no tools selected, switch back to auto
        if (newTools.length === 0) {
          onValueChange?.(toolMode.auto);
        } else {
          onValueChange?.(newTools);
        }
      } else {
        const newTools = [...currentTools, toolName];
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
      <DropdownMenuTrigger asChild>{children({ selectedMode: mode, selectedTools, toolMetadata })}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>ToolName Selection</DropdownMenuLabel>
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
              const toolKey = key as ToolName;
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
