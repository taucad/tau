import sprite from '#components/icons/generated/sprite.svg?raw';

/** Mounts the self-host icon set without cloud payment artwork. */
export function SvgSpriteMount(): React.JSX.Element {
  return (
    <div
      aria-hidden
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      // oxlint-disable-next-line react/no-danger -- trusted build-generated sprite asset
      dangerouslySetInnerHTML={{ __html: sprite }}
    />
  );
}
