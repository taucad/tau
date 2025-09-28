import { loader, type LoaderOutput, type SourceConfig } from 'fumadocs-core/source';
import { icons } from 'lucide-react';
import { create, docs } from '#lib/fumadocs/source.generated.js';
import { createElement } from 'react';
import type { I18nConfig } from 'fumadocs-core/i18n';

export const source: LoaderOutput<{
  source: SourceConfig;
  i18n: I18nConfig;
}> = loader({
  source: await create.sourceAsync(docs.doc, docs.meta),
  baseUrl: '/docs',
  icon(icon) {
    if (!icon) {
      // You may set a default icon
      return;
    }
    if (icon in icons) {
      return createElement(icons[icon as keyof typeof icons]);
    };

    return;
  },
});
