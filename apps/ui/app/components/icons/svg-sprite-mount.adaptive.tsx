import { CloudSurface } from '#cloud/cloud-surface.js';
import { useCloudFunded } from '#cloud/cloud-mode.js';
import { SvgSpriteMount as BaseSvgSpriteMount } from '#components/icons/svg-sprite-mount.self-host.js';

/** The base sprite is Core; the payment sprite arrives with the Cloud chunk (adaptive app deployment mode W5). */
export function SvgSpriteMount(): React.JSX.Element {
  const funded = useCloudFunded();
  return (
    <>
      <BaseSvgSpriteMount />
      <CloudSurface enabled={funded} fallback={undefined} render={() => undefined} />
    </>
  );
}
