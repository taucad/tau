/**
 * A prompt section in the registry. Sections with `cacheBreak: false` are
 * collected into the static (globally cacheable) prompt; those with
 * `cacheBreak: true` go into the dynamic (per-request) prompt.
 *
 * The static/dynamic partitioning lets the model provider keep a long-lived
 * cache hit on the stable portion of the system prompt while the per-request
 * tail (timestamps, environment, git status, etc.) is composed fresh.
 *
 * @public
 */
export type PromptSection = {
  name: string;
  compute: () => string;
  cacheBreak: boolean;
};

/**
 * Per-section telemetry observation emitted by `resolve({ onSectionResolved })`.
 * Wired by `chat.service.ts` to the `gen_ai.prompt.section.size`
 * histogram so we can see byte budgets per section and which sections break
 * the cache.
 *
 * @public
 */
export type ResolvedSection = {
  name: string;
  cacheBreak: boolean;
  byteSize: number;
};

/** Options for observing prompt section resolution. @public */
export type ResolveOptions = {
  /**
   * Invoked once per non-empty section, in registration order, with the
   * section name, its cache class, and the UTF-8 byte length of its resolved
   * body. Empty sections are skipped — they don't contribute bytes to the
   * assembled prompt and would only add noise to the histogram.
   */
  onSectionResolved?: (resolved: ResolvedSection) => void;
};

/**
 * Creates a section registry that partitions prompt sections into static
 * (globally cacheable) and dynamic (per-request) buckets.
 *
 * @public
 */
export type SectionRegistry = {
  register: (section: PromptSection) => void;
  resolve: (options?: ResolveOptions) => { static: string; dynamic: string };
};

/** Creates a prompt-section registry. @public */
export function createSectionRegistry(): SectionRegistry {
  const sections: PromptSection[] = [];

  return {
    register(section: PromptSection): void {
      sections.push(section);
    },

    resolve(options?: ResolveOptions): { static: string; dynamic: string } {
      const staticParts: string[] = [];
      const dynamicParts: string[] = [];

      for (const section of sections) {
        const value = section.compute();

        if (!value) {
          continue;
        }

        if (options?.onSectionResolved) {
          options.onSectionResolved({
            name: section.name,
            cacheBreak: section.cacheBreak,
            byteSize: new TextEncoder().encode(value).byteLength,
          });
        }

        if (section.cacheBreak) {
          dynamicParts.push(value);
        } else {
          staticParts.push(value);
        }
      }

      return {
        static: staticParts.join('\n\n'),
        dynamic: dynamicParts.join('\n\n'),
      };
    },
  };
}
