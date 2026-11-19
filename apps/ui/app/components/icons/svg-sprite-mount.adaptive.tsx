import { FundedSurface } from '#cloud/cloud-surface.js';
import { SvgSpriteMount as BaseSvgSpriteMount } from '#components/icons/svg-sprite-mount.self-host.js';

/** The base sprite is Core; the payment artwork arrives with the Cloud chunk while funded. */
export function SvgSpriteMount(): React.JSX.Element {
  return (
    <>
      <BaseSvgSpriteMount />
      <FundedSurface fallback={undefined} render={(cloud) => <cloud.PaymentSprite />} />
    </>
  );
}
