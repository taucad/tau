import type { LanguageInput } from 'shiki';
import kclLang from '#kcl.js';
import openscadLang from '#openscad.js';
import stepfileLang from '#stepfile.js';
import stlLang from '#stl.js';
import sysmlLang from '#sysml.js';
import usdLang from '#usd.js';

/**
 * Every precompiled Tau CAD language grammar, ready to pass to Shiki's `langs` option.
 *
 * @public
 *
 * @example <caption>Highlight Tau CAD languages with Shiki</caption>
 * ```typescript
 * import { tauCustomShikiLanguages } from '@taucad/grammars';
 *
 * const shikiOptions = { langs: tauCustomShikiLanguages };
 * ```
 */
export const tauCustomShikiLanguages = [
  ...kclLang,
  ...openscadLang,
  ...stepfileLang,
  ...stlLang,
  ...sysmlLang,
  ...usdLang,
] as unknown as LanguageInput[];
