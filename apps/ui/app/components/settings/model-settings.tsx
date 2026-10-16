import { useMemo, useState } from 'react';
import { Bot, SearchX } from 'lucide-react';
import type { Model } from '#hooks/use-models.js';
import { Button } from '@taucad/ui/components/button';
import { SwitchRow } from '@taucad/ui/components/switch';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useModels } from '#hooks/use-models.js';
import { SearchInput } from '@taucad/ui/components/search-input';
import { PanelEmptyState } from '@taucad/ui/components/panel-empty-state';
import { Loader } from '@taucad/ui/components/loader';
import { cn } from '@taucad/ui/utils/cn';
import { ModelPinButton } from '#components/chat/model-pin-button.js';

export function ModelSettings(): React.JSX.Element {
  const {
    data = [],
    isLoading,
    recommendedModels,
    overrides,
    isAvailable,
    setAvailable,
    resetAvailability,
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

      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between gap-2'>
          <h2>Available models</h2>
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
          {showAll ? 'Show recommended only' : 'View All Models'}
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
    return <PanelEmptyState icon={Loader} title='Loading models' aria-busy className={className} />;
  }

  if (search) {
    return (
      <PanelEmptyState
        icon={SearchX}
        title={`No models match “${search}”`}
        description='Try another model or provider name.'
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
        description='Browse the full catalog to choose the models you want available.'
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
      description='The model catalog is empty or could not be reached.'
      className={className}
    />
  );
}
