import spriteSvg from '#components/icons/generated/sprite.svg';
import type { SvgIcons } from '#components/icons/generated/svg-icons.js';

const iconAliases: Record<string, SvgIcons> = {
  manifold: 'typescript',
};

export function SvgIcon({
  id,
  ...properties
}: React.SVGProps<SVGSVGElement> & { readonly id: string }): React.JSX.Element {
  const resolvedIconId = iconAliases[id] ?? (id as SvgIcons);

  return (
    <svg {...properties} viewBox="0 0 56 56">
      <use href={`${spriteSvg}#${resolvedIconId}`} />
    </svg>
  );
}
