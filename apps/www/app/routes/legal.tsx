import { Link } from 'react-router';
import { intro } from '#www/page-components.js';
import { legalDocuments } from '#www/legal.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export const content = (): React.JSX.Element => (
  <section className='band'>
    {intro({
      eyebrow: 'Legal',
      title: 'Legal documents',
      body: 'The terms, policies and notices that apply to the Tau website, the Tau app and Tau Desktop.',
    })}
    <div className='feature-grid'>
      {legalDocuments.map(({ slug, title, description }) => (
        <article className='cell' key={slug}>
          <h2>
            <Link to={`/legal/${slug}/`} prefetch='intent'>
              {title}
            </Link>
          </h2>
          <p>{description}</p>
        </article>
      ))}
    </div>
  </section>
);
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
