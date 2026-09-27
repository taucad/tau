import { memo, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Plus } from 'lucide-react';
// oxlint-disable-next-line import/consistent-type-specifier-style -- A separate type import trips import/no-duplicates.
import { useModels, type Model, type ResolvedModel } from '#hooks/use-models.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Badge } from '@taucad/ui/components/badge';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { groupModelsByTier } from '#utils/model-tier.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useSettingsDialog } from '#hooks/use-settings-dialog.js';
import { cn } from '@taucad/ui/utils/cn';

type ChatModelSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly onSelect?: (modelId: string) => void;
  readonly onClose?: () => void;
  readonly children: (props: { selectedModel: ResolvedModel }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
};

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${Math.round(tokens / 1_000_000)}M`;
  }

  return `${Math.round(tokens / 1000)}k`;
}

function formatCost(costPerMillion: number): string {
  if (costPerMillion === 0) {
    return 'Free';
  }

  return `$${costPerMillion}`;
}

export const ChatModelSelector = memo(function ({
  onSelect,
  onClose,
  children,
  ...properties
}: ChatModelSelectorProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const { open: openSettings } = useSettingsDialog();

  // Write through the chat-scoped resolver populated by the active provider
  // (composer-only → cookie; session-backed → chat row + cookie dual-write).
  // Reads `data: models` from the global hook because the catalogue itself
  // is not chat-scoped.
  const {
    model: { model: selectedModel, setActiveModel },
  } = useChatComposer();
  const { data: allModels = [], availableModels } = useModels();

  const visibleModels = useMemo(() => {
    const currentInCatalog = allModels.find((entry) => entry.id === selectedModel.id);
    if (currentInCatalog && !availableModels.some((entry) => entry.id === currentInCatalog.id)) {
      return [...availableModels, currentInCatalog];
    }

    return availableModels;
  }, [allModels, availableModels, selectedModel.id]);

  const comboboxSelectedModel = useMemo(
    () => visibleModels.find((entry) => entry.id === selectedModel.id),
    [visibleModels, selectedModel.id],
  );

  // Grouped by what the reader is actually choosing between: how much a turn
  // costs. Provider identity stays on the row icon and the hover card.
  const groupedModels = useMemo(() => groupModelsByTier<Model>(visibleModels), [visibleModels]);

  const handleSelectModel = useCallback(
    (item: string) => {
      const model = allModels.find((entry) => entry.id === item);

      if (model) {
        setActiveModel(model.id);
        onSelect?.(model.id);
      }
    },
    [allModels, onSelect, setActiveModel],
  );

  return (
    <ComboBoxResponsive
      {...properties}
      className="data-[slot='popover-content']:w-[300px]"
      popoverProperties={properties.popoverProperties}
      emptyListMessage='No models found.'
      searchPlaceHolder='Search models...'
      title='Select a model'
      description='Select the model to use for the chat. This will be used to generate a response.'
      groupedItems={groupedModels}
      renderLabel={(item, selectedItem) => {
        return (
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className='-mx-3 -my-1 flex min-h-0 w-[calc(100%+1.5rem)] shrink-0 items-center justify-between gap-2 px-3 py-1'>
                <div className='flex min-w-0 items-center gap-2'>
                  <SvgIcon id={item.details.family} />
                  <span className='truncate'>{item.name}</span>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  {item.details.parameterSize ? (
                    <Badge variant='outline' className='bg-background'>
                      {item.details.parameterSize}
                    </Badge>
                  ) : null}
                  {selectedItem?.id === item.id ? <Check /> : null}
                </div>
              </span>
            </HoverCardTrigger>
            <HoverCardContent side='right' align='start' sideOffset={12} alignOffset={-4} className='w-72'>
              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <SvgIcon id={item.details.family} className='size-5 shrink-0' />
                  <h4 className='text-sm font-semibold'>
                    {item.provider.name} {item.name}
                  </h4>
                </div>
                {item.description ? <p className='text-sm text-muted-foreground'>{item.description}</p> : null}
                {item.details.contextWindow ? (
                  <p className='text-xs text-muted-foreground'>
                    {formatContextWindow(item.details.contextWindow)} context window
                  </p>
                ) : null}
                <p className='text-xs text-muted-foreground'>
                  Cost: {formatCost(item.details.cost.inputTokens)} input / {formatCost(item.details.cost.outputTokens)}{' '}
                  output per 1M tokens
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      }}
      getValue={(item) => item.id}
      placeholder='Select a model'
      value={comboboxSelectedModel}
      isOpen={open}
      onOpenChange={setOpen}
      onSelect={handleSelectModel}
      onClose={onClose}
      footer={
        <>
          <div className='border-t' />
          <div className='p-1'>
            <button
              type='button'
              className={cn(menuItemVariants({ highlight: 'selected' }), 'h-auto w-full')}
              onClick={() => {
                openSettings('models');
              }}
            >
              <Plus />
              Add models
            </button>
          </div>
        </>
      }
    >
      {children({ selectedModel })}
    </ComboBoxResponsive>
  );
});
