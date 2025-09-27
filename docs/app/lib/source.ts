import { loader } from 'fumadocs-core/source';
import { icons } from 'lucide-react';
import { create, docs } from '../../source.generated';
import { createElement } from 'react';

export const source = loader({
  source: await create.sourceAsync(docs.doc, docs.meta),
  baseUrl: '/docs',
  icon(icon) {
    if (!icon) {
      // You may set a default icon
      return;
    }
    if (icon in icons) return createElement(icons[icon as keyof typeof icons]);
  },
});
