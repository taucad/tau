import type { KernelProvider } from '@taucad/runtime';
import { kernelConfigurations } from '@taucad/types/constants';
import { Button } from '#components/ui/button.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';
import { Badge } from '#components/ui/badge.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { cn } from '#utils/ui.utils.js';
import { KernelTierBadge } from '#components/tier-badge.js';

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
    <div className="flex flex-wrap gap-3 max-md:-mx-4 max-md:snap-x max-md:snap-mandatory max-md:scroll-px-4 max-md:[scrollbar-width:none] max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-2 max-md:pl-4 max-md:[-webkit-overflow-scrolling:touch] max-md:after:block max-md:after:w-1 max-md:after:shrink-0 max-md:after:content-[''] max-md:[&::-webkit-scrollbar]:hidden">
      {kernelConfigurations.map((option) => (
        <HoverCard key={option.id}>
          <HoverCardTrigger asChild>
            <Button
              variant='outline'
              size='sm'
              className={cn(
                'flex h-auto flex-col items-center justify-center gap-2 rounded-lg border-border p-2 transition-all hover:border-ring/50 hover:bg-primary/20',
                'max-md:min-w-[calc((100%-1.5rem)/3.3)] max-md:shrink-0 max-md:snap-start',
                selectedKernel === option.id &&
                  'border-ring bg-primary/5 text-primary hover:border-ring hover:bg-primary/10 dark:border-ring',
              )}
              onClick={() => {
                onKernelChange(option.id);
                onClose?.();
              }}
            >
              <div className='flex items-center gap-2'>
                <SvgIcon id={option.id} className='size-4 sm:size-5' />
                <span className='flex items-center gap-1.5 text-xs font-medium sm:text-sm'>
                  {option.name}
                  <KernelTierBadge kernelId={option.id} />
                </span>
              </div>
            </Button>
          </HoverCardTrigger>
          <HoverCardContent side='top' className='w-120 max-md:hidden'>
            <div className='space-y-4'>
              <div className='flex items-start gap-4'>
                <SvgIcon id={option.id} className='size-12 min-w-12 rounded-lg bg-muted p-2' />
                <div>
                  <h3 className='flex items-center gap-1.5 text-lg font-semibold'>
                    {option.name}
                    <KernelTierBadge kernelId={option.id} />
                  </h3>
                  <p className='text-sm text-wrap text-muted-foreground italic'>{option.description}</p>
                </div>
              </div>

              <div className='space-y-3'>
                <p className='text-sm leading-relaxed text-muted-foreground'>{option.longDescription}</p>

                <div className='space-y-2'>
                  <Badge variant='default' className='text-xs font-medium'>
                    Best for: {option.recommended}
                  </Badge>

                  <div className='flex flex-wrap gap-1'>
                    {option.tags.map((tag) => (
                      <Badge key={tag} variant='secondary' className='text-xs'>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  );
}
