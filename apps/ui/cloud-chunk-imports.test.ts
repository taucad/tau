// @vitest-environment node
/**
 * Gate G1's one-way dependency (adaptive app deployment mode charter, Principal ruling on the request bound): the Cloud
 * chunk must not share a module with a route chunk, because rolldown gives every such module a chunk of its own and
 * each one is a request on Home or the project route. Walked from `cloud-surfaces.lazy.tsx` the way the build resolves
 * it, the chunk's own code (the Cloud-only modules it reaches) imports, at its first Core hop:
 *
 * - reaches no facade outside `cloud/` and no unfunded rendering (`*.unfunded.*`): those are Core, so reaching one
 *   means a Cloud implementation went through a facade;
 * - reaches no route module but the Cloud-only credit leaves;
 * - reaches no other Core module beyond the reviewed list below, which holds the modules every route already loads.
 *   A new entry is a new shared module: render it in Core and hand the chunk a leaf, or give the chunk its own copy
 *   when it is tiny and pure (as `cloud/cloud-legal-url.ts` is), before adding it here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = join(import.meta.dirname, 'app');
const cloudEntry = join(appRoot, 'cloud/cloud-surfaces.lazy.tsx');

/** Route modules the Cloud chunk owns: the credit leaves the facades take from it. */
const cloudOnlyRouteModules = new Set([
  'routes/w.$workspace.$project/chat-receipt-credits.tsx',
  'routes/w.$workspace.$project/chat-error-add-credits.tsx',
]);

/**
 * Core modules the Cloud chunk's own code may import, each with its reason. Every one is already a chunk of its own or
 * part of one every surface's route loads, so sharing it adds no request; none of them queries billing.
 */
const reviewedCoreModules = new Map<string, string>([
  ['hooks/use-settings-dialog.ts', 'the surfaces open Settings on Billing; the shell already loads it'],
  ['hooks/use-models.tsx', "the Cloud model selector reads the shell's model catalogue"],
  ['hooks/active-chat-provider.tsx', "the Cloud model selector reads the active chat's model choice"],
  ['hooks/use-search-parameter.ts', 'the payment return reads and clears its search parameter'],
  ['lib/build-target.ts', 'the payment return tells desktop from web; a constant'],
  ['lib/ask-deadline.ts', 'the one ask deadline (I15), shared with the Core port by design'],
  ['lib/auth-client.ts', "the Billing section reads the signed-in account's email"],
  ['lib/website-origin.ts', "the chunk's own legal-link copy needs the website origin"],
  [
    'components/auth/settings/account/email-deliverability-banner.tsx',
    'the Billing section shows the account email notice the Account section shows',
  ],
]);

/** The facades outside `cloud/`: Core modules that mount a Cloud rendering through `FundedSurface`. */
const facadeModules = new Set([
  'components/chat/chat-model-selector.tsx',
  'components/icons/svg-sprite-mount.tsx',
  'hooks/use-credit-preflight.ts',
  'routes/w.$workspace.$project/chat-details-usage.tsx',
  'routes/w.$workspace.$project/chat-error-credits.tsx',
  'routes/w.$workspace.$project/chat-error-provider-account.tsx',
  'routes/w.$workspace.$project/chat-message-data-usage.tsx',
]);

const isCloudOnly = (module: string): boolean =>
  module.startsWith('cloud/') || /\.funded\.tsx?$/u.test(module) || cloudOnlyRouteModules.has(module);

/** The `#` specifiers a file imports at run time: static imports and re-exports, never `import type`. */
const runtimeSpecifiers = (source: string): string[] =>
  [...source.matchAll(/^(?:import|export)(?!\s+type\b)[^'"]*?from\s+'(#[^']+)'/gmu)].map(([, specifier]) => specifier);

const resolveSpecifier = (specifier: string): string | undefined => {
  const resolved = specifier.split('?')[0] ?? specifier;
  const base = join(appRoot, resolved.slice(1)).replace(/\.js$/u, '');
  return [`${base}.ts`, `${base}.tsx`, `${base}.js`, base].find((candidate) => existsSync(candidate));
};

const toModule = (file: string): string => relative(appRoot, file).replaceAll('\\', '/');

/**
 * The Core modules the Cloud chunk's own code imports directly: the walk follows Cloud-only modules and stops at the
 * first Core module, which is where a shared chunk would start.
 */
const coreImportsOfCloudChunk = (): Set<string> => {
  const seen = new Set<string>([cloudEntry]);
  const core = new Set<string>();
  const queue = [cloudEntry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    for (const specifier of runtimeSpecifiers(readFileSync(file, 'utf8'))) {
      const target = resolveSpecifier(specifier);
      if (target === undefined || seen.has(target)) {
        continue;
      }
      seen.add(target);
      if (file === cloudEntry || isCloudOnly(toModule(target))) {
        queue.push(target);
      } else {
        core.add(toModule(target));
      }
    }
  }
  return core;
};

describe('the Cloud chunk shares no module with a route chunk (gate G1)', () => {
  const modules = coreImportsOfCloudChunk();

  it('reaches no facade and no unfunded rendering', () => {
    expect([...modules].filter((module) => facadeModules.has(module) || /\.unfunded\.tsx?$/u.test(module))).toEqual([]);
  });

  it('reaches no route module but its own credit leaves', () => {
    expect([...modules].filter((module) => module.startsWith('routes/') && !cloudOnlyRouteModules.has(module))).toEqual(
      [],
    );
  });

  it('shares only the reviewed Core modules', () => {
    expect([...modules].filter((module) => !isCloudOnly(module) && !reviewedCoreModules.has(module)).sort()).toEqual(
      [],
    );
  });
});
