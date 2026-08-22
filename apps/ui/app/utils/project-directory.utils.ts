const maxProjectSlugCodePoints = 48;

/** Convert a display name into Tau's bounded, human-readable directory prefix. */
export const projectNameToSlug = (name: string): string => {
  const slug = name
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, '-')
    .replaceAll(/^-+|-+$/g, '');
  return [...(slug || 'project')].slice(0, maxProjectSlugCodePoints).join('').replaceAll(/-+$/g, '') || 'project';
};

/**
 * Resolve `base` against `taken`, appending `-1`, `-2`, … until free.
 * Comparison is case-insensitive because APFS and NTFS are (blueprint F3).
 *
 * @param base - Preferred slug.
 * @param taken - Slugs already in use in the target namespace.
 * @returns The first free slug.
 */
export const allocateSlug = (base: string, taken: ReadonlySet<string>): string => {
  const used = new Set([...taken].map((entry) => entry.toLocaleLowerCase()));
  if (!used.has(base.toLocaleLowerCase())) {
    return base;
  }
  // Terminates: `used` is finite, so some suffix is always free.
  for (let suffix = 1; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate.toLocaleLowerCase())) {
      return candidate;
    }
  }
};

/**
 * Allocate the physical directory basename for a project. The directory name is
 * the slug alone — identity lives in `tau.json` (blueprint D2/D3).
 *
 * @param name - Project display name.
 * @param existingNames - Directory basenames already present at the target root.
 * @returns A collision-free slug.
 */
export const allocateProjectDirectorySlug = (name: string, existingNames: ReadonlySet<string>): string =>
  allocateSlug(projectNameToSlug(name), existingNames);
