import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { Badge } from '#components/ui/badge.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { Model } from '#hooks/use-models.js';
import type { ModelProvider } from '#types/cad.types.js';
import { useModels } from '#hooks/use-models.js';

type ChatModelSelectorProps = {
  readonly onSelect?: (modelId: string) => void;
  readonly onClose?: () => void;
  readonly className?: string;
  readonly children: (props: { selectedModel?: Model }) => ReactNode;
  readonly popoverProperties?: React.ComponentProps<typeof ComboBoxResponsive>['popoverProperties'];
};

export const ChatModelSelector = memo(function ({
  onSelect,
  onClose,
  children,
  ...props
}: ChatModelSelectorProps): React.JSX.Element {
  const { selectedModel, setSelectedModelId, data: models = [] } = useModels();

  const providerModelsMap = new Map<string, Model[]>();
  for (const model of models) {
    if (!providerModelsMap.has(model.provider)) {
      providerModelsMap.set(model.provider, []);
    }

    providerModelsMap.get(model.provider)?.push(model);
  }

  const handleSelectModel = useCallback(
    (item: string | Model) => {
      const model = typeof item === 'string' ? models.find((m) => m.id === item) : item;

      if (model) {
        setSelectedModelId(model.id);
        onSelect?.(model.id);
      }
    },
    [models, onSelect, setSelectedModelId],
  );

  return (
    <ComboBoxResponsive
      popoverContentClassName="w-[300px]"
      groupedItems={[...providerModelsMap.entries()].map(([provider, models]) => ({
        name: provider,
        items: models,
      }))}
      renderLabel={(item, selectedItem) => (
        <span className="flex w-full items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <SvgIcon id={item.provider as ModelProvider} />
            <span className="font-mono">{item.name}</span>
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
      {...props}
    >
      {children({ selectedModel })}
    </ComboBoxResponsive>
  );
});
