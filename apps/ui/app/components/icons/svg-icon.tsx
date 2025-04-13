import spriteSvg from './generated/sprite.svg';
import type { SvgIcons } from './generated/svg-icons.js';

export function SvgIcon({ id, ...properties }: React.SVGProps<SVGSVGElement> & { readonly id: SvgIcons }) {
  return (
    <svg {...properties} viewBox="0 0 56 56">
      <use href={`${spriteSvg}#${id}`} />
    </svg>
  );
}
