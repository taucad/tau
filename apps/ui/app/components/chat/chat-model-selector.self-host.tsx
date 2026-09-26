import { memo, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useModels } from '#hooks/use-models.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';

type ChatModelSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly onSelect?: (modelId: string) => void;
  readonly onClose?: () => void;
  readonly children: (props: { selectedModel: ResolvedModel }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
};

export const ChatModelSelector = memo(function ({
  onSelect,
  onClose,
  children,
  ...properties
}: ChatModelSelectorProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const {
    model: { model: selectedModel, setActiveModel },
  } = useChatComposer();
  const { data: models = [], availableModels } = useModels();
  const visibleModels = useMemo(() => {
    const selected = models.find((model) => model.id === selectedModel.id);
    return selected && !availableModels.some((model) => model.id === selected.id)
      ? [...availableModels, selected]
      : availableModels;
  }, [availableModels, models, selectedModel.id]);
  const selected = visibleModels.find((model) => model.id === selectedModel.id);

  return (
    <ComboBoxResponsive
      {...properties}
      isOpen={open}
      onOpenChange={setOpen}
      popoverProperties={properties.popoverProperties}
      emptyListMessage='No configured models found.'
      searchPlaceHolder='Search models...'
      title='Select a model'
      description='Select a model configured by this server.'
      groupedItems={[{ name: 'Models', items: visibleModels }]}
      renderLabel={(item, selectedItem) => (
        <span className='flex w-full items-center gap-2'>
          <SvgIcon id={item.details.family} />
          <span className='truncate'>{item.name}</span>
          {selectedItem?.id === item.id ? <Check className='ml-auto' /> : null}
        </span>
      )}
      getValue={(item) => item.id}
      placeholder='Select a model'
      value={selected}
      onSelect={(item) => {
        const model = models.find((entry) => entry.id === item);
        if (model) {
          setActiveModel(model.id);
          onSelect?.(model.id);
        }
      }}
      onClose={onClose}
    >
      {children({ selectedModel })}
    </ComboBoxResponsive>
  );
});
