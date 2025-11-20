import { Link } from 'react-router';
import type { MetaDescriptor } from 'react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { RootProvider } from 'fumadocs-ui/provider/react-router';
import { ReactRouterProvider } from 'fumadocs-core/framework/react-router';
import type * as PageTree from 'fumadocs-core/page-tree';
import browserCollections from 'fumadocs-mdx:collections/browser';
// eslint-disable-next-line no-restricted-imports -- allowed for route types
import type { Route } from './+types/route.js';
import { DocsPageActions } from '#routes/docs.$/docs-page-actions.js';
import { Button } from '#components/ui/button.js';
import type { Handle } from '#types/matches.types.js';
import { source } from '#lib/fumadocs/source.js';
import { baseOptions } from '#lib/fumadocs/layout.shared.js';
import { getLlmText } from '#lib/fumadocs/get-llms-text.js';
import { DocsSidebarProvider } from '#routes/docs.$/docs-sidebar.js';
import { getMdxComponents } from '#routes/docs.$/docs-mdx.js';
import { cn } from '#utils/ui.utils.js';

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- loaders are inferred types by design.
export async function loader({ params }: Route.LoaderArgs) {
  const path = params['*'];

  // If path ends with .mdx, redirect to /llms.mdx/ route
  if (path.endsWith('.mdx')) {
    const pathWithoutExtension = path.slice(0, -4);
    const redirectUrl = `/llms.mdx/${pathWithoutExtension}`;
    // Ideally this would be a URL rewrite to preserve the path, but that's not possible with react-router 7.
    // @see https://fumadocs.dev/docs/ui/llms
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- this is the react-router pattern.
    throw new Response(undefined, {
      status: 302,
      headers: {
        Location: redirectUrl,
      },
    });
  }

  const slugs = path.split('/').filter((v) => v.length > 0);
  const page = source.getPage(slugs);
  if (!page) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- this is the react-router pattern.
    throw new Response('Not found', { status: 404 });
  }

  const rawMarkdownContent = await getLlmText(page);

  return {
    path: page.path,
    url: page.url,
    tree: source.getPageTree(),
    page: {
      data: {
        title: page.data.title,
        description: page.data.description,
      },
    },
    rawMarkdownContent,
  };
}

export function meta({ loaderData }: Route.MetaArgs): MetaDescriptor[] {
  const { title, description } = loaderData.page.data;

  return [
    {
      title,
      description,
    },
  ];
}

export const handle: Handle = {
  breadcrumb(match) {
    const { pathname } = match;
    const pathSegments = pathname.split('/').filter((segment) => segment.length > 0);

    const breadcrumbs: React.ReactNode[] = [];
    let accumulatedPath = '';

    for (const [index, segment] of pathSegments.entries()) {
      accumulatedPath += `/${segment}`;

      const displayName = segment
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      breadcrumbs.push(
        <Button key={`breadcrumb-${index}`} asChild variant="ghost">
          <Link to={accumulatedPath}>{displayName}</Link>
        </Button>,
      );
    }

    return breadcrumbs;
  },
  enableFloatingSidebar: true,
  enableOverflowY: true,
};

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, default: Mdx, frontmatter }) {
    return (
      <DocsPage
        toc={toc}
        full={false}
        tableOfContent={{
          enabled: true,
          single: false,
          style: 'clerk',
          footer: <DocsPageActions />,
        }}
        article={{
          className: 'max-sm:pb-16 max-w-[770px]',
        }}
        container={{
          className: '[&>article]:gap-4',
        }}
        breadcrumb={{
          enabled: true,
        }}
      >
        <title>{frontmatter.title}</title>
        <meta name="description" content={frontmatter.description} />
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody
          className={cn(
            'prose w-full max-w-full text-sm text-foreground',
            'overflow-wrap-anywhere wrap-break-word hyphens-auto',
            '[--tw-prose-headings:text-foreground]',
            '[--tw-prose-bullets:text-foreground]',
            '[--tw-prose-bold:text-foreground]',
            '[--tw-prose-counters:text-foreground]',
            '[--tw-prose-lead:text-foreground]',
            '[--tw-prose-quotes:text-foreground]',
            '[--tw-prose-quote-borders:text-foreground]',
            '[--tw-prose-kbd:text-foreground]',
            '[--tw-prose-links:text-foreground]',
            '[--tw-prose-pre-bg:text-neutral/10]',
          )}
        >
          <Mdx components={getMdxComponents()} />
        </DocsBody>
      </DocsPage>
    );
  },
});

export default function Page(props: Route.ComponentProps): React.ReactNode {
  const { tree, path } = props.loaderData;
  const Content = clientLoader.getComponent(path);

  return (
    <DocsSidebarProvider>
      <ReactRouterProvider>
        <RootProvider theme={{ enabled: false }}>
          <DocsLayout {...baseOptions()} tree={tree as PageTree.Root}>
            <Content />
          </DocsLayout>
        </RootProvider>
      </ReactRouterProvider>
    </DocsSidebarProvider>
  );
}
