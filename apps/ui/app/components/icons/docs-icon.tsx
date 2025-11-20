import { icons } from 'lucide-react';
import { createElement } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SvgIcon } from '#components/icons/svg-icon.js';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';

type IconNamespace = 'lucide' | 'lib';

type IconId = string;

/**
 * Parse icon string in format "namespace:icon-id"
 * Examples: "lucide:ban", "lib:openscad"
 */
function parseIconString(iconString: string): { namespace: IconNamespace; id: IconId } | undefined {
  if (!iconString || iconString.trim() === '') {
    return undefined;
  }

  const parts = iconString.split(':');
  if (parts.length !== 2) {
    return undefined;
  }

  const [namespace, id] = parts;
  if (namespace !== 'lucide' && namespace !== 'lib') {
    return undefined;
  }

  if (!id || id.trim() === '') {
    return undefined;
  }

  return { namespace, id: id.trim() };
}

/**
 * Get Lucide icon component from icon name
 * Converts kebab-case to PascalCase (e.g., "ban" -> "Ban", "arrow-right" -> "ArrowRight")
 */
function getLucideIcon(iconName: string): LucideIcon | undefined {
  // Convert kebab-case to PascalCase
  const pascalCase = iconName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return icons[pascalCase as keyof typeof icons] as LucideIcon | undefined;
}

/**
 * DocIcon component that resolves icons from different namespaces
 *
 * Priority system:
 * 1. lucide: Resolve from Lucide icons
 * 2. lib: Resolve from SvgIcon sprite
 *
 * @param iconString - Icon identifier in format "namespace:icon-id"
 *                     Examples: "lucide:ban", "lib:openscad"
 * @param className - Optional CSS class name
 */
export function DocsIcon({
  iconString,
  className,
}: {
  readonly iconString: string;
  readonly className?: string;
}): React.JSX.Element | undefined {
  const parsed = parseIconString(iconString);

  if (!parsed) {
    return undefined;
  }

  const { namespace, id } = parsed;

  // Priority 1: Lucide icons
  if (namespace === 'lucide') {
    const LucideIconComponent = getLucideIcon(id);
    if (LucideIconComponent) {
      return createElement(LucideIconComponent, { className });
    }

    throw new Error(`Icon "${iconString}" not found in Lucide icons`);
  }

  // Priority 2: Library icons (SvgIcon sprite)
  return <SvgIcon id={id as SvgIcons} className={className} />;
}
