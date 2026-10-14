import { SiteLink } from '#www/site-link.js';
import { appOrigin } from '#www/environment.js';
import { sourceUrl } from '#www/content.js';
import { out, cta, intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'Get Tau',
      title: (
        <>
          Your browser
          <br />
          is the workshop.
        </>
      ),
      body: 'Design a part, verify its geometry and export files for your workshop, all at tau.new. Open your browser and start making progress.',
      aside: <div className='actions'>{cta('Open Tau in your browser', '/projects', 'download')}</div>,
    })}
    <div className='download-grid'>
      <article className='cell' data-platform-card='web'>
        <p className='kicker'>Available now</p>
        <h2>Browser</h2>
        <p>Chrome, Edge, Safari or Firefox on any computer. Seven browser kernels, AI, checks and export.</p>
        <SiteLink className='text-link' href={`${appOrigin}/projects`} data-event='cta' data-placement='download-web'>
          Open tau.new {out}
        </SiteLink>
      </article>
      <article className='cell' data-platform-card='desktop'>
        <p className='kicker'>In development</p>
        <h2>Tau Desktop</h2>
        <p data-platform-note>
          Local files, native kernels such as Build123d and PicoGK, and your own coding agents. No installer is
          published yet.
        </p>
        <SiteLink className='text-link' href={`${sourceUrl}/releases`} data-desktop-link>
          Watch releases on GitHub {out}
        </SiteLink>
      </article>
    </div>
  </section>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
