import { SVGProps } from 'react';
import spriteSvg from './generated/sprite.svg';
import type { SvgIcons } from './generated/svg-icons';

export const SvgIcon = ({ id, ...properties }: SVGProps<SVGSVGElement> & { id: SvgIcons }) => {
  return (
    <svg {...properties} viewBox="0 0 56 56">
      <use href={`${spriteSvg}#${id}`} />
    </svg>
  );
};
