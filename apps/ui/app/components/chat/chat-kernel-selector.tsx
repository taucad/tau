import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { KernelProvider } from '@taucad/runtime';
import type { KernelConfiguration } from '@taucad/types/constants';
import { kernelConfigurations } from '@taucad/types/constants';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { KernelTierBadge } from '#components/tier-badge.js';

function formatKernelDimensions(dimensions: KernelConfiguration['dimensions']): string {
  return dimensions.map((d) => `${d}D`).join(' & ');
}

function formatKernelLanguage(language: KernelConfiguration['language']): string {
  switch (language) {
    case 'kcl': {
      return 'KCL';
    }

    case 'openscad': {
      return 'OpenSCAD';
    }

    case 'typescript': {
      return 'TypeScript';
    }

    default: {
      return language;
    }
  }
}

type ChatKernelSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly onSelect?: (kernelId: KernelProvider) => void;
  readonly onClose?: () => void;
  readonly children: (props: { selectedKernel: (typeof kernelConfigurations)[number] }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
  readonly isNested?: boolean;
};

export const ChatKernelSelector = memo(function ({
  onSelect,
  onClose,
  children,
  isNested,
  ...properties
}: ChatKernelSelectorProps): React.JSX.Element {
  // Read AND write through the unified composer context. The active
  // provider's strategy (composer-cookie vs session dual-write) decides
  // whether the patch hits the chat row, the cookie, or both. The selector
  // never touches `useKernel` directly.
  const {
    kernel: { kernel: selectedKernel, setActiveKernel },
  } = useChatComposer();

  const handleSelectKernel = useCallback(
    (item: string) => {
      const kernel = kernelConfigurations.find((k) => k.id === item);

      if (kernel) {
        setActiveKernel(kernel.id);
        onSelect?.(kernel.id);
      }
    },
    [onSelect, setActiveKernel],
  );

  return (
    <ComboBoxResponsive
      {...properties}
      className="data-[slot='popover-content']:w-[300px]"
      popoverProperties={properties.popoverProperties}
      emptyListMessage='No kernels found.'
      searchPlaceHolder='Search kernels...'
      title='Select a kernel'
      description='Select the kernel to use for the chat. This will be used to generate a response.'
      groupedItems={[
        {
          name: 'CAD Kernels',
          items: [...kernelConfigurations],
        },
      ]}
      renderLabel={(item, selectedItem) => (
        <HoverCard>
          <HoverCardTrigger asChild>
            <span className='flex w-full items-center justify-between'>
              <div className='flex min-w-0 flex-1 items-center gap-2'>
                <SvgIcon id={item.id} className='shrink-0' />
                <div className='flex min-w-0 flex-col'>
                  <span className='flex min-w-0 items-center gap-1.5 truncate'>
                    {item.name}
                    <KernelTierBadge kernelId={item.id} />
                  </span>
                  <span className='truncate text-xs text-muted-foreground'>{item.description}</span>
                </div>
              </div>
              {selectedItem?.id === item.id ? <Check className='shrink-0' /> : null}
            </span>
          </HoverCardTrigger>
          <HoverCardContent side='right' align='start' sideOffset={12} alignOffset={-4} className='w-72'>
            <div className='space-y-2'>
              <div className='flex items-center gap-2'>
                <SvgIcon id={item.id} className='size-5 shrink-0' />
                <h4 className='flex items-center gap-1.5 text-sm font-semibold'>
                  {item.name}
                  <KernelTierBadge kernelId={item.id} />
                </h4>
              </div>
              <p className='text-sm text-muted-foreground'>{item.longDescription}</p>
              <p className='text-xs text-muted-foreground'>Best for: {item.recommended}</p>
              <p className='text-xs text-muted-foreground'>
                {formatKernelDimensions(item.dimensions)} · {formatKernelLanguage(item.language)}
              </p>
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
      getValue={(item) => item.id}
      placeholder='Select a kernel'
      value={selectedKernel}
      isNested={isNested}
      onSelect={handleSelectKernel}
      onClose={onClose}
    >
      {children({ selectedKernel })}
    </ComboBoxResponsive>
  );
});
