import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { AtSign, Image, Code, AlertTriangle, AlertCircle } from 'lucide-react';
import { useSelector } from '@xstate/react';
import { TooltipTrigger, TooltipContent, Tooltip } from '~/components/ui/tooltip.js';
import { Button } from '~/components/ui/button.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { useGraphics } from '~/components/geometry/graphics/graphics-context.js';
import { toast } from '~/components/ui/sonner.js';
import { ComboBoxResponsive } from '~/components/ui/combobox-responsive.js';

type ChatContextActionsProperties = {
  readonly addImage: (image: string) => void;
  readonly addText: (text: string) => void;
};

type ContextActionItem = {
  id: string;
  label: string;
  group: string;
  icon: JSX.Element;
  action: () => void;
  disabled?: boolean;
};

export function ChatContextActions({ addImage, addText }: ChatContextActionsProperties): JSX.Element {
  const kernelError = useSelector(cadActor, (state) => state.context.kernelError);
  const codeErrors = useSelector(cadActor, (state) => state.context.codeErrors);
  const code = useSelector(cadActor, (state) => state.context.code);
  const { screenshot } = useGraphics();

  // Add a new function to capture model screenshot
  const handleAddModelScreenshot = useCallback(() => {
    if (screenshot.isReady) {
      try {
        const dataUrl = screenshot.capture({
          output: {
            format: 'image/png',
            quality: 0.92,
          },
          zoomLevel: 1.5,
        });

        // Add the screenshot to images state
        addImage(dataUrl);
      } catch (error) {
        toast.error('Failed to capture model screenshot');
        console.error('Screenshot error:', error);
      }
    } else {
      toast.error('Renderer not ready');
    }
  }, [screenshot, addImage]);

  const handleAddCode = useCallback(() => {
    const markdownCode = `
# Code
\`\`\`javascript
${code}
\`\`\`
    `;
    addText(markdownCode);
  }, [addText, code]);

  const handleAddCodeErrors = useCallback(() => {
    const errors = codeErrors.map((error) => `- (${error.startLineNumber}:${error.startColumn}): ${error.message}`);

    const markdownErrors = `
# Code errors
${errors.join('\n')}

# Code
\`\`\`python
${code}
\`\`\`
    `;
    addText(markdownErrors);
  }, [addText, code, codeErrors]);

  const handleAddKernelError = useCallback(() => {
    if (kernelError) {
      const markdownKernelError = `
# Kernel error
${kernelError}

# Code
\`\`\`python
${code}
\`\`\`
      `;
      addText(markdownKernelError);
    }
  }, [addText, code, kernelError]);

  const contextItems = useMemo(
    (): ContextActionItem[] => [
      {
        id: 'add-model-screenshot',
        label: 'Add model screenshot',
        group: 'Visual',
        icon: <Image className="mr-2 size-4" />,
        action: handleAddModelScreenshot,
        disabled: !screenshot.isReady,
      },
      {
        id: 'add-code',
        label: 'Add code',
        group: 'Code',
        icon: <Code className="mr-2 size-4" />,
        action: handleAddCode,
        disabled: !code,
      },
      {
        id: 'add-code-errors',
        label: 'Add code errors',
        group: 'Code',
        icon: <AlertTriangle className="mr-2 size-4" />,
        action: handleAddCodeErrors,
        disabled: codeErrors.length === 0,
      },
      {
        id: 'add-kernel-error',
        label: 'Add kernel error',
        group: 'Code',
        icon: <AlertCircle className="mr-2 size-4" />,
        action: handleAddKernelError,
        disabled: kernelError === undefined,
      },
    ],
    [
      handleAddModelScreenshot,
      screenshot.isReady,
      handleAddCode,
      code,
      handleAddCodeErrors,
      codeErrors.length,
      handleAddKernelError,
      kernelError,
    ],
  );

  const groupedContextItems = useMemo(() => {
    const groupedContextItemsMap: Record<string, { name: string; items: ContextActionItem[] }> = {};
    const groupOrder: string[] = [];

    for (const item of contextItems) {
      if (!groupedContextItemsMap[item.group]) {
        groupedContextItemsMap[item.group] = { name: item.group, items: [] };
        groupOrder.push(item.group);
      }

      groupedContextItemsMap[item.group].items.push(item);
    }

    return Object.values(groupedContextItemsMap).sort(
      (a, b) => groupOrder.indexOf(a.name) - groupOrder.indexOf(b.name),
    );
  }, [contextItems]);

  const renderContextItemLabel = (item: ContextActionItem, _selectedItem: ContextActionItem | undefined) => (
    <div className="flex items-center">
      {item.icon}
      {item.label}
    </div>
  );

  const getContextItemValue = (item: ContextActionItem) => item.id;
  const isContextItemDisabled = (item: ContextActionItem) => Boolean(item.disabled);

  return (
    <Tooltip>
      <ComboBoxResponsive<ContextActionItem>
        groupedItems={groupedContextItems}
        renderLabel={renderContextItemLabel}
        getValue={getContextItemValue}
        defaultValue={undefined}
        isDisabled={isContextItemDisabled}
        popoverProperties={{
          align: 'start',
          side: 'top',
        }}
        popoverContentClassName="w-60 z-50"
        searchPlaceHolder="Search context..."
        placeholder="Add context"
        onSelect={(itemId) => {
          const selectedItem = contextItems.find((item) => item.id === itemId);
          selectedItem?.action();
        }}
      >
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" className="size-6 bg-background">
            <AtSign className="size-3" />
          </Button>
        </TooltipTrigger>
      </ComboBoxResponsive>
      <TooltipContent>Add context</TooltipContent>
    </Tooltip>
  );
}
