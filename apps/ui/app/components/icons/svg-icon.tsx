import spriteSvg from '#components/icons/generated/sprite.svg';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';

export function SvgIcon({
  id,
  ...properties
}: React.SVGProps<SVGSVGElement> & { readonly id: SvgIcons }): React.JSX.Element {
  return (
    <svg {...properties} viewBox="0 0 56 56">
      <use href={`${spriteSvg}#${id}`} />
    </svg>
  );
}
