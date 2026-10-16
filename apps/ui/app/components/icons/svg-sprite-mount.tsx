import spriteUrl from '#components/icons/generated/sprite.svg?url';
import paymentSpriteUrl from '#components/icons/generated/payment-sprite.svg?url';
import { SvgSpriteLoader } from '#components/icons/svg-sprite-loader.js';

const spriteUrls = [spriteUrl, paymentSpriteUrl];

/** Mounts the icon set and the cloud payment artwork at the app shell. */
export function SvgSpriteMount(): React.JSX.Element {
  return <SvgSpriteLoader urls={spriteUrls} />;
}
