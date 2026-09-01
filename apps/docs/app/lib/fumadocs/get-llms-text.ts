import type { InferPageType } from 'fumadocs-core/source';
import type { DocMethods } from 'fumadocs-mdx/runtime/types';
import { decodeHtmlEntities } from '#lib/fumadocs/decode-html-entities.js';
import { source } from '#lib/fumadocs/source.js';

export async function getLlmText(page: InferPageType<typeof source>): Promise<string> {
  const data = page.data as typeof page.data & Pick<DocMethods, 'getText'>;
  const processed = decodeHtmlEntities(await data.getText('processed'));

  // The frontmatter title is the page's only H1 — the body starts at `##`, so
  // that the rendered page does not print the title twice. Restating it here
  // gives the plain-text rendering the heading the body no longer carries.
  return `# ${page.data.title}
URL: ${page.url}

${processed}`;
}

type Section = {
  title: string;
  pages: Array<InferPageType<typeof source>>;
};

const formatSectionTitle = (slug: string): string => {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Generates a comprehensive reference document in the Stripe llms.txt style
 * This provides an overview of all documentation pages with links and descriptions
 */
export async function getLlmRefText({ siteTitle, siteUrl }: { siteTitle: string; siteUrl: string }): Promise<string> {
  const sections = new Map<string, Section>();

  for (const page of source.getPages()) {
    const pathParts = page.url.split('/').filter((part) => part.length > 0);
    const sectionKey = pathParts.length > 1 && pathParts[1] ? pathParts[1] : 'docs';
    const sectionTitle = sectionKey === 'docs' ? 'Documentation' : formatSectionTitle(sectionKey);

    let section = sections.get(sectionKey);
    if (section === undefined) {
      section = { title: sectionTitle, pages: [] };
      sections.set(sectionKey, section);
    }

    section.pages.push(page);
  }

  const output: string[] = [];

  output.push(`# ${siteTitle}`);

  for (const section of sections.values()) {
    if (section.pages.length === 0) {
      continue;
    }

    output.push('', `## ${section.title}`);

    for (const page of section.pages) {
      const { title } = page.data;
      const url = `${siteUrl}${page.url}`;
      const description = page.data.description ?? '';

      if (description) {
        output.push(`- [${title}](${url}): ${description}`);
      } else {
        output.push(`- [${title}](${url})`);
      }
    }
  }

  return output.join('\n');
}
