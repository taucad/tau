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
      eyebrow: 'Blog',
      title: 'Blog',
      body: 'Product updates and engineering posts from the Tau team.',
    })}
    {!hasArticles && (
      <div className='cell blog-empty'>
        <span className='blog-mark' aria-hidden='true'>
          τ
        </span>
        <div>
          <h2>No posts yet</h2>
          <p>Posts will appear here once they are published.</p>
          <SiteLink className='text-link' href={sourceUrl}>
            Follow development on GitHub {out}
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
