import type { ExportFormat } from '@taucad/types';
import { cn } from '#utils/ui.utils.js';
import { stringToColor } from '#utils/color.utils.js';

export function Format3D(properties: React.SVGProps<SVGSVGElement> & { extension: ExportFormat }): React.JSX.Element {
  const color = stringToColor(properties.extension);
  // Pad extension to 3 characters, right-aligned (e.g., "TS " for TypeScript style)
  const paddedExtension = properties.extension.toUpperCase().padStart(3, ' ');

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      className={cn('lucide lucide-format-3d', properties.className)}
      {...properties}
    >
      {/* Background rectangle */}
      <rect x="0" y="0" width="24" height="24" rx="2" fill={color} />

      {/* Extension text */}
      <text
        x="23"
        y="23.5"
        fontSize="9.5"
        textAnchor="end"
        fill="white"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="-1"
      >
        {paddedExtension}
      </text>
    </svg>
  );
}
