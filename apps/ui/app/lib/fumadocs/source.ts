import { loader } from 'fumadocs-core/source';
import type { LoaderOutput, SourceConfig } from 'fumadocs-core/source';
import type { I18nConfig } from 'fumadocs-core/i18n';
import { docs } from 'fumadocs-mdx:collections/server';

export const source: LoaderOutput<{
  source: SourceConfig;
  i18n: I18nConfig;
}> = loader({
  source: docs.toFumadocsSource(),
  baseUrl: '/docs',
});
