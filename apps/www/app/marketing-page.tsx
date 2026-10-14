import { Link, useLoaderData, useRouteLoaderData } from 'react-router';
import type { loader } from '#app/route-loader.server.js';
import type { loader as rootLoader } from '#app/root.js';
export function MarketingPage({ children }: { children?: React.ReactNode }): React.JSX.Element {
  const { path, title, description, article, articles } = useLoaderData<typeof loader>();
  const configuration = useRouteLoaderData<typeof rootLoader>('root');
  const canonical = configuration?.origin ? `${configuration.origin}${path}` : undefined;
  const structured = {
    '@context': 'https://schema.org',
    '@type': article ? 'BlogPosting' : path === '/' ? 'WebSite' : 'WebPage',
    name: title,
    description,
    url: canonical,
    ...(article
      ? {
          headline: article.title,
          datePublished: article.date,
          author: { '@type': 'Person', name: article.author },
        }
      : {}),
  };
  return (
    <>
      <title>{title}</title>
      <meta name='description' content={description} />
      <meta name='robots' content={configuration?.launch ? 'index,follow' : 'noindex,nofollow'} />
      {canonical ? <link rel='canonical' href={canonical} /> : null}
      <meta property='og:type' content={article ? 'article' : 'website'} />
      <meta property='og:title' content={title} />
      <meta property='og:description' content={description} />
      <meta property='og:site_name' content='Tau' />
      <meta name='twitter:card' content='summary_large_image' />
      {canonical ? (
        <>
          <meta property='og:url' content={canonical} />
          <meta property='og:image' content={`${configuration?.origin}/_www/assets/social.png`} />
          <meta property='og:image:alt' content='Tau — editable parametric CAD' />
        </>
      ) : null}
      <script
        type='application/ld+json'
        nonce={configuration?.nonce}
        // oxlint-disable-next-line react/no-danger -- JSON serialization escapes HTML delimiters before emitting structured metadata.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structured).replaceAll('<', String.raw`\u003c`),
        }}
      />
      {children}
      {articles.length > 0 ? (
        <section className='feature-grid' aria-label='Published articles'>
          {articles.map((entry) => (
            <article className='cell' key={entry.slug}>
              <h2>
                <Link to={`/blog/${entry.slug}/`} prefetch='intent'>
                  {entry.title}
                </Link>
              </h2>
              <p>{entry.description}</p>
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
