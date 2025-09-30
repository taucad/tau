import { Link } from 'react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/page';
import { Button } from '#components/ui/button.js';
import type { Handle } from '#types/matches.types.js';
import { source } from '#lib/fumadocs/source.js';
import { type PageTree } from 'fumadocs-core/server';
import { toClientRenderer } from 'fumadocs-mdx/runtime/vite';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { docs } from '#lib/fumadocs/source.generated.js';
import type { Route } from './+types/route.js';
import { baseOptions } from '#lib/fumadocs/layout.shared.js';
import { RootProvider } from 'fumadocs-ui/provider/base';
import { ReactRouterProvider } from 'fumadocs-core/framework/react-router';
import { CodeBlock, Pre } from '#components/code-block.js';

export async function loader({ params }: Route.LoaderArgs) {
  const slugs = params['*'].split('/').filter((v) => v.length > 0);
  const page = source.getPage(slugs);
  if (!page) throw new Response('Not found', { status: 404 });

  return {
    path: page.path,
    tree: source.pageTree as Record<string, PageTree.Root>,
  };
}

export const handle: Handle = {
  breadcrumb(match) {
    const pathname = match.pathname;
    const pathSegments = pathname.split('/').filter((segment) => segment.length > 0);
    
    const breadcrumbs: React.ReactNode[] = [];
    let accumulatedPath = '';
    
    pathSegments.forEach((segment, index) => {
      accumulatedPath += `/${segment}`;
      
      const displayName = segment
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      breadcrumbs.push(
        <Button key={`breadcrumb-${index}`} asChild variant="ghost">
          <Link to={accumulatedPath}>{displayName}</Link>
        </Button>
      );
    });
    
    return breadcrumbs;
  },
  enableFloatingSidebar: true,
};

const renderer = toClientRenderer(
  docs.doc,
  ({ toc, default: Mdx, frontmatter }) => {
    return (
      <DocsPage toc={toc} tableOfContent={{ style: 'clerk', single: false }} >
        {/* @ts-expect-error - frontmatter is not typed correctly. */}
        <title>{frontmatter.title}</title>
        {/* @ts-expect-error - frontmatter is not typed correctly. */}
        <meta name="description" content={frontmatter.description} />
        {/* @ts-expect-error - frontmatter is not typed correctly. */}
        <DocsTitle>{frontmatter.title}</DocsTitle>
        {/* @ts-expect-error - frontmatter is not typed correctly. */}
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <Mdx components={{ 
            ...defaultMdxComponents, 
            pre: (props) => {
              // Extract language and title from className if available
              const className = props.className || '';
              const match = /language-(\w+)/.exec(className);
              const lang = match ? match[1] : '';
              const text = String(props.children).replace(/\n$/, '');

              return (
                <CodeBlock title={lang} text={text} showHeader={false} {...props}>
                  <Pre {...props} />
                </CodeBlock>
              );
            }
          }} />
        </DocsBody>
      </DocsPage>
    );
  },
);

export default function Page(props: Route.ComponentProps) {
  const { tree, path } = props.loaderData;
  const Content = renderer[path];

  return (
    <ReactRouterProvider>
      <RootProvider theme={{enabled: false}}>
        {/* @ts-expect-error - tree is not typed correctly. */}
        <DocsLayout {...baseOptions()} tree={tree as Record<string, PageTree.Root>}>
          {/* @ts-expect-error - Content is not typed */}
          <Content />
        </DocsLayout>
      </RootProvider>
    </ReactRouterProvider>
  );
}
