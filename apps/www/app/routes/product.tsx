import { cta, intro, principleStrip, workspaceFigure, ecosystemGrid, closing } from '#www/page-components.js';
import { exampleModelPath } from '#www/content.js';
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
        aside: <div className='actions'>{cta('Open the gearbox', exampleModelPath, 'product')}</div>,
      })}
      <div className='cell'>{workspaceFigure('eager')}</div>
    </section>
    {principleStrip()}
    <section className='band feature-grid' aria-label='Workspace capabilities'>
      {[
        [
          'Start from code',
          'Write the CAD code yourself, or open an example and change it. An agent can edit that code. You can read every line.',
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
          'Export the file that kernel writes: STEP from a boundary-representation kernel, STL or 3MF where that kernel provides them. Keep the source and revision history to refine the design after making and using the part.',
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
