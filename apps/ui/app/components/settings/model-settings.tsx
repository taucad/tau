import { useMemo, useState } from 'react';
import { Bot, SearchX } from 'lucide-react';
import type { Model } from '#hooks/use-models.js';
import { Button } from '@taucad/ui/components/button';
import { SwitchRow } from '@taucad/ui/components/switch';
import { SvgIcon } from '@taucad/ui-kit/icons/svg-icon';
import { useModels } from '#hooks/use-models.js';
import { SearchInput } from '@taucad/ui/components/search-input';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { Skeleton } from '@taucad/ui/components/skeleton';
import { cn } from '@taucad/ui/utils/cn';
import { ModelPinButton } from '@taucad/chat-ui/components/model-pin-button';

export function ModelSettings(): React.JSX.Element {
  const {
    data = [],
    isLoading,
    recommendedModels,
    overrides,
    isAvailable,
    setAvailable,
    resetAvailability,
    isPinningEnabled,
    isPinned,
    setPinned,
  } = useModels();
  const hasOverrides = Object.keys(overrides).length > 0;
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const visibleModels = useMemo(() => {
    const base: Model[] = showAll ? data : recommendedModels;
    if (!search) {
      return base;
    }

    const query = search.toLowerCase();
    return base.filter(
      (model) => model.name.toLowerCase().includes(query) || model.provider.name.toLowerCase().includes(query),
    );
  }, [data, recommendedModels, search, showAll]);

  return (
    <div className='flex flex-col gap-4 pb-6'>
      <SearchInput
        aria-label='Search models'
        value={search}
        onClear={() => {
          setSearch('');
        }}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
        placeholder='Search models…'
      />

      <div className='flex flex-col gap-3'>
        <div className='flex min-h-8 items-center justify-between gap-4'>
          <h2 className='text-sm font-medium'>Available models</h2>
          {hasOverrides ? (
            <Button variant='link' size='sm' className='h-auto px-0' onClick={resetAvailability}>
              Reset to recommended
            </Button>
          ) : null}
        </div>
        {visibleModels.length === 0 ? (
          <ModelsEmptyState
            search={search.trim()}
            isLoading={isLoading}
            hasHiddenModels={!showAll && data.length > 0}
            onClearSearch={() => {
              setSearch('');
            }}
            onShowAll={() => {
              setShowAll(true);
            }}
          />
        ) : (
          <div className='flex flex-col gap-0.5 rounded-xl border bg-card p-1'>
            {visibleModels.map((model) => (
              /* The pin sits beside the switch's label, not inside it, so a click on it never flips the switch. */
              <div key={model.id} className='group/row flex items-center gap-1 pr-1'>
                <SwitchRow
                  className='min-w-0 flex-1'
                  icon={<SvgIcon id={model.details.family} className='size-4' />}
                  description={model.description}
                  isChecked={isAvailable(model)}
                  onIsCheckedChange={(isChecked) => {
                    setAvailable(model, isChecked);
                  }}
                >
                  <span className='truncate'>{model.name}</span>
                </SwitchRow>
                {isPinningEnabled ? (
                  <ModelPinButton
                    name={model.name}
                    isOn={isPinned(model)}
                    className={cn(
                      !isPinned(model) &&
                        'opacity-0 group-hover/row:opacity-100 group-has-focus-visible/row:opacity-100 pointer-coarse:opacity-100',
                    )}
                    onToggle={() => {
                      setPinned(model, !isPinned(model));
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {visibleModels.length > 0 ? (
        <Button
          variant='link'
          className='self-start px-0'
          onClick={() => {
            setShowAll((previous) => !previous);
          }}
        >
          {showAll ? 'Show recommended only' : 'Show all models'}
        </Button>
      ) : null}
    </div>
  );
}

function ModelsEmptyState({
  search,
  isLoading,
  hasHiddenModels,
  onClearSearch,
  onShowAll,
}: {
  readonly search: string;
  readonly isLoading: boolean;
  readonly hasHiddenModels: boolean;
  readonly onClearSearch: () => void;
  readonly onShowAll: () => void;
}): React.JSX.Element {
  const className = 'h-64 rounded-xl border bg-card';

  if (isLoading) {
    return (
      <div role='status' aria-busy='true' className='flex flex-col gap-0.5 rounded-xl border bg-card p-1'>
        <span className='sr-only'>Loading models</span>
        {Array.from({ length: 6 }, (_, index) => (
          // The shape of a model row: provider icon, name and description, then the switch.
          <div key={index} aria-hidden='true' className='flex items-center gap-3 px-3 py-2.5'>
            <Skeleton className='size-4 shrink-0' />
            <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
              <Skeleton className='h-3.5 w-36 max-w-full' />
              <Skeleton className='h-3 w-64 max-w-full' />
            </div>
            <Skeleton className='h-5 w-9 shrink-0 rounded-full' />
          </div>
        ))}
      </div>
    );
  }

  if (search) {
    return (
      <PanelEmptyState
        icon={SearchX}
        title={`No models match “${search}”`}
        description='Try another model or provider name'
        className={className}
      >
        <Button variant='outline' size='sm' onClick={onClearSearch}>
          Clear search
        </Button>
      </PanelEmptyState>
    );
  }

  if (hasHiddenModels) {
    return (
      <PanelEmptyState
        icon={Bot}
        title='No recommended models'
        description='Browse the full catalog to choose the models you want available'
        className={className}
      >
        <Button variant='outline' size='sm' onClick={onShowAll}>
          View all models
        </Button>
      </PanelEmptyState>
    );
  }

  return (
    <PanelEmptyState
      icon={Bot}
      title='No models available'
      description='The model catalog is empty or could not be reached'
      className={className}
    />
  );
}
