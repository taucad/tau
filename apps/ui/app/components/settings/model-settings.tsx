import { useMemo, useState } from 'react';
import { Bot, SearchX } from 'lucide-react';
import type { Model } from '#hooks/use-models.js';
import { Button } from '@taucad/ui/components/button';
import { SwitchRow } from '@taucad/ui/components/switch';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useModels } from '#hooks/use-models.js';
import { SearchInput } from '#components/search-input.js';
import { PanelEmptyState } from '#components/ui/panel-empty-state.js';
import { Loader } from '#components/ui/loader.js';

export function ModelSettings(): React.JSX.Element {
  const { data = [], isLoading, recommendedModels, isAvailable, setAvailable } = useModels();
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
        variant='transparent'
        onClear={() => {
          setSearch('');
        }}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
        placeholder='Search models…'
      />

      <div className='flex flex-col gap-2'>
        <h2>Available models</h2>
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
          <div className='flex flex-col gap-0.5 rounded-xl border p-1'>
            {visibleModels.map((model) => (
              <SwitchRow
                key={model.id}
                icon={<SvgIcon id={model.details.family} className='size-4' />}
                description={model.description}
                isChecked={isAvailable(model)}
                onIsCheckedChange={(isChecked) => {
                  setAvailable(model, isChecked);
                }}
              >
                <span className='truncate'>{model.name}</span>
              </SwitchRow>
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
