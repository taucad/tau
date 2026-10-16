import { data } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import terms from '#content/legal/terms.md?raw';
import privacy from '#content/legal/privacy.md?raw';
import cookies from '#content/legal/cookies.md?raw';
import acceptableUse from '#content/legal/acceptable-use.md?raw';
import subprocessors from '#content/legal/subprocessors.md?raw';
import openSource from '#content/legal/open-source.md?raw';
import { legalDocuments } from '#www/legal.js';
import type { LegalSlug } from '#www/legal.js';

const sources: Record<LegalSlug, string> = {
  terms,
  privacy,
  cookies,
  'acceptable-use': acceptableUse,
  subprocessors,
  'open-source': openSource,
};

/**
 * Heading fragment ids, kept identical to the ones the app's former legal routes minted so existing links
 * such as `/legal/privacy#9.2.1-ai-service-improvement` keep resolving.
 * @param text - Heading text.
 * @returns The fragment id.
 */
export const slugify: (text: string) => string = (text) =>
  text
    .toLowerCase()
    .trim()
    .replaceAll(/[^\s\w.-]/gu, '')
    .replaceAll(/\s+/gu, '-')
    .replaceAll('.-', '-')
    .replaceAll('-.', '-')
    .replaceAll(/--+/gu, '-');

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" };
const plainText = (html: string): string =>
  html
    .replaceAll(/<[^>]*>/gu, '')
    .replaceAll(/&(amp|lt|gt|quot|#x27|#39);/gu, (_match, name: string) => entities[name] ?? '');

/**
 * Anchor every section heading and let wide tables scroll inside a keyboard-reachable region instead of the page.
 * The input is the serializer's own output for repository-owned Markdown, so its tags are regular.
 * @param html - Rendered document body.
 * @returns The body with heading ids and table regions.
 */
const decorate = (html: string): string =>
  html
    .replaceAll(
      /<h([2-6])>([\s\S]*?)<\/h\1>/gu,
      (_match, level: string, inner: string) => `<h${level} id="${slugify(plainText(inner))}">${inner}</h${level}>`,
    )
    .replaceAll('<table>', '<div class="table-scroll" tabindex="0"><table>')
    .replaceAll('</table>', '</table></div>');

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify);
const rendered = new Map<LegalSlug, { title: string; html: string }>();

/**
 * Render a legal source: its leading ATX title becomes the page heading and the rest becomes trusted HTML.
 * @param slug - Document identifier.
 * @returns The title and body HTML.
 */
export const renderLegalDocument: (slug: LegalSlug) => { title: string; html: string } = (slug) => {
  const cached = rendered.get(slug);
  if (cached) {
    return cached;
  }
  const source = sources[slug];
  const titleEnd = source.indexOf('\n');
  const result = {
    title: source.slice(2, titleEnd).trim(),
    html: decorate(String(processor.processSync(source.slice(titleEnd + 1)))),
  };
  rendered.set(slug, result);
  return result;
};

// oxlint-disable-next-line typescript/explicit-module-boundary-types -- React Router derives serialized route data from the loader.
export function loader({ params }: LoaderFunctionArgs) {
  const document = legalDocuments.find(({ slug }) => slug === params['document']);
  if (!document) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router turns thrown Responses into HTTP error boundaries.
    throw new Response('Page not found', { status: 404 });
  }
  const { title, html } = renderLegalDocument(document.slug);
  return data({
    path: `/legal/${document.slug}/`,
    title: `${document.title} · Tau`,
    description: document.description,
    heading: title,
    html,
    article: undefined,
    articles: [],
  });
}
