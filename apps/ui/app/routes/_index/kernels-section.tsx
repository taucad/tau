import { kernelConfigurations } from '@taucad/types/constants';
import { Badge } from '#components/ui/badge.js';
import { SvgIcon } from '#components/icons/svg-icon.js';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '#components/ui/hover-card.js';

export function KernelsSection(): React.JSX.Element {
  return (
    <div className="border-y bg-muted/20">
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-4xl">
          {/* Section Header */}
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Choose Your CAD Kernel</h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              Multiple CAD engines to match your workflow — from simple mesh modeling to precise engineering.
            </p>
          </div>

          {/* Kernel Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kernelConfigurations.map((kernel) => (
              <HoverCard key={kernel.id} openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <div className="group cursor-pointer rounded-xl border bg-background p-5 transition-all hover:border-primary/50 hover:shadow-md">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <SvgIcon id={kernel.id} className="size-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{kernel.name}</h3>
                        <p className="text-xs text-muted-foreground">{kernel.language}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{kernel.description}</p>
                  </div>
                </HoverCardTrigger>
                <HoverCardContent className="w-80" side="top">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <SvgIcon id={kernel.id} className="size-8" />
                      <div>
                        <h4 className="font-semibold">{kernel.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          Backend: {kernel.backendProvider} · {kernel.dimensions.join('D & ')}D
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{kernel.longDescription}</p>
                    <div>
                      <Badge variant="default" className="text-xs">
                        Best for: {kernel.recommended}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {kernel.tags.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="border-t pt-2">
                      <p className="mb-1 text-xs font-medium">Key Features:</p>
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        {kernel.features.slice(0, 3).map((feature) => (
                          <li key={feature} className="flex items-center gap-1.5">
                            <div className="size-1 rounded-full bg-primary/60" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
