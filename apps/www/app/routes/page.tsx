import { useLoaderData } from 'react-router';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
import { MarketingPage } from '#app/marketing-page.js';
import { PublishedArticleContent } from '#www/page-components.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;

export default function ArticlePage(): React.JSX.Element {
  const { article } = useLoaderData<typeof loader>();
  return <MarketingPage>{article ? <PublishedArticleContent article={article} /> : null}</MarketingPage>;
}
