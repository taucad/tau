/**
 * Sign-up's domain typo hint (email bounce blueprint R11): a mistyped domain is the commonest hard bounce,
 * and the verification email is the first mail to any address. Only known misspellings of the largest
 * mailbox providers are corrected, never by edit distance: `mail.com` and `gmx.com` are real domains one
 * letter from others, and a wrong suggestion is worse than none.
 */
const correctionsByDomain: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    'gmail.com': [
      'gmial.com',
      'gmai.com',
      'gamil.com',
      'gmal.com',
      'gnail.com',
      'gmaill.com',
      'gmali.com',
      'gmil.com',
      'gmail.co',
      'gmail.con',
      'gmail.cm',
      'gmail.om',
      'gmail.cmo',
      'gmail.comm',
      'gmail.cpm',
      'gmail.vom',
      'gmail.xom',
      'gmailcom',
    ],
    'googlemail.com': ['googlemail.co', 'googlemail.con', 'googlemai.com', 'gogglemail.com'],
    'hotmail.com': [
      'hotmial.com',
      'hotmal.com',
      'hotmai.com',
      'hotmil.com',
      'hotmaill.com',
      'hotmail.co',
      'hotmail.con',
      'hotmail.cm',
      'homail.com',
    ],
    'outlook.com': [
      'outlok.com',
      'outllok.com',
      'outlook.co',
      'outlook.con',
      'outloo.com',
      'otlook.com',
      'outlookk.com',
    ],
    'yahoo.com': ['yaho.com', 'yahooo.com', 'yhaoo.com', 'yahoo.co', 'yahoo.con', 'yahoo.cm', 'yhoo.com'],
    'icloud.com': ['iclod.com', 'icoud.com', 'icloud.co', 'icloud.con', 'iclould.com', 'icluod.com'],
    'live.com': ['live.co', 'live.con'],
    'aol.com': ['aol.co', 'aol.con'],
    'proton.me': ['proton.m', 'protn.me'],
    'protonmail.com': ['protonmial.com', 'protonmal.com', 'protonmail.co', 'protonmail.con'],
  }).flatMap(([domain, typos]) => typos.map((typo) => [typo, domain] as const)),
);

/**
 * The address with its domain corrected, when the domain is a known misspelling.
 *
 * @param email - The address as typed.
 * @returns The corrected address, or `undefined` when there is nothing to suggest.
 */
export const suggestEmailDomain = (email: string): string | undefined => {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) {
    return undefined;
  }
  const domain = trimmed.slice(at + 1).toLowerCase();
  const correction = correctionsByDomain[domain];
  return correction === undefined ? undefined : `${trimmed.slice(0, at)}@${correction}`;
};
