import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mirrorEnvironmentSchema } from '#api/git/mirror/config.js';

/**
 * Holds `tau-mirror`'s deploy unit to its shape (W13 DM1): private (no service,
 * so no address), scraped on 9464, built from the API Dockerfile's `mirror`
 * target, and running the same command the image runs.
 */

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8');
const dockerfile = read('../Dockerfile');

describe.each([
  ['fly.staging.toml', 'tau-mirror-staging'],
  ['fly.prod.toml', 'tau-mirror'],
])('apps/mirror/%s', (file, app) => {
  const config = read(`../../mirror/${file}`);

  it('should name its app and the Sydney region', () => {
    expect(config).toMatch(new RegExp(`^app = '${app}'$`, 'mu'));
    expect(config).toMatch(/^primary_region = 'syd'$/mu);
  });

  it('should declare no service of any kind, so the app has no address', () => {
    expect(config).not.toMatch(/^\[http_service\]/mu);
    expect(config).not.toMatch(/^\[\[services\]\]/mu);
    expect(config).not.toMatch(/^release_command/mu);
  });

  it('should run on the 1 GB shared VM the W13 design sizes it for', () => {
    expect(config).toMatch(/^\[\[vm\]\]\nmemory = '1gb'\ncpu_kind = 'shared'\ncpus = 1$/mu);
  });

  it('should be scraped on the exporter port it sets', () => {
    expect(config).toMatch(/^\[\[metrics\]\]\nport = 9464\npath = '\/metrics'$/mu);
    expect(config).toMatch(/^OTEL_METRICS_PORT = '9464'$/mu);
    expect(config).toMatch(/^OTEL_SERVICE_NAME = 'tau-mirror'$/mu);
  });

  it("should build the API Dockerfile's mirror target and run the command that image runs", () => {
    expect(config).toMatch(/^dockerfile = '\.\.\/api\/Dockerfile'$/mu);
    expect(config).toMatch(/^build-target = 'mirror'$/mu);
    expect(config).toMatch(/^mirror = 'node \/app\/dist\/mirror-command\.js worker'$/mu);
    expect(dockerfile).toMatch(
      /^FROM runtime-base AS mirror\n(?:(?!^FROM ).*\n)*CMD \["node", "\/app\/dist\/mirror-command\.js", "worker"\]$/mu,
    );
  });

  it('should set only variables the mirror reads, and none that are secrets', () => {
    const environment = /^\[env\]\n((?:.+\n)+)/mu.exec(config)?.[1] ?? '';
    const names = [...environment.matchAll(/^(\w+) = /gmu)].map((match) => match[1]!);
    const known = new Set([
      ...Object.keys(mirrorEnvironmentSchema.shape),
      'NODE_ENV',
      'OTEL_SERVICE_NAME',
      'OTEL_METRICS_PORT',
    ]);
    expect(names.filter((name) => !known.has(name))).toStrictEqual([]);
    expect(names.filter((name) => /SECRET|ACCESS_KEY|PASSWORD|DATABASE_URL/u.test(name))).toStrictEqual([]);
  });
});

describe('apps/api/Dockerfile', () => {
  it('should keep the API as the last stage, so a build without --target is the API', () => {
    const stages = [...dockerfile.matchAll(/^FROM \S+ AS (\S+)$/gmu)].map((match) => match[1]);
    expect(stages.at(-1)).toBe('runtime');
    expect(stages).toContain('mirror');
  });
});
