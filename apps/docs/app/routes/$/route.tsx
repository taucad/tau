import { useMemo } from 'react';
import type { LoaderFunctionArgs, MetaArgs, MetaDescriptor } from 'react-router';
import { redirect, useLoaderData } from 'react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import type * as PageTree from 'fumadocs-core/page-tree';
import { resolveTreeIcons } from '#lib/fumadocs/docs-icon.js';
import browserCollections from 'fumadocs-mdx:collections/browser';
import { DocsPageActions } from '#components/docs/page-actions.js';
import { getMdxComponents } from '#lib/fumadocs/mdx-components.js';
import { baseOptions } from '#lib/fumadocs/layout.shared.js';
import { siteOrigin, socialCardImage } from '#lib/site.js';
import { source } from '#lib/fumadocs/source.js';

type DocumentationLoaderData = {
  path: string;
  url: string;
  tree: PageTree.Root;
  title: string;
  description: string | undefined;
};

export async function loader({ params }: LoaderFunctionArgs): Promise<DocumentationLoaderData> {
  const path = params['*'] ?? '';

  if (path.endsWith('.mdx')) {
    // oxlint-disable-next-line @typescript-eslint/only-throw-error -- throwing redirects is the React Router loader contract.
    throw redirect(`/_llms/${path.slice(0, -4)}.txt`, 302);
  }

  const slugs = path.split('/').filter((segment) => segment.length > 0);
  if (slugs.length === 0) {
    // oxlint-disable-next-line @typescript-eslint/only-throw-error -- throwing redirects is the React Router loader contract.
    throw redirect('/runtime', 302);
  }

  const page = source.getPage(slugs);
  if (!page) {
    // oxlint-disable-next-line @typescript-eslint/only-throw-error -- Response is React Router's typed 404 boundary value.
    throw new Response('Not found', { status: 404 });
  }

  return {
    path: page.path,
    url: page.url,
    tree: source.getPageTree(),
    title: page.data.title,
    description: page.data.description,
  };
}

export function meta({ loaderData }: MetaArgs<typeof loader>): MetaDescriptor[] {
  if (!loaderData) {
    return [{ title: 'Not found · Tau Docs' }];
  }

  const title = `${loaderData.title} · Tau Docs`;
  const description = loaderData.description ?? 'Tau documentation';

  // React Router takes the deepest route's meta wholesale rather than merging,
  // so the social-card tags from the root have to be restated here or every
  // documentation URL shares as a bare link.
  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:type', content: 'article' },
    { property: 'og:site_name', content: 'Tau Docs' },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: `${siteOrigin}${loaderData.url}` },
    { property: 'og:image', content: socialCardImage },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: socialCardImage },
  ];
}

const mdxComponents = getMdxComponents();

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, default: Mdx, frontmatter }) {
    return (
      <DocsPage
        toc={toc}
        tableOfContent={{
          enabled: true,
          single: false,
          style: 'clerk',
          footer: <DocsPageActions />,
        }}
        breadcrumb={{ enabled: true }}
      >
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody className='text-base text-foreground [&_code]:text-sm [&_table]:tabular-nums'>
          <Mdx components={mdxComponents} />
        </DocsBody>
      </DocsPage>
    );
  },
});

export default function DocumentationPage(): React.JSX.Element {
  const loaderData = useLoaderData<typeof loader>();
  const tree = useMemo(() => resolveTreeIcons(loaderData.tree), [loaderData.tree]);

  return (
    <DocsLayout {...baseOptions()} tree={tree}>
      {clientLoader.useContent(loaderData.path)}
    </DocsLayout>
  );
}
