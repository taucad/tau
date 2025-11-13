import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { Model } from '@taucad/types';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Badge } from '#components/ui/badge.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { useModels } from '#hooks/use-models.js';

type ChatModelSelectorProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'onSelect'> & {
  readonly onSelect?: (modelId: string) => void;
  readonly onClose?: () => void;
  readonly children: (props: { selectedModel?: Model }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
};

export const ChatModelSelector = memo(function ({
  onSelect,
  onClose,
  children,
  ...properties
}: ChatModelSelectorProps): React.JSX.Element {
  const { selectedModel, setSelectedModelId, data: models = [] } = useModels();

  const providerModelsMap = new Map<string, Model[]>();
  for (const model of models) {
    if (!providerModelsMap.has(model.provider.name)) {
      providerModelsMap.set(model.provider.name, []);
    }

    providerModelsMap.get(model.provider.name)?.push(model);
  }

  const handleSelectModel = useCallback(
    (item: string) => {
      const model = models.find((m) => m.id === item);

      if (model) {
        setSelectedModelId(model.id);
        onSelect?.(model.id);
      }
    },
    [models, onSelect, setSelectedModelId],
  );

  return (
    <ComboBoxResponsive
      {...properties}
      className="[&[data-slot='popover-content']]:w-[300px]"
      popoverProperties={properties.popoverProperties}
      emptyListMessage="No models found."
      title="Select a model"
      description="Select the model to use for the chat. This will be used to generate a response."
      groupedItems={[...providerModelsMap.entries()].map(([provider, models]) => ({
        name: provider,
        items: models,
      }))}
      renderLabel={(item, selectedItem) => (
        <span className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <SvgIcon id={item.details.family} />
            <span>{item.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {item.details.parameterSize ? (
              <Badge variant="outline" className="bg-background">
                {item.details.parameterSize}
              </Badge>
            ) : null}
            {selectedItem?.id === item.id ? <Check /> : null}
          </div>
        </span>
      )}
      getValue={(item) => item.id}
      placeholder="Select a model"
      defaultValue={selectedModel}
      onSelect={handleSelectModel}
      onClose={onClose}
    >
      {children({ selectedModel })}
    </ComboBoxResponsive>
  );
});
