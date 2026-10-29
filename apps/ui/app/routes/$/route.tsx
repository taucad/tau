import type { MetaFunction } from 'react-router';
import { PageNotFound, pageNotFoundTitle } from '#components/page-not-found.js';

export const meta: MetaFunction = () => [{ title: `${pageNotFoundTitle} · Tau` }];

export default function NotFoundPage(): React.JSX.Element {
  return <PageNotFound />;
}
