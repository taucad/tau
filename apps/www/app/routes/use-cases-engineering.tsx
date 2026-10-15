import { useCases } from '#www/content.js';
import { UseCase } from '#www/page-components.js';
import { MarketingPage } from '#app/marketing-page.js';
import { loader as loadMarketingPage } from '#app/route-loader.server.js';
export const loader: typeof loadMarketingPage = loadMarketingPage;
export const content = (): React.JSX.Element => <UseCase item={useCases[1]!} />;
export default function Page(): React.JSX.Element {
  return <MarketingPage>{content()}</MarketingPage>;
}
