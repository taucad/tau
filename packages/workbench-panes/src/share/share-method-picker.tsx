import { useId } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import { Heading } from '@taucad/ui/components/heading';
import type { ShareMethodSource } from '#share/share-source.js';

const getMethodValue = (method: ShareMethodSource): string => method.id;

/**
 * The method block at the top of the Share pane: the "Share with" picker over the host's methods and the chosen
 * method's description. With one method there is nothing to choose, so the method's name is its heading.
 *
 * @param props - The methods, the chosen one, and what a pick does.
 * @returns The picker and the description, or the single method's heading and description.
 */
export function ShareMethodPicker({
  methods,
  value,
  isDisabled = false,
  onChange,
}: {
  readonly methods: readonly ShareMethodSource[];
  readonly value: ShareMethodSource;
  readonly isDisabled?: boolean;
  readonly onChange: (id: string) => void;
}): React.JSX.Element {
  const descriptionId = useId();
  if (methods.length < 2) {
    return (
      <div className='flex min-w-0 flex-col gap-1'>
        <Heading level={3} variant='label'>
          {value.label}
        </Heading>
        <p className='text-sm text-muted-foreground'>{value.description}</p>
      </div>
    );
  }
  const SelectedIcon = value.icon;
  return (
    <div className='flex max-w-xl min-w-0 flex-col gap-2'>
      <p className='text-xs font-medium text-muted-foreground'>Share with</p>
      <ComboBoxResponsive<ShareMethodSource>
        groupedItems={[{ name: 'Share with', items: [...methods] }]}
        getValue={getMethodValue}
        value={value}
        isSearchEnabled={false}
        title='Choose how to share'
        description='Pick a kind of link for this project.'
        popoverProperties={{
          className: 'w-[var(--radix-popover-trigger-width)] min-w-56',
        }}
        isDisabled={() => isDisabled}
        renderLabel={(method, selectedItem) => {
          const Icon = method.icon;
          return (
            <span className='flex w-full min-w-0 items-start justify-between gap-3'>
              <span className='flex min-w-0 flex-col gap-0.5'>
                <span className='flex min-w-0 items-center gap-2'>
                  <Icon className='size-4 shrink-0' aria-hidden />
                  <span className='truncate'>{method.label}</span>
                </span>
                <span className='text-xs text-muted-foreground'>{method.description}</span>
              </span>
              {selectedItem?.id === method.id ? (
                <span className='flex h-lh shrink-0 items-center'>
                  <Check className='size-4' aria-hidden />
                </span>
              ) : null}
            </span>
          );
        }}
        onSelect={(next) => {
          if (methods.some((method) => method.id === next)) {
            onChange(next);
          }
        }}
      >
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='w-full min-w-0 justify-between'
          disabled={isDisabled}
          aria-label={`Share with ${value.label}`}
          aria-describedby={descriptionId}
        >
          <span className='flex min-w-0 items-center gap-2'>
            <SelectedIcon className='size-4 shrink-0' aria-hidden />
            <span className='truncate'>{value.label}</span>
          </span>
          <ChevronDown className='size-4 shrink-0 text-muted-foreground' aria-hidden />
        </Button>
      </ComboBoxResponsive>
      <p id={descriptionId} className='text-sm text-muted-foreground'>
        {value.description}
      </p>
    </div>
  );
}
