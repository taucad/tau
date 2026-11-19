import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/**
 * Where Tau's legal pages live for this client. The website that serves them depends on the deployment, which only
 * the host app knows, so the app supplies the links and the billing surfaces only ask for a page.
 */
export type BillingLegalLinks = {
  /**
   * Link to one of Tau's legal pages.
   *
   * @param page - Page and optional anchor, for example `terms#refunds`.
   * @returns The page's absolute URL, read when the link renders.
   */
  readonly legalUrl: (page: string) => string;
};

const BillingLegalLinksContext = createContext<BillingLegalLinks | undefined>(undefined);

/**
 * Provides the legal-page links to the billing surfaces below it.
 *
 * @param props - The host's links, and the surfaces that show them.
 * @returns The provider.
 */
export function BillingLegalLinksProvider({
  links,
  children,
}: {
  readonly links: BillingLegalLinks;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <BillingLegalLinksContext value={links}>{children}</BillingLegalLinksContext>;
}

/**
 * The legal-page links the host app provides.
 *
 * @returns The links from the nearest {@link BillingLegalLinksProvider}.
 */
export const useBillingLegalLinks = (): BillingLegalLinks => {
  const links = useContext(BillingLegalLinksContext);
  if (links === undefined) {
    throw new Error('BillingLegalLinksProvider is missing');
  }
  return links;
};
