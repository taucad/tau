/**
 * The scroller a document page gets when nothing else scrolls it (D4.1, D4.8): `html, body { overflow: hidden }` means
 * the document never scrolls, so a wrapperless route, the root error page and any fallback document supply this box.
 * The inline axis scrolls too, as a safety net below the widths the product is designed for (D4.9).
 */
export const documentScrollClass = 'h-dvh overflow-x-auto overflow-y-auto';
