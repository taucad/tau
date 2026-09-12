import { memo, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Plus, TriangleAlert } from 'lucide-react';
// oxlint-disable-next-line import/consistent-type-specifier-style -- A separate type import trips import/no-duplicates.
import { useModels, type Model, type ResolvedModel } from '#hooks/use-models.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Badge } from '@taucad/ui/components/badge';
import { menuItemVariants } from '@taucad/ui/components/menu.variants';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { modelTier, modelTiers, useCreditAffordance } from '#components/billing/credit-estimate.js';
import type { CreditAffordance } from '#components/billing/credit-estimate.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useKeybinding } from '#hooks/use-keyboard.js';
import { openSettingsDialog } from '#hooks/use-settings-dialog.js';
import type { KeyCombination } from '#utils/keys.utils.js';
import { cn } from '@taucad/ui/utils/cn';

export const openModelSelectorKeyCombination = {
  key: '/',
  modKey: true,
} satisfies KeyCombination;

type ChatModelSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly onSelect?: (modelId: string) => void;
  readonly onClose?: () => void;
  readonly children: (props: { selectedModel: ResolvedModel }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
  readonly isNested?: boolean;
  /**
   * Registers the global open shortcut. The composer's picker owns it; a second
   * instance (the credits error card's "Switch Model") opts out so one
   * combination never has two claimants.
   */
  readonly enableShortcut?: boolean;
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

/** Per-turn spend, as the row and the hover card each say it. */
function formatAffordance(affordance: CreditAffordance): string {
  const turns = affordance.turns === undefined ? '' : ` · about ${affordance.turns} turns left`;
  return `≈ ${affordance.credits} credits per turn${turns}`;
}

export const ChatModelSelector = memo(function ({
  onSelect,
  onClose,
  children,
  isNested,
  enableShortcut = true,
  ...properties
}: ChatModelSelectorProps): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const handleOpenFromShortcut = useCallback(() => {
    setOpen(true);
  }, []);

  useKeybinding(openModelSelectorKeyCombination, handleOpenFromShortcut, { enabled: enableShortcut });

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
  const affordanceFor = useCreditAffordance();
  const tierModelsMap = new Map(modelTiers.map((tier) => [tier, [] as Model[]]));
  for (const model of visibleModels) {
    tierModelsMap.get(modelTier(model.details.cost.outputTokens))?.push(model);
  }

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
      groupedItems={[...tierModelsMap.entries()]
        .filter(([, tierModels]) => tierModels.length > 0)
        .map(([tier, tierModels]) => ({
          name: tier,
          items: tierModels,
        }))}
      renderLabel={(item, selectedItem) => {
        const affordance = affordanceFor(item.id);
        // A balance below one typical turn warns but never disables: any
        // balance buys any tier (P1), and sending opens the top-up flow.
        const isBelowOneTurn = affordance?.turns === 0;
        return (
          <HoverCard>
            <HoverCardTrigger asChild>
              <span className='-mx-3 -my-1 flex min-h-0 w-[calc(100%+1.5rem)] shrink-0 items-center justify-between gap-2 px-3 py-1'>
                <div className='flex min-w-0 items-center gap-2'>
                  <SvgIcon id={item.details.family} />
                  <span className='truncate'>{item.name}</span>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  {affordance ? (
                    <span className='flex items-center gap-1 text-xs text-muted-foreground tabular-nums'>
                      {isBelowOneTurn ? <TriangleAlert className='size-3.5 text-warning' aria-hidden='true' /> : null}≈{' '}
                      {affordance.credits} credits
                    </span>
                  ) : null}
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
                {affordance ? <p className='text-xs text-muted-foreground'>{formatAffordance(affordance)}</p> : null}
                {isBelowOneTurn ? (
                  <p className='flex items-start gap-1.5 text-xs text-muted-foreground'>
                    <TriangleAlert className='mt-0.5 size-3.5 shrink-0 text-warning' aria-hidden='true' />
                    Your balance does not cover one turn on this model. Add credits to send.
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
      isNested={isNested}
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
                openSettingsDialog('models');
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
