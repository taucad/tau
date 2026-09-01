import { icons } from 'lucide-react';
import { createElement } from 'react';
import type { ReactElement } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';

const toPascalCase = (id: string): string =>
  id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/**
 * Resolves the content icon convention `lucide:<kebab-id> [tailwind classes…]`
 * (e.g. `lucide:blocks text-blue`) to a rendered lucide element. Unknown or
 * malformed strings resolve to `undefined` so the tree renders without an icon
 * instead of leaking the raw string into the sidebar.
 */
export function resolveDocsIcon(icon: string | undefined): ReactElement | undefined {
  if (icon === undefined) {
    return undefined;
  }
  const [head, ...classes] = icon.trim().split(/\s+/u);
  if (head === undefined || !head.startsWith('lucide:')) {
    return undefined;
  }
  const iconName = toPascalCase(head.slice('lucide:'.length));
  const iconComponents: Partial<Record<string, (typeof icons)[keyof typeof icons]>> = icons;
  const component = iconComponents[iconName];
  if (component === undefined) {
    return undefined;
  }
  const className = classes.join(' ');
  return createElement(component, className === '' ? {} : { className });
}

const resolveNodeIcon = <T extends { icon?: React.ReactNode }>(node: T): T =>
  typeof node.icon === 'string' ? { ...node, icon: resolveDocsIcon(node.icon) } : node;

const resolveItemIcons = (item: PageTree.Node): PageTree.Node => {
  if (item.type === 'folder') {
    return resolveNodeIcon({
      ...item,
      ...(item.index === undefined ? {} : { index: resolveNodeIcon(item.index) }),
      children: item.children.map((child) => resolveItemIcons(child)),
    });
  }
  return resolveNodeIcon(item);
};

/**
 * Replaces the raw `lucide:…` icon strings that survive loader serialization
 * with rendered lucide elements. React elements cannot travel through the
 * single-fetch stream, so icon resolution happens here in the component layer
 * rather than in the source loader.
 */
export function resolveTreeIcons(tree: PageTree.Root): PageTree.Root {
  return { ...tree, children: tree.children.map((child) => resolveItemIcons(child)) };
}
