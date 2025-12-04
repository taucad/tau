import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { KernelProvider } from '@taucad/types';
import { kernelConfigurations } from '@taucad/types/constants';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useKernel } from '#hooks/use-kernel.js';

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
  const { kernel, setKernel } = useKernel();

  const selectedKernel = kernelConfigurations.find((k) => k.id === kernel);

  const handleSelectKernel = useCallback(
    (item: string) => {
      const kernel = kernelConfigurations.find((k) => k.id === item);

      if (kernel) {
        setKernel(kernel.id);
        onSelect?.(kernel.id);
      }
    },
    [onSelect, setKernel],
  );

  return (
    <ComboBoxResponsive
      {...properties}
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
