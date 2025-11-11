import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { KernelProvider } from '@taucad/types';
import { kernelConfigurations } from '@taucad/types/constants';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';

type ChatKernelSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly onSelect?: (kernelId: KernelProvider) => void;
  readonly onClose?: () => void;
  readonly children: (props: { selectedKernel?: (typeof kernelConfigurations)[number] }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
};

export const ChatKernelSelector = memo(function ({
  onSelect,
  onClose,
  children,
  ...properties
}: ChatKernelSelectorProps): React.JSX.Element {
  const [selectedKernelId, setSelectedKernelId] = useCookie<KernelProvider>(cookieName.cadKernel, 'openscad');

  const selectedKernel = kernelConfigurations.find((k) => k.id === selectedKernelId);

  const handleSelectKernel = useCallback(
    (item: string) => {
      const kernel = kernelConfigurations.find((k) => k.id === item);

      if (kernel) {
        setSelectedKernelId(kernel.id);
        onSelect?.(kernel.id);
      }
    },
    [onSelect, setSelectedKernelId],
  );

  return (
    <ComboBoxResponsive
      {...properties}
      className="[&[data-slot='popover-content']]:w-[300px]"
      popoverProperties={properties.popoverProperties}
      emptyListMessage="No kernels found."
      title="Select a kernel"
      description="Select the kernel to use for the chat. This will be used to generate a response."
      groupedItems={[
        {
          name: 'CAD Kernels',
          items: [...kernelConfigurations],
        },
      ]}
      renderLabel={(item, selectedItem) => (
        <span className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <SvgIcon id={item.id} />
            <div className="flex flex-col">
              <span>{item.name}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </div>
          </div>
          {selectedItem?.id === item.id ? <Check /> : null}
        </span>
      )}
      getValue={(item) => item.id}
      placeholder="Select a kernel"
      defaultValue={selectedKernel}
      onSelect={handleSelectKernel}
      onClose={onClose}
    >
      {children({ selectedKernel })}
    </ComboBoxResponsive>
  );
});
