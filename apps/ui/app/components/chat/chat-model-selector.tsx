import { useCallback } from 'react';
import type { JSX, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { ComboBoxResponsive } from '@/components/ui/combobox-responsive.js';
import { Badge } from '@/components/ui/badge.js';
import { SvgIcon } from '@/components/icons/svg-icon.js';
import { cn } from '@/utils/ui.js';
import type { Model } from '@/hooks/use-models.js';
import type { ModelProvider } from '@/types/cad.js';
import { useModels } from '@/hooks/use-models.js';

type ChatModelSelectorProps = {
  readonly models: Model[];
  readonly onSelect?: (modelId: string) => void;
  readonly onClose?: () => void;
  readonly className?: string;
  readonly renderButtonContents: (item: Model) => ReactNode;
};

export function ChatModelSelector({
  models,
  onSelect,
  onClose,
  className,
  renderButtonContents,
}: ChatModelSelectorProps): JSX.Element {
  const { selectedModel, setSelectedModel } = useModels();

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
        setSelectedModel(model.id);
        onSelect?.(model.id);
      }
    },
    [models, onSelect, setSelectedModel],
  );

  return (
    <ComboBoxResponsive
      className={className}
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
      renderButtonContents={renderButtonContents}
      getValue={(item) => item.id}
      placeholder="Select a model"
      defaultValue={models.find((model) => model.id === selectedModel)}
      onSelect={handleSelectModel}
      onClose={onClose}
    />
  );
}
