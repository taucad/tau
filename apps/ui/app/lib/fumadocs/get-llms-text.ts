import { source } from '#lib/fumadocs/source.js';
import type { InferPageType } from 'fumadocs-core/source';

export async function getLLMText(page: InferPageType<typeof source>): Promise<string> {
  // @ts-expect-error - getText is not typed correctly
  const processed = await page.data.getText('processed');

  return `# ${page.data.title}
URL: ${page.url}

${processed}`;
}

/**
 * Generates a comprehensive reference document in the Stripe llms.txt style
 * This provides an overview of all documentation pages with links and descriptions
 */
export async function getLLMRefText({siteTitle, siteUrl}: {siteTitle: string, siteUrl: string}): Promise<string> {
  const pages = source.getPages();
  
  // Group pages by their path segments to create sections
  type Section = {
    title: string;
    pages: Array<InferPageType<typeof source>>;
  };
  
  const sections = new Map<string, Section>();
  
  for (const page of pages) {
    const pathParts = page.url.split('/').filter((part) => part.length > 0);
    
    let sectionKey = 'docs';
    let sectionTitle = 'Documentation';
    
    // If the page is nested (e.g., /docs/kernels/replicad)
    if (pathParts.length > 1 && pathParts[1]) {
      sectionKey = pathParts[1]; // e.g., 'kernels'
      // Capitalize and format the section title
      sectionTitle = sectionKey
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    if (!sections.has(sectionKey)) {
      sections.set(sectionKey, {
        title: sectionTitle,
        pages: [],
      });
    }
    
    const section = sections.get(sectionKey);
    if (section) {
      section.pages.push(page);
    }
  }
  
  // Build the output
  const output: string[] = [];
  
  output.push(`# ${siteTitle}`);
  
  for (const section of sections.values()) {
    if (section.pages.length === 0) {
      continue;
    }
    
    output.push('');
    output.push(`## ${section.title}`);
    
    for (const page of section.pages) {
      const title = page.data.title;
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
