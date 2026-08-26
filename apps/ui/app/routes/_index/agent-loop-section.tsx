import { MessageSquare, Code2, ShieldCheck, PackageCheck, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type LoopStep = {
  readonly icon: LucideIcon;
  readonly step: string;
  readonly title: string;
  readonly description: string;
};

const steps: LoopStep[] = [
  {
    icon: MessageSquare,
    step: '01',
    title: 'Describe',
    description: 'Say what you want in plain language — dimensions, tolerances, intent.',
  },
  {
    icon: Code2,
    step: '02',
    title: 'Generate',
    description: 'The agent writes real parametric CAD code and runs it in your browser.',
  },
  {
    icon: ShieldCheck,
    step: '03',
    title: 'Verify',
    description: 'Every result is measured against the spec — geometry checked, not guessed.',
  },
  {
    icon: PackageCheck,
    step: '04',
    title: 'Ship',
    description: 'Export to 14 formats, print it, machine it, or drop it into your assembly.',
  },
];

// Unbranded verification chips (OQ1: the homepage never names the test DSL).
const checks = ['Volume within spec', 'No part interference', 'Watertight mesh', 'Fits the print bed'];

/**
 * The core differentiator, told as the agent loop: describe → generate → verify
 * → ship. The verify step surfaces plain, passing geometry checks so the "trust"
 * claim is shown, not asserted.
 */
export function AgentLoopSection(): React.JSX.Element {
  return (
    <section className='border-b'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mx-auto mb-14 max-w-2xl text-center'>
          <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>Generated, then verified</h2>
          <p className='mt-4 text-muted-foreground'>
            Generation is the easy part. Tau closes the loop — it checks the geometry against your requirements on every
            iteration, so what you get is manufacturable, not just plausible.
          </p>
        </div>

        <div className='grid gap-6 md:grid-cols-4'>
          {steps.map((item) => (
            <div key={item.step} className='relative rounded-xl border bg-background p-6'>
              <div className='mb-4 flex items-center justify-between'>
                <div className='flex size-10 items-center justify-center rounded-lg bg-primary/10'>
                  <item.icon className='size-5 text-primary' />
                </div>
                <span className='font-mono text-sm text-muted-foreground/60'>{item.step}</span>
              </div>
              <h3 className='mb-1.5 font-semibold'>{item.title}</h3>
              <p className='text-sm text-muted-foreground'>{item.description}</p>
            </div>
          ))}
        </div>

        <div className='mt-10 flex flex-wrap items-center justify-center gap-3'>
          {checks.map((check) => (
            <div
              key={check}
              className='inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3.5 py-1.5 text-sm'
            >
              <Check className='size-3.5 text-primary' />
              {check}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
