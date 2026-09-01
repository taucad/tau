import { cn } from '@taucad/ui/utils/cn';
import { stringToColor } from '#utils/color.utils.js';

export function Format3D(properties: React.SVGProps<SVGSVGElement> & { extension: string }): React.JSX.Element {
  const color = stringToColor(properties.extension);

  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      className={cn('lucide lucide-format-3d', properties.className)}
      {...properties}
    >
      {/* Background rectangle */}
      <rect x='0' y='0' width='24' height='24' rx='5.25' fill={color} />

      {/* Extension text */}
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
        {properties.extension}
      </text>
    </svg>
  );
}
