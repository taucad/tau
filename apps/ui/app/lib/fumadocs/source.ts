import { loader } from 'fumadocs-core/source';
import type { LoaderOutput, SourceConfig } from 'fumadocs-core/source';
import type { I18nConfig } from 'fumadocs-core/i18n';
import { create, docs } from '#lib/fumadocs/source.generated.js';

export const source: LoaderOutput<{
  source: SourceConfig;
  i18n: I18nConfig;
}> = loader({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- TODO: find a better way to type these.
  source: await create.sourceAsync(docs.doc, docs.meta),
  baseUrl: '/docs',
});
