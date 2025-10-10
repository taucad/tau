import { Link } from 'react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import type { PageTree } from 'fumadocs-core/server';
import { toClientRenderer } from 'fumadocs-mdx/runtime/vite';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { RootProvider } from 'fumadocs-ui/provider/base';
import { ReactRouterProvider } from 'fumadocs-core/framework/react-router';
// eslint-disable-next-line no-restricted-imports -- allowed for route types
import type { Route } from './+types/route.js';
import { DocsPageActions } from '#routes/docs.$/docs-page-actions.js';
import { DocsCodeBlock } from '#routes/docs.$/docs-codeblock.js';
import { Button } from '#components/ui/button.js';
import type { Handle } from '#types/matches.types.js';
import { source } from '#lib/fumadocs/source.js';
import { docs } from '#lib/fumadocs/source.generated.js';
import { baseOptions } from '#lib/fumadocs/layout.shared.js';
import { InlineCode, Pre } from '#components/code/code-block.js';
import { getLlmText } from '#lib/fumadocs/get-llms-text.js';
import { DocsSidebarProvider } from '#routes/docs.$/docs-sidebar.js';

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- required to provide module boundary type.
    tree: source.pageTree as Record<string, PageTree.Root>,
    page: {
      data: {
        title: page.data.title,
        description: page.data.description,
      },
    },
    rawMarkdownContent,
  };
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- docs.doc is not typed correctly.
const renderer = toClientRenderer(docs.doc, ({ toc, default: Mdx, frontmatter }) => {
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
      {/* @ts-expect-error - frontmatter is not typed correctly. */}
      <title>{frontmatter.title}</title>
      {/* @ts-expect-error - frontmatter is not typed correctly. */}
      <meta name="description" content={frontmatter.description as string} />
      {/* @ts-expect-error - frontmatter is not typed correctly. */}
      <DocsTitle>{frontmatter.title}</DocsTitle>
      {/* @ts-expect-error - frontmatter is not typed correctly. */}
      <DocsDescription>{frontmatter.description}</DocsDescription>
      <DocsBody>
        <Mdx
          components={{
            ...defaultMdxComponents,
            pre(props) {
              // Extract language and title from className if available
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- props is not typed correctly.
              const className = props.className ?? '';
              const match = /language-(\w+)/.exec(className as string);
              const language = match ? match[1] : '';
              const text = String(props.children).replace(/\n$/, '');

              return (
                <DocsCodeBlock title={language} text={text}>
                  <Pre {...props} language={language} />
                </DocsCodeBlock>
              );
            },
            code(properties) {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- properties is not typed correctly.
              const { children, className, ref, node, style, ...rest } = properties;

              // Only render InlineCode for inline code (strings)
              if (typeof children === 'string') {
                return (
                  <InlineCode {...rest} className={className as string}>
                    {children}
                  </InlineCode>
                );
              }

              return (
                <code {...rest} className={className as string}>
                  {children}
                </code>
              );
            },
          }}
        />
      </DocsBody>
    </DocsPage>
  );
});

export default function Page(props: Route.ComponentProps): React.ReactNode {
  const { tree, path } = props.loaderData;
  const Content = renderer[path];

  return (
    <DocsSidebarProvider>
      <ReactRouterProvider>
        <RootProvider theme={{ enabled: false }}>
          {/* @ts-expect-error - tree is not typed correctly. */}
          <DocsLayout {...baseOptions()} tree={tree as Record<string, PageTree.Root>}>
            {/* @ts-expect-error - Content is not typed */}
            <Content />
          </DocsLayout>
        </RootProvider>
      </ReactRouterProvider>
    </DocsSidebarProvider>
  );
}
