import { source } from '#lib/fumadocs/source.js';
import type { InferPageType } from 'fumadocs-core/source';

export async function getLLMText(page: InferPageType<typeof source>) {
  // @ts-expect-error - getText is not typed correctly
  const processed = await page.data.getText('processed');

  return `# ${page.data.title}
URL: ${page.url}

${processed}`;
}
