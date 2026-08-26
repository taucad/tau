import { MessageSquare, Code2, Lock, SlidersHorizontal, Ruler } from 'lucide-react';
import { BorderBeam } from '#components/magicui/border-beam.js';
import { Safari } from '#components/magicui/safari.js';
import { metaConfig } from '#constants/meta.constants.js';
import tauDesktopDark from '#routes/_index/tau-desktop-dark.webp';
import tauDesktopLight from '#routes/_index/tau-desktop-light.webp';

const features = [
  {
    icon: MessageSquare,
    title: 'Chat to Create',
    description: 'Describe it, build it',
  },
  {
    icon: Code2,
    title: 'Code When Needed',
    description: 'Full control, always',
  },
  {
    icon: Lock,
    title: 'Own Your Work',
    description: 'No lock-in, ever',
  },
  {
    icon: SlidersHorizontal,
    title: 'Live Parameters',
    description: 'Instant updates',
  },
  {
    icon: Ruler,
    title: 'Smart Units',
    description: 'mm, in, ft — seamless',
  },
];

export function HeroImage(): React.JSX.Element {
  return (
    <div className='container mx-auto px-4 py-16'>
      <div className='mx-auto max-w-5xl'>
        {/* Feature Highlights */}
        <div className='mb-8 text-center'>
          <h2 className='text-2xl font-semibold tracking-tight md:text-3xl'>Design Faster. Build Smarter.</h2>
          <p className='mx-auto mt-3 max-w-2xl text-muted-foreground'>
            From idea to 3D model in seconds — chat, code, or both. Your choice.
          </p>
        </div>

        {/* Feature Pills */}
        <div className='mb-8 flex flex-wrap justify-center gap-3'>
          {features.map((feature) => (
            <div
              key={feature.title}
              className='flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm'
            >
              <feature.icon className='size-4 text-primary' />
              <span className='font-medium'>{feature.title}</span>
              <span className='hidden text-muted-foreground sm:inline'>— {feature.description}</span>
            </div>
          ))}
        </div>

        {/* Hero Image with Safari Frame */}
        <div className='relative'>
          <BorderBeam size={200} duration={12} colorFrom='hsl(var(--primary))' colorTo='hsl(var(--accent))' />
          <Safari mode='simple' imageSrc={tauDesktopLight} url={metaConfig.appDomain} className='dark:hidden' />
          <Safari mode='simple' imageSrc={tauDesktopDark} url={metaConfig.appDomain} className='hidden dark:block' />
        </div>
      </div>
    </div>
  );
}
