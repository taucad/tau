import spriteUrl from '@taucad/ui-kit/icons/generated/sprite.svg?url';
import { SvgSpriteLoader } from '@taucad/ui-kit/icons/svg-sprite-loader';

const spriteUrls = [spriteUrl];

/** Mounts the self-host icon set without cloud payment artwork. */
export function SvgSpriteMount(): React.JSX.Element {
  return <SvgSpriteLoader urls={spriteUrls} />;
}
