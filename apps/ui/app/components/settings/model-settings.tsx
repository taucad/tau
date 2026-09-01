import { useMemo, useState } from 'react';
import type { Model } from '@taucad/chat';
import { Button } from '#components/ui/button.js';
import { Input } from '#components/ui/input.js';
import { Switch } from '#components/ui/switch.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useModels } from '#hooks/use-models.js';

export function ModelSettings(): React.JSX.Element {
  const { data = [], recommendedModels, isAvailable, setAvailable } = useModels();
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
      <Input
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
        placeholder='Search models...'
      />

      <p className='text-sm text-muted-foreground'>
        Choose which models appear in the chat model picker. Disabled models stay configured and can be re-enabled
        anytime.
      </p>

      <div className='flex flex-col gap-0.5 rounded-md border p-1'>
        {visibleModels.map((model) => {
          const checked = isAvailable(model);
          return (
            <button
              key={model.id}
              type='button'
              onClick={() => {
                setAvailable(model, !checked);
              }}
              className='flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-left transition-colors hover:bg-menu-highlight focus-visible:bg-menu-highlight focus-visible:outline-none'
            >
              <div className='flex min-w-0 items-center gap-2.5'>
                <SvgIcon id={model.details.family} className='size-4 shrink-0' />
                <div className='flex min-w-0 flex-col'>
                  <span className='truncate text-sm'>{model.name}</span>
                  {model.description ? (
                    <span className='text-xs leading-snug font-medium text-muted-foreground/80'>
                      {model.description}
                    </span>
                  ) : null}
                </div>
              </div>
              <Switch className='pointer-events-none shrink-0' tabIndex={-1} checked={checked} />
            </button>
          );
        })}
      </div>

      {visibleModels.length === 0 ? (
        <p className='text-sm text-muted-foreground'>No models match your search.</p>
      ) : null}

      <Button
        variant='link'
        className='self-start px-0'
        onClick={() => {
          setShowAll((previous) => !previous);
        }}
      >
        {showAll ? 'Show recommended only' : 'View All Models'}
      </Button>
    </div>
  );
}
