import { kernelConfigurations } from '@taucad/types/constants';
import type { KernelId, KernelPreference } from '@taucad/types/constants';

/*
 * The kernel selector's rows and pill faces (automatic kernel selection blueprint D8, approved canvas AKS-8). Pure, so
 * the grouping per host, the unavailable reasons and the pill's words are tested without a browser.
 */

/** Why a row cannot run here. The row stays focusable, and choosing it explains instead of selecting. */
export type KernelRowUnavailable = Readonly<{ badge: string; reason: string }>;

/** One row of the selector: Auto or a catalog kernel. */
export type KernelPickerRow = Readonly<{
  id: KernelPreference;
  name: string;
  /** The second line: what the kernel is for, in plain words (catalog copy, E10). */
  line: string;
  unavailable?: KernelRowUnavailable;
}>;

/** A named group of rows (D8 headings). */
export type KernelPickerGroup = Readonly<{ name: string; items: readonly KernelPickerRow[] }>;

/** Where the selector runs: the desktop shows its native kernels at the top level. */
export type KernelPickerHost = 'web' | 'desktop';

const catalog = new Map(kernelConfigurations.map((entry) => [entry.id, entry]));

const nameOf = (id: KernelId): string => catalog.get(id)?.name ?? id;

/** The Auto row. */
export const autoKernelRow: KernelPickerRow = { id: 'auto', name: 'Auto', line: 'Picks the best kernel for you' };

const desktopOnly: KernelRowUnavailable = {
  badge: 'Desktop',
  reason: 'Runs in Tau Desktop. Download the app to model with it.',
};

const notInThisBuild: KernelRowUnavailable = {
  badge: 'Unavailable',
  reason: 'This build of Tau Desktop does not include it.',
};

const supplierClosed: KernelRowUnavailable = {
  badge: 'Unavailable',
  reason: 'Zoo’s cloud engine is not open yet, so models can’t run on it.',
};

/** D8's grouping table: the top level and the More level, per host, before availability is applied. */
const placement: Record<
  KernelPickerHost,
  Readonly<{
    top: ReadonlyArray<readonly [string, readonly KernelId[]]>;
    more: ReadonlyArray<readonly [string, readonly KernelId[]]>;
  }>
> = {
  web: {
    top: [
      ['BRep', ['replicad']],
      ['Mesh', ['openscad']],
      ['Implicit', ['picovoxel']],
      ['Electronics', ['tscircuit']],
    ],
    more: [
      ['BRep', ['opencascadejs', 'smlib', 'zoo', 'build123d', 'smlibpy']],
      ['Mesh', ['manifold', 'jscad']],
      ['Implicit', ['picogk']],
    ],
  },
  desktop: {
    top: [
      ['BRep', ['replicad', 'build123d', 'smlibpy']],
      ['Mesh', ['openscad']],
      ['Implicit', ['picovoxel', 'picogk']],
      ['Electronics', ['tscircuit']],
    ],
    more: [
      ['BRep', ['opencascadejs', 'smlib', 'zoo']],
      ['Mesh', ['manifold', 'jscad']],
    ],
  },
};

/**
 * The selector's levels for one host.
 *
 * @param input - The host; whether to offer Auto (not on `/projects/new`, which has no prompt to route on); the kernels
 * this runtime executes; and whether Zoo's cloud engine is open.
 * @returns The top level and the More level. A kernel this host cannot run keeps its row with a reason; a kernel the
 * catalog does not have is left out.
 */
export const kernelPickerLayout = (
  input: Readonly<{
    host: KernelPickerHost;
    withAuto: boolean;
    available: ReadonlySet<KernelId>;
    isSupplierOpen: boolean;
  }>,
): Readonly<{ top: readonly KernelPickerGroup[]; more: readonly KernelPickerGroup[] }> => {
  const row = (id: KernelId): KernelPickerRow | undefined => {
    const entry = catalog.get(id);
    if (entry === undefined) {
      return undefined;
    }
    const unavailable =
      id === 'zoo' && !input.isSupplierOpen
        ? supplierClosed
        : input.available.has(id)
          ? undefined
          : input.host === 'desktop'
            ? notInThisBuild
            : desktopOnly;
    return { id, name: entry.name, line: entry.description, ...(unavailable === undefined ? {} : { unavailable }) };
  };
  const groups = (spec: ReadonlyArray<readonly [string, readonly KernelId[]]>): KernelPickerGroup[] =>
    spec
      .map(([name, ids]) => ({
        name,
        items: ids.map((id) => row(id)).filter((item): item is KernelPickerRow => item !== undefined),
      }))
      .filter(({ items }) => items.length > 0);
  const { top, more } = placement[input.host];
  return {
    top: [...(input.withAuto ? [{ name: 'Automatic', items: [autoKernelRow] }] : []), ...groups(top)],
    more: groups(more),
  };
};

/** What the pill shows and says. */
export type KernelPillFace = Readonly<{
  /** The glyph: Auto's, or one kernel's. */
  glyph: KernelPreference;
  text: string;
  /** The accessible name. */
  label: string;
  /** A manual pick that differs from the project's owner kernel. */
  isMismatch: boolean;
  /** What clicking the pill does, for its tooltip. */
  hint: string;
}>;

/**
 * The pill's face from the chat's preference and the project's owner (D8).
 *
 * @param input - The preference, and the owner kernel once the project's entry binds (never on Home).
 * @returns The glyph, text, accessible name, mismatch mark and tooltip.
 */
export const kernelPillFace = (input: Readonly<{ preference: KernelPreference; owner?: KernelId }>): KernelPillFace => {
  const { preference, owner } = input;
  if (preference === 'auto') {
    if (owner !== undefined) {
      const name = nameOf(owner);
      return {
        glyph: owner,
        text: `Auto · ${name}`,
        label: `Kernel: Auto, running ${name}`,
        isMismatch: false,
        hint: `Auto is using ${name}, the kernel this project’s model is written in. Click to pick a kernel for this chat.`,
      };
    }
    return {
      glyph: 'auto',
      text: 'Auto',
      label: 'Kernel: Auto',
      isMismatch: false,
      hint: 'Auto: the agent picks a kernel from your request. Click to choose one yourself.',
    };
  }
  const name = nameOf(preference);
  const isMismatch = owner !== undefined && owner !== preference;
  return {
    glyph: preference,
    text: name,
    label: isMismatch
      ? `Kernel: ${name}, chosen for this chat; the project’s model is ${nameOf(owner)}`
      : `Kernel: ${name}`,
    isMismatch,
    hint: `New models in this chat are written in ${name}. Click to switch, or choose Auto.`,
  };
};
