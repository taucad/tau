import { execFileSync } from 'node:child_process';

/** Select one installed Apple Development identity by exact name or fingerprint. */
export const selectLocalSigningIdentity = (selection: string, listing: string): string => {
  const identities = [...listing.matchAll(/\b([A-Fa-f0-9]{40}) "(Apple Development: [^"]+)"/gu)].map((match) => ({
    fingerprint: match[1]!,
    name: match[2]!,
  }));
  const matches = identities.filter(
    ({ fingerprint, name }) =>
      selection === 'auto' || selection === name || selection.toUpperCase() === fingerprint.toUpperCase(),
  );
  if (matches.length !== 1) {
    throw new Error(
      'Local signing requires exactly one matching Apple Development certificate. Set TAU_LOCAL_CODESIGN_IDENTITY to its exact name or fingerprint, or auto when only one is installed.',
    );
  }
  return matches[0]!.fingerprint;
};

/** Unset preserves ad-hoc builds; an explicit selection never silently falls back. */
export const localSigningIdentity = (): string | undefined => {
  const selection = process.env['TAU_LOCAL_CODESIGN_IDENTITY'];
  if (selection === undefined) {
    return undefined;
  }
  return selectLocalSigningIdentity(
    selection.trim(),
    execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }),
  );
};
