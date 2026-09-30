import { readFileSync } from 'node:fs';

const inventory = readFileSync(new URL('THIRD_PARTY_LICENSES.md', import.meta.url), 'utf8');
const held = inventory.match(/^## .* — (?:HELD|REVIEW PENDING) \(.*\)$/gmu) ?? [];
if (held.length > 0) {
  throw new Error(`Cannot publish @taucad/tscircuit with held vendored licences:\n${held.join('\n')}`);
}
