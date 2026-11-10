import { kernelRoutingRules, kernelRoutingZones, resolveKernel } from '@taucad/types/constants';
import type { KernelId, KernelPreference, KernelRepresentation } from '@taucad/types/constants';

/*
 * The routing generator (automatic kernel selection blueprint D4): one set of pure renderings over the catalog's
 * routing facets and the D5 table, for every surface that tells an agent how to choose a kernel. Change the rubric in
 * `@taucad/types/constants` (`kernel.constants.ts`, `kernel-routing.constants.ts`), never here or in a rendering's
 * output. Model-read text names no default and no order preference (D1): kernels render in the order the host lists
 * them, which is catalog order in production and perturbed by the eval.
 */

/**
 * What one host can run for the person now. A host builds it from facts, never from the request: what the device
 * can run, what the plan allows (failing closed while it is unresolved), and what the supplier serves (D4).
 *
 * @public
 */
export type KernelRoutingProfile = {
  /** The kernels routing may choose, in the order the rubric lists them. */
  readonly available: readonly KernelId[];
  /** Available kernels whose `cad-` skill this host cannot load (the plugin ships no OpenCascade skill). */
  readonly withoutSkill?: readonly KernelId[];
};

/**
 * The kernel the runtime binds for the project's main entry, when main resolves to a file (D2, "Owner").
 *
 * @public
 */
export type KernelOwner = {
  readonly kernel: KernelId;
  readonly entryPath: string;
};

/**
 * Input of {@link renderKernelGuidance}.
 *
 * @public
 */
export type KernelGuidanceInput = {
  readonly preference: KernelPreference;
  /** Absent while the project is entry-less. */
  readonly owner?: KernelOwner;
  readonly profile: KernelRoutingProfile;
};

/**
 * A selector group: one representation and its kernels in input order.
 *
 * @public
 */
export type KernelGroup = {
  readonly representation: KernelRepresentation;
  readonly label: string;
  readonly kernels: readonly KernelId[];
};

/**
 * The sentence every no-entry text opens with. A first turn's text is frozen and outlives compaction, so it is
 * conditional on the project's state rather than on the turn (D1).
 *
 * @public
 */
export const kernelChoiceCondition =
  "If the project has no model file, choose a kernel before writing one. Once an entry file exists, its kernel is the project's: keep it.";

const groupLabels: Readonly<Record<KernelRepresentation, string>> = {
  brep: 'BRep',
  mesh: 'Mesh',
  voxel: 'Voxel',
  electronics: 'Electronics',
};

const groupOrder: readonly KernelRepresentation[] = ['brep', 'mesh', 'voxel', 'electronics'];

const bindingSentence =
  'The entry file binds the kernel: its extension, and for `.ts`, `.js` and `.py` the library the entry imports.';

const nameOf = (id: KernelId): string => resolveKernel(id).name;

const skillOf = (id: KernelId, profile: KernelRoutingProfile): string | undefined =>
  profile.withoutSkill?.includes(id) ? undefined : `cad-${id}`;

/** The available kernels among `kernels`, in the profile's order. */
const among = (kernels: readonly KernelId[], profile: KernelRoutingProfile): KernelId[] =>
  profile.available.filter((id) => kernels.includes(id));

const names = (kernels: readonly KernelId[]): string => kernels.map((id) => nameOf(id)).join(', ');

const cell = (text: string): string => text.replaceAll('|', String.raw`\|`);

const kernelTable = (profile: KernelRoutingProfile): string => {
  const rows = profile.available.map((id) => {
    const { name, mainFile, routing } = resolveKernel(id);
    const imports = 'imports' in routing ? `\`${routing.imports}\`` : 'none';
    const prerequisites = 'prerequisites' in routing ? routing.prerequisites : 'none';
    const skill = skillOf(id, profile);
    return `| ${name} | \`${mainFile}\` | ${imports} | ${cell(routing.useWhen)} | ${cell(routing.avoidWhen)} | ${cell(prerequisites)} | ${skill ? `\`${skill}\`` : 'none'} |`;
  });
  return [
    '| Kernel | Entry | Imports | Use when | Avoid when | Prerequisites | Skill |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
};

/** One rule as a line; `outcome` joins each signal to its available survivors. */
const ruleLine = (rule: (typeof kernelRoutingRules)[number], profile: KernelRoutingProfile): string => {
  switch (rule.id) {
    case 'ownership': {
      return 'Ownership: when the project has an entry file, keep its kernel. A project never migrates.';
    }
    case 'entitlement': {
      return 'Entitlement: choose only from the kernels available here.';
    }
    default: {
      const outcomes = rule.outcomes.map(({ when, kernels }) => {
        if (kernels.length === 0) {
          return `${when}: that kernel`;
        }
        const available = among(kernels, profile);
        return `${when}: ${available.length > 0 ? names(available) : 'none available here'}`;
      });
      const extras = [
        'whenUnavailable' in rule ? ` ${rule.whenUnavailable}` : '',
        'doesNotFireOn' in rule ? ` Does not fire on ${rule.doesNotFireOn}.` : '',
      ].join('');
      return `${rule.name}: ${outcomes.join('. ')}.${extras}`;
    }
  }
};

const zoneRow = (zone: (typeof kernelRoutingZones)[number], profile: KernelRoutingProfile): string => {
  const acceptable = among(zone.acceptable, profile);
  const announce = 'announce' in zone ? zone.announce : '';
  if (zone.tier === 'none') {
    return `| ${zone.id} ${cell(zone.useCase)} | none | none | ${cell(announce)} |`;
  }
  const signals = zone.preferred
    .map((preference) => ({ ...preference, kernels: among(preference.kernels, profile) }))
    .filter(({ kernels }) => kernels.length > 0);
  const prefer = (signals.some((signal) => !('otherwise' in signal)) ? signals : [])
    .map(({ kernels, when }) => `${names(kernels)}: ${when}`)
    .join('; ');
  const set = acceptable.length > 0 ? names(acceptable) : 'none available here: say so and offer the nearest';
  const advice = [prefer, announce].filter(Boolean).join('. ');
  return `| ${zone.id} ${cell(zone.useCase)} | ${zone.tier} | ${cell(set)} | ${cell(advice)} |`;
};

/**
 * The routing card: the available kernels' facts, the narrow rules, the use-case zones and when to ask or announce.
 * It replaces `/create-model` in the Tau agent's dynamic block and travels in `tau://snapshot` while a project is
 * entry-less (D4).
 *
 * @param profile - The host's available kernels.
 * @returns Markdown with no surrounding tag; the caller places it.
 * @public
 */
export const renderKernelRoutingCard = (profile: KernelRoutingProfile): string =>
  [
    `${bindingSentence} Before writing it, choose the kernel with these rules.`,
    '### Kernels available here',
    kernelTable(profile),
    '### Rules, applied in order; each removes kernels',
    kernelRoutingRules.map((rule, index) => `${index + 1}. ${ruleLine(rule, profile)}`).join('\n'),
    'Two rules with no common survivor, such as a lattice core that must ship as STEP, are a conflict: ask.',
    '### Use cases',
    'In a broad zone every listed kernel is correct: weigh the signals against the request, choose, and name the trade-off you weighed. Do not ask. A request that fits no row is read against the nearest one.',
    [
      '| Use case | Tier | Acceptable | Signals |',
      '| --- | --- | --- | --- |',
      ...kernelRoutingZones.map((zone) => zoneRow(zone, profile)),
    ].join('\n'),
    '### Asking and announcing',
    [
      '- Ask one question only when two rules conflict, when the best fit is not available here and the alternative loses something the request needs, or for a request no kernel fits. Never inside a broad zone.',
      '- Before modelling, say in one sentence which kernel you chose and why; in a broad zone the reason is the trade-off.',
      '- If the host refuses the entry ("No kernel handles…", `PRO_REQUIRED`, or `KERNEL_NOT_PREPARED` when its prerequisites cannot be met), choose again from the kernels above.',
      '- When a kernel reaches a limit (`RESOURCE_LIMIT`), state the limit and stop; do not offer to move the model to another kernel.',
    ].join('\n'),
  ].join('\n\n');

/**
 * The per-turn kernel text (the prompt's `kernel_skill` section, and the snapshot's rendered text): one of D2's four
 * states. A manual pick that matches the owner, or a project with no entry, keeps today's sentence byte for byte.
 *
 * @param input - Preference, owner and the host's profile.
 * @returns The text for the current state.
 * @public
 */
export const renderKernelGuidance = ({ preference, owner, profile }: KernelGuidanceInput): string => {
  if (preference === 'auto') {
    if (owner) {
      const name = nameOf(owner.kernel);
      return `This project's model is written for ${name} (\`${owner.entryPath}\`). Activate \`cad-${owner.kernel}\`. Keep this kernel; if the request cannot be met in it, say so.`;
    }
    return [
      kernelChoiceCondition,
      renderKernelRoutingCard(profile),
      "After choosing, activate that kernel's `cad-` skill before writing.",
    ].join('\n\n');
  }
  const picked = resolveKernel(preference);
  if (!owner || owner.kernel === preference) {
    return `This project uses ${picked.name}; activate the cad-${picked.id} skill.`;
  }
  const existing = nameOf(owner.kernel);
  return `The person selected ${picked.name} for this chat; the existing model is ${existing} (\`${owner.entryPath}\`). Write new models in ${picked.name} with \`cad-${picked.id}\`. Activate \`cad-${owner.kernel}\` before editing the existing model. Do not convert existing files unless asked.`;
};

/**
 * The self-sufficient digest for MCP `initialize` instructions and the `llms.md` "Which kernel" paragraph: the
 * conditional sentence, each narrow rule in one line, and one phrase per available kernel. It points at no table a
 * standalone MCP client cannot reach (D4).
 *
 * @param profile - The host's available kernels.
 * @returns Plain text lines joined by newlines.
 * @public
 */
export const renderKernelRoutingDigest = (profile: KernelRoutingProfile): string =>
  [
    `${kernelChoiceCondition} ${bindingSentence}`,
    `Rules, in order: ${kernelRoutingRules.map((rule, index) => `(${index + 1}) ${ruleLine(rule, profile)}`).join(' ')}`,
    'Ask one question only when two rules conflict or the best fit is not available here; otherwise choose, and say which kernel and why in one sentence before modelling.',
    `Kernels: ${profile.available
      .map((id) => {
        const { name, mainFile, routing } = resolveKernel(id);
        const binding = 'imports' in routing ? `\`${mainFile}\` importing \`${routing.imports}\`` : `\`${mainFile}\``;
        const skill = skillOf(id, profile);
        return `${name} (${binding}${skill ? `, skill \`${skill}\`` : ''}): ${routing.useWhen}.`;
      })
      .join(' ')}`,
  ].join('\n');

/**
 * Group kernels by representation for the selector, BRep, Mesh, Voxel, Electronics, keeping input order within a
 * group and dropping empty groups. Which rows sit under More is layout and belongs to the selector.
 *
 * @param kernels - The kernels to show.
 * @returns The non-empty groups.
 * @public
 */
export const groupKernelsByRepresentation = (kernels: readonly KernelId[]): KernelGroup[] =>
  groupOrder
    .map((representation) => ({
      representation,
      label: groupLabels[representation],
      kernels: kernels.filter((id) => resolveKernel(id).representation === representation),
    }))
    .filter(({ kernels: grouped }) => grouped.length > 0);
