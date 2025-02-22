import { useState, useRef, useEffect } from 'react';
import { Mic, Globe, ArrowRight, ChevronDown, CircuitBoard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ComboBoxResponsive } from '@/components/ui/combobox-responsive';
import { Model } from '@/hooks/use-models';
import { SvgIcon } from '@/components/icons/svg-icon';
import { CadLanguage } from '@/types/cad';

export interface ChatTextareaProperties {
  onSubmit: ({
    content,
    model,
    metadata,
  }: {
    content: string;
    model: string;
    metadata?: { systemHints?: string[] };
  }) => Promise<void>;
  models: Model[];
  defaultModel?: string;
  autoFocus?: boolean;
}

export function ChatTextarea({
  onSubmit,
  models,
  defaultModel = 'gpt-4o-mini',
  autoFocus = true,
}: ChatTextareaProperties) {
  const [inputText, setInputText] = useState('');
  const [selectedModel, setSelectedModel] = useState(defaultModel);
  const [isSearching, setIsSearching] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaReference = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = async () => {
    if (inputText.length === 0) return;
    setInputText('');
    await onSubmit({
      content: inputText,
      model: selectedModel,
      metadata: { systemHints: [...(isSearching ? ['search'] : [])] },
    });
  };

  const providerModelsMap = new Map<string, Model[]>();
  for (const model of models) {
    if (!providerModelsMap.has(model.provider)) {
      providerModelsMap.set(model.provider, []);
    }
    providerModelsMap.get(model.provider)?.push(model);
  }

  useEffect(() => {
    if (autoFocus) {
      textareaReference.current?.focus();
    }
  }, [autoFocus]);

  return (
    <div className="relative h-full">
      <div
        data-state={isFocused ? 'active' : 'inactive'}
        onClick={() => {
          textareaReference.current?.focus();
        }}
        className="flex flex-col h-full border shadow-md rounded-lg data-[state=active]:border-primary w-full resize-none overflow-auto cursor-text"
      >
        <Textarea
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          ref={textareaReference}
          className="border-none shadow-none ring-0 p-4 pr-10 pb-0 mb-8 focus-visible:ring-0 focus-visible:outline-none w-full resize-none h-full"
          rows={3}
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault(); // Prevents adding a new line
              handleSubmit();
            }
          }}
          placeholder="Ask Tau a question..."
        />
      </div>
      <div className="absolute left-2 bottom-2 flex flex-row items-center gap-1">
        <ComboBoxResponsive
          className="group text-xs w-[initial] px-2 h-6 border-none flex items-center justify-between gap-2"
          popoverContentClassName="w-[300px]"
          groupedItems={[...providerModelsMap.entries()].map(([provider, models]) => ({
            name: provider,
            items: models,
          }))}
          renderLabel={(item) => (
            <span className="text-xs flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <SvgIcon id={item.provider as CadLanguage} className="size-4" />
                <span className="font-mono">{item.model}</span>
              </div>
              <Badge variant="outline" className="bg-background">
                {item.details.parameterSize}
              </Badge>
            </span>
          )}
          renderButtonContents={(item) => (
            <span className="flex flex-row items-center gap-2 group-data-[state=open]:text-primary">
              <span className="text-xs">{item.model}</span>
              <span className="relative flex size-4">
                <ChevronDown className="absolute group-hover:scale-0 transition-transform duration-200 ease-in-out" />
                <CircuitBoard className="absolute scale-0 group-hover:scale-100 transition-transform duration-200 ease-in-out" />
              </span>
            </span>
          )}
          getValue={(item) => item.model}
          onSelect={(selectedModel) => {
            setSelectedModel(selectedModel);
          }}
          placeholder="Select a model"
          defaultValue={models.find((model) => model.model === selectedModel)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-state={isSearching ? 'active' : 'inactive'}
              size="xs"
              variant="ghost"
              className="group data-[state=active]:bg-neutral/20 data-[state=active]:text-primary data-[state=active]:shadow transition-transform duration-200 ease-in-out"
              onClick={() => {
                setIsSearching((previous) => !previous);
              }}
            >
              <span className="text-xs">Search</span>
              <Globe className="size-4 group-hover:rotate-180 transition-transform duration-200 ease-in-out" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Search the web</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-2 top-2"
        onClick={handleSubmit}
        disabled={inputText.length === 0}
      >
        <ArrowRight className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" className="absolute right-2 bottom-2">
        <Mic className="size-4" />
      </Button>
    </div>
  );
}
