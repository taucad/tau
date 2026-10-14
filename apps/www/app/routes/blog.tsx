import { SiteLink } from '#www/site-link.js';
import { sourceUrl } from '#www/content.js';
import { out, intro } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { useLoaderData } from 'react-router';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (hasArticles = false): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'The Tau blog',
      title: (
        <>
          Notes from
          <br />
          the workbench.
        </>
      ),
      body: 'Notes on designing useful parts, checking the details and taking ideas into the workshop.',
    })}
    {!hasArticles && (
      <div className='cell blog-empty'>
        <span className='blog-mark' aria-hidden='true'>
          τ
        </span>
        <div>
          <h2>The first notes are taking shape.</h2>
          <p>Human-authored product and engineering stories will appear here after review.</p>
          <SiteLink className='text-link' href={sourceUrl}>
            Follow the code {out}
          </SiteLink>
        </div>
      </div>
    )}
    <div id='articles' />
  </section>
);
export default function Page(): React.JSX.Element {
  const { articles } = useLoaderData<typeof loader>();
  return <MarketingPage>{content(articles.length > 0)}</MarketingPage>;
}
