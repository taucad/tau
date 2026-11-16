import { useLayoutEffect, useRef } from 'react';
import { handOffScript } from '#components/hand-off/hand-off.js';
import { handOffStore, handOffSurfaces, useHandOffAdopted } from '#components/hand-off/hand-off-store.js';
import type { HandOffSurface } from '#components/hand-off/hand-off-store.js';

/** Attribute text for markup React does not build; every value here is a fixed string from the caller's source. */
const escapeAttribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * One placeholder's place for a surface's native input (P4).
 *
 * The input and its recorder are served as markup React does not own, so that the store can move the one element
 * from this slot to the next placeholder's without React removing or recreating it: a remount keeps the text, its
 * order, the caret and focus. A slot mounted on the client renders a stand-in the store replaces with the surface's
 * element before paint, or keeps as the element when nothing was served. Once the adopter has taken the input, a
 * slot renders nothing, so a later placeholder never offers a second one.
 *
 * @param props - The surface, the input's accessible name, placeholder and classes, and the slot's own classes.
 * @returns The slot.
 */
export function HandOffSlot({
  surface,
  label,
  placeholder,
  className,
  inputClassName,
}: {
  readonly surface: HandOffSurface;
  readonly label: string;
  readonly placeholder: string;
  readonly className?: string;
  readonly inputClassName?: string;
}): React.ReactNode {
  const adopted = useHandOffAdopted(surface);
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return undefined;
    }
    handOffStore.attach(surface, host);
    return () => {
      handOffStore.detach(surface, host);
    };
  }, [surface, adopted]);

  if (adopted) {
    return null;
  }
  const markup =
    `<textarea aria-label="${escapeAttribute(label)}" placeholder="${escapeAttribute(placeholder)}" rows="1"` +
    (inputClassName === undefined ? '' : ` class="${escapeAttribute(inputClassName)}"`) +
    `></textarea><script>${handOffScript('previous-sibling', handOffSurfaces[surface])}</script>`;
  return (
    <div
      ref={hostRef}
      className={className}
      data-hand-off={surface}
      // oxlint-disable-next-line react/no-danger -- Fixed markup with no interpolated input: the element must outlive this slot, so React must not own it.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
