import { Button } from '#components/ui/button.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { Badge } from '#components/ui/badge.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { KernelProvider } from '#types/kernel.types.js';
import { kernelOptions } from '#constants/kernel.constants.js';
import { cn } from '#utils/ui.js';

export type KernelSelectorProperties = {
  readonly selectedKernel: KernelProvider;
  readonly onKernelChange: (kernel: KernelProvider) => void;
  readonly onClose?: () => void;
};

export function KernelSelector({
  selectedKernel,
  onKernelChange,
  onClose,
}: KernelSelectorProperties): React.JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-3 lg:grid-cols-3">
      {kernelOptions.map((option) => (
        <HoverCard key={option.id}>
          <HoverCardTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'flex h-auto min-h-9 flex-col items-center justify-center gap-2 rounded-lg border-border p-2 transition-all hover:border-ring/50 hover:bg-primary/5',
                selectedKernel === option.id && 'border-ring hover:border-ring hover:bg-primary/10 bg-primary/5 ring-3 ring-ring/50',
              )}
              onClick={() => {
                onKernelChange(option.id);
                onClose?.();
              }}
            >
              <div className="flex items-center gap-2">
                <SvgIcon id={option.id} className="size-5" />
                <span className="text-sm font-medium">{option.name}</span>
              </div>
            </Button>
          </HoverCardTrigger>
          <HoverCardContent side="top" className="w-120">
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <SvgIcon id={option.id} className="size-12 min-w-12 rounded-lg bg-muted p-2" />
                <div>
                  <h3 className="text-lg font-semibold">{option.name}</h3>
                  <p className="text-sm text-wrap text-muted-foreground italic">{option.description}</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">{option.longDescription}</p>

                <div className="space-y-2">
                  <Badge variant="outline" className="text-xs font-medium text-primary">
                    Best for: {option.recommended}
                  </Badge>

                  <div className="flex flex-wrap gap-1">
                    {option.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Key Features:</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {option.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <div className="size-1.5 shrink-0 rounded-full bg-primary/60" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  );
}
