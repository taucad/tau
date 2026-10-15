import { cta, intro, principleStrip, workspaceFigure, ecosystemGrid, closing } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <>
    <section className='band'>
      {intro({
        eyebrow: 'The Tau workspace',
        title: (
          <>
            Design a part.
            <br />
            Make it useful.
          </>
        ),
        body: 'Work from what the part needs to do. Editable CAD, dimensions you control and geometric checks help you prepare a design for the workshop.',
        aside: <div className='actions'>{cta('Start designing', '/projects/new', 'product')}</div>,
      })}
      <div className='cell'>{workspaceFigure('eager')}</div>
    </section>
    {principleStrip()}
    <section className='band feature-grid' aria-label='Workspace capabilities'>
      {[
        [
          'Describe your intent',
          'Describe where the part will fit and what it needs to do, or write the CAD code yourself. Work with the agent on a design you can inspect and edit.',
        ],
        [
          'Change the parameters',
          'Adjust dimensions, hole spacing and other named parameters as the design develops. Keep the source so you can return to a part and adapt it for its next job.',
        ],
        [
          'Test a requirement',
          'GeoSpec checks declared properties of the geometry: envelopes, solids, clearances and patterns. Each result states its scope; unsupported evidence is inconclusive.',
        ],
        [
          'Carry it into the workshop',
          'Export STEP for your CAM tools or manufacturer, and STL or 3MF for a slicer. Keep the source and revision history to refine the design after making and using the part.',
        ],
      ].map(([title, body]) => (
        <article key={title} className='cell'>
          <h2>{title}</h2>
          <p>{body}</p>
        </article>
      ))}
    </section>
    {ecosystemGrid()}
    <section className='band note-band'>
      <div className='cell'>
        <h2>Checks have a scope.</h2>
      </div>
      <div className='cell'>
        <p>
          Geometric checks do not certify strength, thermal behavior, materials or manufacturing readiness. Use
          appropriate analysis and physical validation for the work you are doing.
        </p>
      </div>
    </section>
    {closing()}
  </>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
