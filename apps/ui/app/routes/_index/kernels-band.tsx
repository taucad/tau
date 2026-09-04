import { availableKernelConfigurations } from '#constants/available-kernel-configurations.js';
import { Badge } from '@taucad/ui/components/badge';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@taucad/ui/components/hover-card';
import { KernelTierBadge } from '#components/tier-badge.js';

/**
 * Credibility band: one runtime, every CAD engine. Demoted below the value
 * story (kernels are proof, not pitch). Reuses the kernel catalog + hover-card
 * detail from the legacy kernels section, restyled as a horizontal band.
 */
export function KernelsBand(): React.JSX.Element {
  return (
    <section className='border-b bg-muted/20'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto mb-12 max-w-2xl text-center'>
          <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>One platform, every engine</h2>
          <p className='mt-4 text-muted-foreground'>
            Mesh modeling to precise BRep engineering — pick the right kernel per project, all behind one runtime and
            one file format. Proof this is infrastructure, not a wrapper.
          </p>
        </div>

        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {availableKernelConfigurations().map((kernel) => (
            <HoverCard key={kernel.id} openDelay={200} closeDelay={100}>
              <HoverCardTrigger asChild>
                <div className='group flex cursor-pointer items-center gap-3 rounded-xl border bg-background p-4 transition-all hover:border-primary/50 hover:shadow-md'>
                  <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10'>
                    <SvgIcon id={kernel.id} className='size-5' />
                  </div>
                  <div className='min-w-0'>
                    <h3 className='flex items-center gap-1.5 font-semibold'>
                      {kernel.name}
                      <KernelTierBadge kernelId={kernel.id} />
                    </h3>
                    <p className='truncate text-xs text-muted-foreground'>{kernel.description}</p>
                  </div>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className='w-80' side='top'>
                <div className='space-y-3'>
                  <div className='flex items-center gap-3'>
                    <SvgIcon id={kernel.id} className='size-8' />
                    <div>
                      <h4 className='flex items-center gap-1.5 font-semibold'>
                        {kernel.name}
                        <KernelTierBadge kernelId={kernel.id} />
                      </h4>
                      <p className='text-xs text-muted-foreground'>
                        Backend: {kernel.backendProvider} · {kernel.dimensions.join('D & ')}D
                      </p>
                    </div>
                  </div>
                  <p className='text-sm text-muted-foreground'>{kernel.longDescription}</p>
                  <Badge variant='default' className='text-xs'>
                    Best for: {kernel.recommended}
                  </Badge>
                </div>
              </HoverCardContent>
            </HoverCard>
          ))}
        </div>
      </div>
    </section>
  );
}
