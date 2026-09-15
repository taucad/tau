import sprite from '#components/icons/generated/sprite.svg?raw';
import paymentSprite from '#components/icons/generated/payment-sprite.svg?raw';

/**
 * Inlines the generated SVG icon sprite once at the app shell so every
 * `<SvgIcon>` `<use href="#id" />` resolves as a same-document reference.
 *
 * This avoids the cross-document `<use href="external.svg#id">` fragment path
 * where Safari (and other engines, less aggressively) silently drop
 * `<filter>`, `<mask>`, `<clipPath>`, and `<linearGradient>` definitions from
 * the instantiated shadow tree, breaking icons such as `opencascadejs`,
 * `meta`, and `autodesk`.
 */
export function SvgSpriteMount(): React.JSX.Element {
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      // oxlint-disable-next-line react/no-danger -- trusted build-generated sprite asset
      dangerouslySetInnerHTML={{ __html: `${sprite}${paymentSprite}` }}
    />
  );
}
