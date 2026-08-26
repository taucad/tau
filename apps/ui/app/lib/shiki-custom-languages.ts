/* oxlint-disable no-restricted-imports, import/extensions -- Fumadocs config imports this module before app # aliases are active. */
import type { LanguageInput } from 'shiki';
import kclLang from './kcl-language/kcl-shiki-precompiled.js';
import openscadLang from './openscad-language/openscad-shiki-precompiled.js';
import stepfileLang from './stepfile-language/stepfile-shiki-precompiled.js';
import stlLang from './stl-language/stl-shiki-precompiled.js';
import sysmlLang from './sysml-language/sysml-shiki-precompiled.js';
import usdLang from './usd-language/usd-shiki-precompiled.js';

export const tauCustomShikiLanguages = [
  ...kclLang,
  ...openscadLang,
  ...stepfileLang,
  ...stlLang,
  ...sysmlLang,
  ...usdLang,
] as unknown as LanguageInput[];
