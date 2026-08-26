import { Box, Sigma, CircuitBoard, Cpu, Waves, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { metaConfig } from '#constants/meta.constants.js';

type Pillar = {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly status: 'live' | 'soon';
};

const pillars: Pillar[] = [
  { icon: Box, label: 'CAD', status: 'live' },
  { icon: Sigma, label: 'Analysis', status: 'soon' },
  { icon: Waves, label: 'Simulation', status: 'soon' },
  { icon: CircuitBoard, label: 'Electrical', status: 'soon' },
  { icon: Cpu, label: 'Firmware', status: 'soon' },
];

/**
 * Trajectory teaser: CAD is chapter one. Frames the five pillars connected by
 * code + agents + verification, and folds in the embeddable-components early
 * access from the legacy "coming soon" section.
 */
export function VisionSection(): React.JSX.Element {
  return (
    <section className='border-b bg-muted/20'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto mb-12 max-w-2xl text-center'>
          <div className='mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-medium'>
            <Sparkles className='size-4 text-primary' />
            The bigger picture
          </div>
          <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>CAD is chapter one</h2>
          <p className='mt-4 text-muted-foreground'>
            Hardware engineering is fragmented across disconnected tools. Tau connects the five pillars through code, AI
            agents, and verification — starting with geometry today.
          </p>
        </div>

        <div className='mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-3'>
          {pillars.map((pillar) => (
            <div
              key={pillar.label}
              className='flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm'
            >
              <pillar.icon className='size-4 text-primary' />
              <span className='font-medium'>{pillar.label}</span>
              <span
                className={
                  pillar.status === 'live'
                    ? 'rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary'
                    : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                }
              >
                {pillar.status === 'live' ? 'Live' : 'Soon'}
              </span>
            </div>
          ))}
        </div>

        <div className='mt-10 text-center text-sm text-muted-foreground'>
          Building embeddable CAD components or want early access to what&apos;s next?{' '}
          <a href={`mailto:${metaConfig.salesEmail}`} className='text-primary underline-offset-4 hover:underline'>
            Get in touch
          </a>
        </div>
      </div>
    </section>
  );
}
