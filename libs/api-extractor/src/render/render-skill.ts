/**
 * T1 — the skill body, generated from authored doctrine plus a generated map.
 *
 * The split matters: workflow rules, the canonical example and the failure-mode
 * checklist cannot be derived from an API and stay hand-written in the owning
 * package's `agent/doctrine.md`. Frontmatter, the reference map, symbol counts
 * and provenance are generated, so they cannot drift from the corpus.
 *
 * @module
 */

import { estimateTokens } from '#render/shard-plan.js';

/**
 * Ceiling enforced by `apps/ui/app/lib/system-skills-budget.test.ts`.
 *
 * Holds authored doctrine, the generated Core API section and the reference
 * map, and keeps the decisive content inside the first ~5,000 tokens hosts
 * retain for a skill after compaction (`kernel-skill-api-context.md` D1).
 *
 * @public
 */
export const maxSkillBodyTokens = 6000;

/** Policy ceiling on any skill body, from `context-engineering-policy.md` Part 9. @public */
export const maxSkillBodyLines = 500;

/** Ceiling enforced by the same test on the frontmatter description. @public */
export const maxSkillDescriptionChars = 160;

/** Approved Agent Workbench Control skill (B9) ships the 92-line draft verbatim. */
export const workbenchSkillBodyTokens = 2400;
export const workbenchSkillDescriptionChars = 540;

/** Inputs for one generated skill body. @public */
export type SkillRenderOptions = {
  readonly slug: string;
  readonly title: string;
  /** Frontmatter description. Always loaded, so it is capped hard. */
  readonly description: string;
  /** Authored body: workflow, canonical example, failure modes. Verbatim. */
  readonly doctrine: string;
  /** Generated Core API section from `renderCoreApi`, when the owner has one. */
  readonly coreApi?: string;
  /** Generated reference map from `renderReferenceMap`, or absent for a corpus-free skill. */
  readonly referenceMap?: string;
};

/** A rendered skill body and what it cost. @public */
export type RenderedSkill = {
  readonly markdown: string;
  readonly bodyTokens: number;
};

const frontmatter = (options: SkillRenderOptions): string =>
  ['---', `name: ${options.slug}`, `description: ${options.description}`, '---'].join('\n');

/**
 * Render `SKILL.md`.
 *
 * Throws rather than emitting an over-budget body: the ceiling is the pressure
 * that keeps reference content in the tier below, and a generator that silently
 * exceeded it would reintroduce the mega-prompt one skill at a time.
 *
 * @param options - Slug, description, authored doctrine and generated map.
 * @returns The markdown and its measured body cost.
 * @throws If the description or body exceeds its budget.
 * @public
 *
 * @example <caption>A corpus-backed kernel skill</caption>
 * ```typescript
 * import { renderSkill } from '@taucad/api-extractor';
 *
 * const { markdown } = renderSkill({
 *   slug: 'cad-replicad',
 *   title: 'Replicad authoring',
 *   description: 'Guides precise Replicad BRep authoring in main.ts.',
 *   doctrine: '## Workflow\n\n1. Author `main.ts`.\n',
 *   referenceMap: '## API reference\n\nGrep `api-index.md`.\n',
 * });
 * ```
 */
export const renderSkill = (options: SkillRenderOptions): RenderedSkill => {
  const maxDescription = options.slug === 'workbench' ? workbenchSkillDescriptionChars : maxSkillDescriptionChars;
  const maxBody = options.slug === 'workbench' ? workbenchSkillBodyTokens : maxSkillBodyTokens;
  if (options.description.length > maxDescription) {
    throw new RangeError(
      `skill ${options.slug}: description is ${options.description.length} chars, over the ${maxDescription} ceiling`,
    );
  }

  const sections = [`# ${options.title}`, '', options.doctrine.trim()];
  if (options.coreApi !== undefined) {
    sections.push('', options.coreApi.trim());
  }
  if (options.referenceMap !== undefined) {
    sections.push('', options.referenceMap.trim());
  }
  const body = sections.join('\n').trim();
  const bodyTokens = estimateTokens(body);

  if (bodyTokens > maxBody) {
    throw new RangeError(
      `skill ${options.slug}: body is ~${bodyTokens} tokens, over the ${maxBody} ceiling. Move detail into a reference file.`,
    );
  }
  const bodyLines = body.split('\n').length;
  if (bodyLines > maxSkillBodyLines) {
    throw new RangeError(
      `skill ${options.slug}: body is ${bodyLines} lines, over the ${maxSkillBodyLines}-line ceiling.`,
    );
  }

  return { markdown: `${frontmatter(options)}\n\n${body}\n`, bodyTokens };
};
