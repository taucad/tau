/** The desktop app sets no analytics cookies, so its Help menu offers no cookie preferences. */
export function CookiePreferencesMenuItem(_props: { readonly onSelect: () => void }): undefined {
  return undefined;
}

/** Desktop stand-in: renders nothing and imports no consent code. */
export function CookiePreferencesDialog(_props: {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): undefined {
  return undefined;
}
