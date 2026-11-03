import { SiteLink } from '#www/site-link.js';
import { appOrigin } from '#www/environment.js';
import { out, intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: '404',
      title: 'Page not found',
      body: 'This page may have moved or no longer exists.',
      aside: (
        <div className='actions'>
          <SiteLink className='button primary' href='/'>
            Go to the homepage
          </SiteLink>
          <SiteLink className='text-link' href={`${appOrigin}/projects`}>
            Open projects {out}
          </SiteLink>
        </div>
      ),
    })}
  </section>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
