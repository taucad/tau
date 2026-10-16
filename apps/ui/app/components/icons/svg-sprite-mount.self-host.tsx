import spriteUrl from '#components/icons/generated/sprite.svg?url';
import { SvgSpriteLoader } from '#components/icons/svg-sprite-loader.js';

const spriteUrls = [spriteUrl];

/** Mounts the self-host icon set without cloud payment artwork. */
export function SvgSpriteMount(): React.JSX.Element {
  return <SvgSpriteLoader urls={spriteUrls} />;
}
