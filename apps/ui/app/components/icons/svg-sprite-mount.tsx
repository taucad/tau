import spriteUrl from '@taucad/ui-kit/icons/generated/sprite.svg?url';
import paymentSpriteUrl from '@taucad/ui-kit/icons/generated/payment-sprite.svg?url';
import { SvgSpriteLoader } from '@taucad/ui-kit/icons/svg-sprite-loader';

const spriteUrls = [spriteUrl, paymentSpriteUrl];

/** Mounts the icon set and the cloud payment artwork at the app shell. */
export function SvgSpriteMount(): React.JSX.Element {
  return <SvgSpriteLoader urls={spriteUrls} />;
}
