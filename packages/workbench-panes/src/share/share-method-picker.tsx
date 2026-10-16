import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import type { ShareMethodSource } from '#share/share-source.js';

const getMethodValue = (method: ShareMethodSource): string => method.id;

/**
 * The "Share with" picker over the host's methods. Drawn only when there is a choice to make.
 *
 * @param props - The methods, the chosen one, and what a pick does.
 * @returns The picker, or nothing for a single method.
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
}): React.JSX.Element | undefined {
  if (methods.length < 2) {
    return undefined;
  }
  const SelectedIcon = value.icon;
  return (
    <div className='min-w-0'>
      <p className='mb-1.5 text-xs font-medium text-muted-foreground'>Share with</p>
      <ComboBoxResponsive<ShareMethodSource>
        groupedItems={[{ name: 'Share with', items: [...methods] }]}
        getValue={getMethodValue}
        value={value}
        isSearchEnabled={false}
        title='Choose sharing method'
        description='Choose where to publish or store this project.'
        popoverProperties={{
          className: 'w-[var(--radix-popover-trigger-width)] min-w-56',
        }}
        isDisabled={() => isDisabled}
        renderLabel={(method, selectedItem) => {
          const Icon = method.icon;
          return (
            <span className='flex w-full min-w-0 items-center justify-between gap-3'>
              <span className='flex min-w-0 items-center gap-2'>
                <Icon className='size-4 shrink-0' aria-hidden />
                <span className='truncate'>{method.label}</span>
              </span>
              {selectedItem?.id === method.id ? <Check className='size-4 shrink-0' aria-hidden /> : null}
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
        >
          <span className='flex min-w-0 items-center gap-2'>
            <SelectedIcon className='size-4 shrink-0' aria-hidden />
            <span className='truncate'>{value.label}</span>
          </span>
          <ChevronDown className='size-4 shrink-0 text-muted-foreground' aria-hidden />
        </Button>
      </ComboBoxResponsive>
    </div>
  );
}
