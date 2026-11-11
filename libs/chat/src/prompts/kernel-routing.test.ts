import { describe, expect, it } from 'vitest';
import { kernelConfigurations, resolveKernel } from '@taucad/types/constants';
import type { KernelId } from '@taucad/types/constants';
import {
  groupKernelsByRepresentation,
  kernelChoiceCondition,
  renderKernelGuidance,
  renderKernelRoutingCard,
  renderKernelRoutingDigest,
} from '#prompts/kernel-routing.js';
import type { KernelRoutingProfile } from '#prompts/kernel-routing.js';

const catalog: readonly KernelId[] = kernelConfigurations.map(({ id }) => id);
const except = (...ids: readonly KernelId[]): KernelId[] => catalog.filter((id) => !ids.includes(id));

/** Blueprint Appendix C, with Zoo closed on every cloud profile and PicoGK's browser assets not shipped. */
const profiles = {
  web: { available: except('zoo', 'build123d', 'smlibpy', 'picogk') },
  desktop: { available: except('zoo') },
  plugin: { available: except('zoo'), withoutSkill: ['opencascadejs'] },
  selfHost: { available: catalog },
} as const satisfies Record<string, KernelRoutingProfile>;

/**
 * Estimated tokens at four characters a token, the convention `system-skills-budget.test.ts` uses. AKS-1b measured
 * these on 2026-11-10 (card: web 1,932, desktop 2,297, plugin 2,293, self-host 2,376; digest 795 to 970); each
 * ceiling is about 10% above the largest, so a
 * rubric change that grows the text fails here and is re-measured on purpose.
 */
const estimatedTokens = (text: string): number => Math.ceil(text.length / 4);
const ceilings = { card: 2600, digest: 1070, guidance: 2650 } as const;

/** The kernel names in the card's kernel table, in order. */
const tableKernels = (card: string): string[] => {
  const start = card.indexOf('| Kernel | Entry |');
  const table = card.slice(start, card.indexOf('\n\n', start)).split('\n').slice(2);
  return table.map((row) => row.split('|')[1]?.trim() ?? '');
};

const namePattern = (id: KernelId): RegExp =>
  new RegExp(`(?<![\\w-])${resolveKernel(id).name.replaceAll(/[()]/gu, String.raw`\$&`)}(?![\\w-])`, 'u');

describe('renderKernelRoutingCard', () => {
  it.each(Object.entries(profiles))('should list exactly the %s kernels, in the given order', (_name, profile) => {
    expect(tableKernels(renderKernelRoutingCard(profile))).toEqual(
      profile.available.map((id) => resolveKernel(id).name),
    );
  });

  it.each(Object.entries(profiles))('should name no kernel the %s host cannot run', (_name, profile) => {
    const card = renderKernelRoutingCard(profile);
    const missing = catalog.filter((id) => !profile.available.includes(id));
    expect(missing.filter((id) => namePattern(id).test(card))).toEqual([]);
  });

  it('should follow the host order, so the eval can perturb it', () => {
    const reversed = { available: [...profiles.web.available].reverse() };
    expect(tableKernels(renderKernelRoutingCard(reversed))).toEqual(
      reversed.available.map((id) => resolveKernel(id).name),
    );
  });

  it('should name no default kernel (D1)', () => {
    for (const profile of Object.values(profiles)) {
      expect(renderKernelRoutingCard(profile)).not.toMatch(/\bdefault\b/iu);
      expect(renderKernelRoutingDigest(profile)).not.toMatch(/\bdefault\b/iu);
    }
  });

  it('should state the skill a host lacks as none', () => {
    const row = renderKernelRoutingCard(profiles.plugin)
      .split('\n')
      .find((line) => line.startsWith('| OpenCascade |'));
    expect(row?.endsWith('| none |')).toBe(true);
  });

  it('should say a zone has no kernel here rather than drop it', () => {
    const card = renderKernelRoutingCard({ available: except('tscircuit') });
    expect(card).toMatch(/\| U9 Electronics \| narrow \| none available here: say so and offer the nearest \|/u);
  });

  it('should drop a catch-all signal once every other signal is filtered out', () => {
    const card = renderKernelRoutingCard(profiles.web);
    expect(card).toContain('| U5 Assemblies and mechanisms in one domain | narrow | Replicad, OpenCascade |  |');
    expect(renderKernelRoutingCard(profiles.desktop)).toContain('Replicad: none of those');
  });

  it('should keep the rules in order with their survivors', () => {
    const card = renderKernelRoutingCard(profiles.web);
    expect(card).toContain('3. Explicit request:');
    expect(card).toContain('Python: none available here');
    expect(card).toContain('7. Representation: Computational engineering');
    expect(card).toMatch(/7\. Representation: [^\n]*: PicoVoxel\./u);
  });

  it('should hold its measured size', () => {
    const sizes = Object.fromEntries(
      Object.entries(profiles).map(([name, profile]) => [
        name,
        {
          card: estimatedTokens(renderKernelRoutingCard(profile)),
          digest: estimatedTokens(renderKernelRoutingDigest(profile)),
          guidance: estimatedTokens(renderKernelGuidance({ preference: 'auto', profile })),
        },
      ]),
    );
    console.info('kernel routing sizes (estimated tokens)', JSON.stringify(sizes));
    for (const size of Object.values(sizes)) {
      expect(size.card).toBeLessThanOrEqual(ceilings.card);
      expect(size.digest).toBeLessThanOrEqual(ceilings.digest);
      expect(size.guidance).toBeLessThanOrEqual(ceilings.guidance);
    }
  });
});

describe('renderKernelRoutingDigest', () => {
  it.each(Object.entries(profiles))('should give one phrase to each %s kernel and no other', (_name, profile) => {
    const kernels = renderKernelRoutingDigest(profile).split('\nKernels: ')[1] ?? '';
    const phrased = catalog.filter((id) => kernels.split(`${resolveKernel(id).name} (\``).length === 2);
    expect(phrased).toEqual(profile.available);
    expect(kernels.split(' (`').length - 1).toBe(profile.available.length);
  });

  it('should be self-sufficient: the conditional sentence and every rule, pointing at no table', () => {
    const digest = renderKernelRoutingDigest(profiles.plugin);
    expect(digest.startsWith(kernelChoiceCondition)).toBe(true);
    for (const index of [1, 2, 3, 4, 5, 6, 7]) {
      expect(digest).toContain(`(${index}) `);
    }
    expect(digest).not.toMatch(/table|above|below/iu);
  });
});

describe('renderKernelGuidance', () => {
  const owner = { kernel: 'replicad', entryPath: 'main.ts' } as const;

  it('should keep the project kernel under Auto once an entry exists', () => {
    expect(renderKernelGuidance({ preference: 'auto', owner, profile: profiles.web })).toBe(
      "This project's model is written for Replicad (`main.ts`). Activate `cad-replicad`. Keep this kernel; if the request cannot be met in it, say so.",
    );
  });

  it('should give the conditional sentence, the card and the skill step under Auto with no entry', () => {
    const text = renderKernelGuidance({ preference: 'auto', profile: profiles.web });
    expect(text.startsWith(`${kernelChoiceCondition}\n\n`)).toBe(true);
    expect(text).toContain(renderKernelRoutingCard(profiles.web));
    expect(text.endsWith("After choosing, activate that kernel's `cad-` skill before writing.")).toBe(true);
  });

  it("should keep today's sentence for a manual pick with no entry or the same kernel", () => {
    const today = 'This project uses OpenSCAD; activate the cad-openscad skill.';
    expect(renderKernelGuidance({ preference: 'openscad', profile: profiles.web })).toBe(today);
    expect(
      renderKernelGuidance({
        preference: 'openscad',
        owner: { kernel: 'openscad', entryPath: 'main.scad' },
        profile: profiles.web,
      }),
    ).toBe(today);
  });

  it('should name both kernels when a manual pick differs from the project', () => {
    expect(renderKernelGuidance({ preference: 'openscad', owner, profile: profiles.web })).toBe(
      'The person selected OpenSCAD for this chat; the existing model is Replicad (`main.ts`). Write new models in OpenSCAD with `cad-openscad`. Activate `cad-replicad` before editing the existing model. Do not convert existing files unless asked.',
    );
  });
});

describe('groupKernelsByRepresentation', () => {
  it('should place every kernel once, under its representation, in group order', () => {
    const groups = groupKernelsByRepresentation(catalog);
    expect(groups.map(({ label }) => label)).toEqual(['BRep', 'Mesh', 'Implicit', 'Electronics']);
    expect(groups.flatMap(({ kernels }) => kernels).sort()).toEqual([...catalog].sort());
    for (const { representation, kernels } of groups) {
      expect(kernels.every((id) => resolveKernel(id).representation === representation)).toBe(true);
    }
  });

  it('should drop an empty group', () => {
    expect(groupKernelsByRepresentation(['replicad', 'openscad']).map(({ label }) => label)).toEqual(['BRep', 'Mesh']);
  });
});
