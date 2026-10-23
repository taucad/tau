import { File } from 'lucide-react';
import type { FileExtension } from '@taucad/types';
import { fileExtensionSet } from '@taucad/types/constants';
import { cn } from '@taucad/ui/utils/cn';
import { hashString } from '@taucad/utils/hash';

/** Multi-part extensions that win over their last segment: a sliced print container is a G-code program first. */
const compoundBadges: Readonly<Record<string, string>> = { 'gcode.3mf': 'gcode' };

/** Export-only text formats in the extension catalog; they carry no format badge. */
const textFormats: ReadonlySet<string> = new Set<FileExtension>(['csv', 'json', 'txt']);

/**
 * The badge colour of one extension: a hue from its hash at the design system's medium lightness, so every extension
 * keeps one colour wherever it is drawn.
 *
 * @param extension - The extension, without a dot.
 * @returns An OKLCH colour.
 */
const badgeColor = (extension: string): string =>
  `oklch(var(--l-medium) 0.2 ${Number.parseInt(hashString(extension), 36) % 360}deg)`;

/**
 * A CAD or mesh file format's badge: its extension in white on a rounded square of the extension's colour, as the
 * Tau app badges model files.
 *
 * @param properties - SVG properties, and the extension to show.
 * @returns The badge.
 * @public
 */
export function FormatBadge({
  extension,
  className,
  ...properties
}: React.SVGProps<SVGSVGElement> & {
  readonly extension: string;
}): React.JSX.Element {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      // The label can shrink below the UI policy's 12px minimum, so the badge names its format.
      role='img'
      aria-label={extension}
      className={cn('lucide lucide-format-3d', className)}
      {...properties}
    >
      <rect x='0' y='0' width='24' height='24' rx='5.25' fill={badgeColor(extension)} />
      <text
        ref={(element) => {
          if (!element) {
            return;
          }
          element.setAttribute('font-size', '11');
          if (typeof element.getComputedTextLength !== 'function') {
            return;
          }
          const width = element.getComputedTextLength();
          if (width > 20) {
            element.setAttribute('font-size', String((11 * 20) / width));
          }
        }}
        x='22'
        y='20'
        fontSize='11'
        textAnchor='end'
        fill='white'
        fontWeight='900'
        fontFamily='system-ui, -apple-system, sans-serif'
        letterSpacing='-1'
        style={{ textTransform: 'uppercase' }}
      >
        {extension}
      </text>
    </svg>
  );
}

/**
 * A file's icon from its name: the {@link FormatBadge} of a catalog model format, and a plain file icon otherwise.
 *
 * @param props - The file name or path, and the icon's classes.
 * @returns The icon.
 * @public
 */
export function FormatFileIcon({
  filename,
  className,
}: Readonly<{ filename: string; className?: string }>): React.JSX.Element {
  const name = filename.slice(filename.lastIndexOf('/') + 1).toLowerCase();
  const compound = Object.keys(compoundBadges).find((suffix) => name.endsWith(`.${suffix}`));
  if (compound !== undefined) {
    return <FormatBadge extension={compoundBadges[compound]!} className={className} />;
  }
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  return fileExtensionSet.has(extension as FileExtension) && !textFormats.has(extension) ? (
    <FormatBadge extension={extension} className={className} />
  ) : (
    <File className={className} />
  );
}
