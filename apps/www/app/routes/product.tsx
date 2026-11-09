import { cta, intro, principleStrip, workspaceFigure, ecosystemGrid, closing } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <>
    <section className='band'>
      {intro({
        eyebrow: 'Product',
        title: 'Code-based CAD with an AI agent',
        body: 'Describe a part or write the CAD code yourself. Tau keeps the model as editable source, checks its geometry against the requirements you set and exports STEP, STL and 3MF.',
        aside: <div className='actions'>{cta('Start designing', '/projects/new', 'product')}</div>,
      })}
      <div className='cell'>{workspaceFigure('eager')}</div>
    </section>
    {principleStrip()}
    <section className='band feature-grid' aria-label='Workspace capabilities'>
      {[
        [
          'Describe the part',
          'Tell the agent what the part is for and where it fits, or write the code yourself. Either way, the result is source code you can read and edit.',
        ],
        [
          'Edit parameters',
          'Change dimensions, hole spacing and other named parameters at any time. The model rebuilds from the source.',
        ],
        [
          'Check the geometry',
          'GeoSpec checks the requirements you declare, such as bounding envelopes, solid counts, clearances and hole patterns. Anything GeoSpec cannot measure is reported as inconclusive, not as a pass.',
        ],
        [
          'Export for manufacturing',
          'Export STEP for CAM software or a manufacturer, and STL or 3MF for a slicer. The source and revision history stay with the project.',
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
        <h2>What geometry checks cover</h2>
      </div>
      <div className='cell'>
        <p>
          GeoSpec checks geometry only. It does not assess strength, thermal behavior, materials or whether a part is
          ready to manufacture. Use the appropriate analysis and physical testing for those.
        </p>
      </div>
    </section>
    {closing()}
  </>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
