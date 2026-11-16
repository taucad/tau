import { useLayoutEffect, useRef, useState } from 'react';
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
 * The markup is fixed when the slot mounts, so a render never replaces the retained element: a change to the label,
 * placeholder or input classes is applied to the element itself. The `scope` names whom the text is for (the
 * project), so a slot for another one starts with an empty input instead of the last one's text.
 *
 * @param props - The surface and scope, the input's accessible name, placeholder and classes, and the slot's classes.
 * @returns The slot.
 */
export function HandOffSlot({
  surface,
  scope,
  label,
  placeholder,
  className,
  inputClassName,
}: {
  readonly surface: HandOffSurface;
  readonly scope: string;
  readonly label: string;
  readonly placeholder: string;
  readonly className?: string;
  readonly inputClassName?: string;
}): React.ReactNode {
  const adopted = useHandOffAdopted({ surface, scope });
  const hostRef = useRef<HTMLDivElement>(null);

  const [markup] = useState(() => ({
    __html:
      `<textarea aria-label="${escapeAttribute(label)}" placeholder="${escapeAttribute(placeholder)}" rows="1"` +
      (inputClassName === undefined ? '' : ` class="${escapeAttribute(inputClassName)}"`) +
      `></textarea><script>${handOffScript('previous-sibling', handOffSurfaces[surface])}</script>`,
  }));

  useLayoutEffect(() => {
    const host = hostRef.current;
    /* Once adopted the slot renders nothing; this run's cleanup let the last host go. */
    if (host === null || adopted) {
      return undefined;
    }
    handOffStore.attach({ surface, scope }, host);
    return () => {
      handOffStore.detach(surface, host);
    };
  }, [surface, scope, adopted]);

  useLayoutEffect(() => {
    const input = hostRef.current?.querySelector('textarea');
    if (input === null || input === undefined) {
      return;
    }
    input.setAttribute('aria-label', label);
    input.placeholder = placeholder;
    if (inputClassName === undefined) {
      input.removeAttribute('class');
    } else {
      input.className = inputClassName;
    }
  }, [label, placeholder, inputClassName]);

  if (adopted) {
    return null;
  }
  return (
    <div
      ref={hostRef}
      className={className}
      data-hand-off={surface}
      // oxlint-disable-next-line react/no-danger -- Fixed markup with no interpolated input: the element must outlive this slot, so React must not own it.
      dangerouslySetInnerHTML={markup}
    />
  );
}
