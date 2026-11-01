import type { LanguageDescription, LanguageSupport } from '@codemirror/language';
import type { HighlightLanguage } from '#languages.js';
import { resolveHighlightLanguageId } from '#languages.js';

type Loader = () => Promise<LanguageSupport>;

/** Each language's parser, imported only when that language is first highlighted. */
const loaders: Readonly<Record<HighlightLanguage, Loader>> = {
  async bash() {
    const { bash } = await import('#bash/index.js');
    return bash();
  },
  async csharp() {
    const { csharp } = await import('#csharp/index.js');
    return csharp();
  },
  async javascript() {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript();
  },
  async jsx() {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ jsx: true });
  },
  async typescript() {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ typescript: true });
  },
  async tsx() {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ typescript: true, jsx: true });
  },
  async json() {
    const { json } = await import('@codemirror/lang-json');
    return json();
  },
  async jsonc() {
    const { jsonc } = await import('#jsonc/index.js');
    return jsonc();
  },
  async jsonl() {
    const { jsonl } = await import('#jsonc/index.js');
    return jsonl();
  },
  async kcl() {
    const { kcl } = await import('#kcl/index.js');
    return kcl();
  },
  async markdown() {
    const [{ markdown }, { LanguageDescription: languageDescription }] = await Promise.all([
      import('@codemirror/lang-markdown'),
      import('@codemirror/language'),
    ]);
    const descriptions = new Map<HighlightLanguage, LanguageDescription>();
    return markdown({
      // Fenced code resolves through the same registry, so a fence highlights like its own file.
      codeLanguages(info) {
        const language = resolveHighlightLanguageId(info.split(/\s/u)[0]);
        if (!language || language === 'markdown') {
          return null;
        }
        let description = descriptions.get(language);
        if (!description) {
          description = languageDescription.of({ name: language, load: async () => loadLanguage(language) });
          descriptions.set(language, description);
        }
        return description;
      },
    });
  },
  async openscad() {
    const { openscad } = await import('#openscad/index.js');
    return openscad();
  },
  async python() {
    const { python } = await import('@codemirror/lang-python');
    return python();
  },
  async stepfile() {
    const { stepfile } = await import('#stepfile/index.js');
    return stepfile();
  },
  async stl() {
    const { stl } = await import('#stl/index.js');
    return stl();
  },
  async sysml() {
    const { sysml } = await import('#sysml/index.js');
    return sysml();
  },
  async usd() {
    const { usd } = await import('#usd/index.js');
    return usd();
  },
  async yaml() {
    const { yaml } = await import('@codemirror/lang-yaml');
    return yaml();
  },
};

const loading = new Map<HighlightLanguage, Promise<LanguageSupport>>();
const loaded = new Map<HighlightLanguage, LanguageSupport>();

/** Load a language once; a failed import is forgotten so the next request retries it. */
export async function loadLanguage(language: HighlightLanguage): Promise<LanguageSupport> {
  let pending = loading.get(language);
  if (!pending) {
    pending = (async (): Promise<LanguageSupport> => {
      try {
        const support = await loaders[language]();
        loaded.set(language, support);
        return support;
      } catch (error) {
        loading.delete(language);
        throw error;
      }
    })();
    loading.set(language, pending);
  }
  return pending;
}

/** A language that has already loaded, for surfaces that must render synchronously. */
export function peekLanguage(language: HighlightLanguage): LanguageSupport | undefined {
  return loaded.get(language);
}
