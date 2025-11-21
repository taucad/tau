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
 * @throws Error if icon string format is invalid
 */
function parseIconString(iconString: string): { namespace: IconNamespace; id: IconId } {
  if (!iconString || iconString.trim() === '') {
    throw new Error('Icon string is required. Format: "namespace:icon-id" (e.g., "lucide:file" or "lib:openscad")');
  }

  const parts = iconString.split(':');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid icon format: "${iconString}". Expected "namespace:icon-id" (e.g., "lucide:file" or "lib:openscad")`,
    );
  }

  const [namespace, id] = parts;

  if (namespace !== 'lucide' && namespace !== 'lib') {
    throw new Error(
      `Invalid namespace: "${namespace}". Must be "lucide" or "lib" (e.g., "lucide:file" or "lib:openscad")`,
    );
  }

  if (!id || id.trim() === '') {
    throw new Error(`Icon ID cannot be empty. Format: "${namespace}:icon-id" (e.g., "${namespace}:file")`);
  }

  return { namespace, id: id.trim() };
}

/**
 * Get Lucide icon component from icon name
 * Converts kebab-case to PascalCase (e.g., "ban" -> "Ban", "arrow-right" -> "ArrowRight").
 *
 * This conversion is done manually due to issues with the DynamicIcon component.
 *
 * @throws Error if icon is not found
 */
function getLucideIcon(iconName: string): LucideIcon {
  // Convert kebab-case to PascalCase
  const pascalCase = iconName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  const icon = icons[pascalCase as keyof typeof icons] as LucideIcon | undefined;

  if (!icon) {
    throw new Error(
      `Lucide icon "${iconName}" not found. Verify the icon exists at https://lucide.dev/icons/${iconName}`,
    );
  }

  return icon;
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
}): React.JSX.Element {
  const { namespace, id } = parseIconString(iconString);

  // Lucide icons
  if (namespace === 'lucide') {
    const LucideIconComponent = getLucideIcon(id);
    return createElement(LucideIconComponent, { className });
  }

  // Library icons (SvgIcon sprite)
  return <SvgIcon id={id as SvgIcons} className={className} />;
}
