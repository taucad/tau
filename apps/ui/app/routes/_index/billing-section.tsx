import { PlanCards } from '#components/billing/plan-cards.js';

/**
 * Landing-page pricing section (T7/U6): the `tauPlanCatalog` three-card grid
 * with signup / subscribe / contact CTAs. Inherits the `marketingLanding`
 * flag with the rest of the landing — no separate gate.
 */
export function BillingSection(): React.JSX.Element {
  return (
    <section id='pricing' className='border-b'>
      <div className='container mx-auto px-4 py-20'>
        <div className='mb-10 text-center'>
          <h2 className='text-3xl font-semibold tracking-tight md:text-4xl'>Simple, usage-based pricing</h2>
          <p className='mt-2 text-muted-foreground'>
            Start free. Pay only for the AI and hosted compute you actually use.
          </p>
        </div>
        <PlanCards />
      </div>
    </section>
  );
}
