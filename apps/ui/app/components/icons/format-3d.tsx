import type { ExportFormat } from '@taucad/types';
import { cn } from '#utils/ui.utils.js';
import { stringToColor } from '#utils/color.utils.js';

export function Format3D(properties: React.SVGProps<SVGSVGElement> & { extension: ExportFormat }): React.JSX.Element {
  const color = stringToColor(properties.extension);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 3 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide lucide-format-3d', properties.className)}
      {...properties}
    >
      {/* Main cube outline - clearer isometric design */}
      <path d="M6 9l6-3 6 3v6l-6 3-6-3V9z" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1.5" />

      {/* Top face of cube */}
      <path d="M6 9l6-3 6 3-6 3-6-3z" fill={color} fillOpacity="0.3" stroke={color} strokeWidth="1.5" />

      {/* Left face of cube */}
      <path d="M6 9v6l6 3V12l-6-3z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />

      {/* Right face of cube */}
      <path d="M12 12v6l6-3V9l-6 3z" fill={color} fillOpacity="0.4" stroke={color} strokeWidth="1.5" />

      {/* Extension text background */}
      <rect x="1" y="15" width="22" height="9" rx="2" fill="white" stroke={color} strokeWidth="1.5" />

      {/* Extension text */}
      <text
        x="12"
        y="22"
        fontSize="7"
        textAnchor="middle"
        fill={color}
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
        strokeWidth={0}
      >
        {properties.extension.toUpperCase()}
      </text>
    </svg>
  );
}
